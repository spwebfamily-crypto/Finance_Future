import { Prisma } from "@prisma/client";
import type { BankTransaction } from "@prisma/client";
import { prisma } from "../prisma.js";
import { sanitizeText } from "./normalize.js";

export interface MaterializationCounters {
  expensesCreated: number;
  incomesCreated: number;
  refundsDetected: number;
  skipped: number;
  categoryCreated: number;
  dematerialized: number;
}

/**
 * Só movimentos contabilizados (`booked`) são materializados. Pendentes nunca
 * criam despesa nem rendimento e por isso não entram nas análises.
 */
export const MATERIALIZABLE_STATUS = "booked";

const REFUND_WINDOW_DAYS = 45;

function transactionDate(transaction: BankTransaction): Date {
  return (
    transaction.bookingDate ??
    transaction.valueDate ??
    transaction.transactionDate ??
    transaction.firstSeenAt
  );
}

function dayDifference(left: Date, right: Date) {
  return Math.abs(left.getTime() - right.getTime()) / 86_400_000;
}

/** Garante que existe uma categoria fallback ("Outros" ou a primeira do utilizador). */
async function getOrCreateFallbackCategoryId(
  userId: string,
): Promise<{ id: string; created: boolean }> {
  const outros = await prisma.category.findFirst({
    where: { userId, name: "Outros" },
    select: { id: true },
  });
  if (outros) return { id: outros.id, created: false };

  const def = await prisma.category.findFirst({
    where: { userId, isDefault: true },
    select: { id: true },
  });
  if (def) return { id: def.id, created: false };

  const any = await prisma.category.findFirst({ where: { userId }, select: { id: true } });
  if (any) return { id: any.id, created: false };

  const created = await prisma.category.create({
    data: { userId, name: "Outros", icon: "sparkles", isDefault: true },
  });
  return { id: created.id, created: true };
}

/** Obtém ID de categoria, criando fallback se necessário. */
async function defaultCategoryId(userId: string): Promise<{ id: string; created: boolean }> {
  return getOrCreateFallbackCategoryId(userId);
}

/**
 * Remove a materialização existente de um movimento e limpa a referência no
 * BankTransaction. Devolve `true` se algo foi removido.
 */
async function removeMaterialization(transaction: BankTransaction): Promise<boolean> {
  let removed = false;
  if (transaction.expenseId) {
    await prisma.expense.delete({ where: { id: transaction.expenseId } });
    removed = true;
  }
  if (transaction.incomeId) {
    await prisma.income.delete({ where: { id: transaction.incomeId } });
    removed = true;
  }
  if (removed) {
    await prisma.bankTransaction.update({
      where: { id: transaction.id },
      data: { expenseId: null, incomeId: null },
    });
  }
  return removed;
}

/**
 * Crédito que parece reembolso de um débito recente: fica classificado como
 * `refund` e não é assumido como rendimento.
 */
async function looksLikeRefund(transaction: BankTransaction): Promise<boolean> {
  const date = transactionDate(transaction);
  const candidates = await prisma.bankTransaction.findMany({
    where: {
      userId: transaction.userId,
      direction: "debit",
      status: "booked",
      currency: transaction.currency,
      amount: transaction.amount,
      id: { not: transaction.id },
    },
    select: {
      id: true,
      bookingDate: true,
      valueDate: true,
      transactionDate: true,
      counterpartyName: true,
      description: true,
      firstSeenAt: true,
    },
    take: 50,
  });

  return candidates.some((candidate) => {
    const candidateDate =
      candidate.bookingDate ??
      candidate.valueDate ??
      candidate.transactionDate ??
      candidate.firstSeenAt;
    if (dayDifference(candidateDate, date) > REFUND_WINDOW_DAYS) return false;
    if (transaction.counterpartyName && candidate.counterpartyName) {
      return transaction.counterpartyName === candidate.counterpartyName;
    }
    return transaction.description === candidate.description;
  });
}

async function materializeExpense(transaction: BankTransaction, categoryId: string) {
  const existing = transaction.expenseId
    ? await prisma.expense.findUnique({ where: { id: transaction.expenseId } })
    : null;
  const description = sanitizeText(transaction.description, 200) || "Movimento bancário";
  const location = sanitizeText(transaction.counterpartyName, 200) || "Movimento bancário";

  if (existing) {
    // A categoria escolhida pelo utilizador é preservada: só o texto acompanha.
    await prisma.expense.update({
      where: { id: existing.id },
      data: {
        description,
        location,
        amount: transaction.amount,
        date: transactionDate(transaction),
      },
    });
    return false;
  }

  const expense = await prisma.expense.create({
    data: {
      userId: transaction.userId,
      categoryId,
      accountId: (await accountIdFor(transaction)) ?? null,
      description,
      location,
      amount: transaction.amount,
      date: transactionDate(transaction),
    },
    select: { id: true },
  });
  await prisma.bankTransaction.update({
    where: { id: transaction.id },
    data: { expenseId: expense.id, classification: "expense" },
  });
  return true;
}

async function materializeIncome(transaction: BankTransaction) {
  const existing = transaction.incomeId
    ? await prisma.income.findUnique({ where: { id: transaction.incomeId } })
    : null;
  const description = sanitizeText(transaction.description, 200) || "Movimento bancário";

  if (existing) {
    await prisma.income.update({
      where: { id: existing.id },
      data: {
        description,
        source: sanitizeText(transaction.counterpartyName, 120) || null,
        amount: transaction.amount,
        date: transactionDate(transaction),
      },
    });
    return false;
  }

  const income = await prisma.income.create({
    data: {
      userId: transaction.userId,
      accountId: (await accountIdFor(transaction)) ?? null,
      description,
      source: sanitizeText(transaction.counterpartyName, 120) || null,
      amount: transaction.amount,
      date: transactionDate(transaction),
    },
    select: { id: true },
  });
  await prisma.bankTransaction.update({
    where: { id: transaction.id },
    data: { incomeId: income.id, classification: "income" },
  });
  return true;
}

async function accountIdFor(transaction: BankTransaction): Promise<string | null> {
  const link = await prisma.bankAccountLink.findUnique({
    where: { id: transaction.bankAccountLinkId },
    select: { accountId: true },
  });
  return link?.accountId ?? null;
}

export async function materializeBookedTransactions(
  userId: string,
  linkId?: string,
): Promise<MaterializationCounters> {
  const counters: MaterializationCounters = {
    expensesCreated: 0,
    incomesCreated: 0,
    refundsDetected: 0,
    skipped: 0,
    categoryCreated: 0,
    dematerialized: 0,
  };

  const transactions = await prisma.bankTransaction.findMany({
    where: {
      userId,
      status: MATERIALIZABLE_STATUS,
      ...(linkId ? { bankAccountLinkId: linkId } : {}),
    },
    orderBy: { bookingDate: "asc" },
  });

  let categoryId: string | null = null;

  for (const transaction of transactions as BankTransaction[]) {
    // 1) Transferência própria emparelhada — nunca materializa, mas garante que
    // não tenha despesa/rendimento órfão.
    if (transaction.classification === "internal_transfer") {
      const removed = await removeMaterialization(transaction);
      if (removed) counters.dematerialized += 1;
      counters.skipped += 1;
      continue;
    }

    // 2) Utilizador pediu para ignorar/excluir — remove materialização existente.
    if (transaction.classification === "ignored" || transaction.excludedFromAnalytics) {
      const removed = await removeMaterialization(transaction);
      if (removed) counters.dematerialized += 1;
      counters.skipped += 1;
      continue;
    }

    // 3) Débito = despesa
    if (transaction.direction === "debit") {
      if (transaction.transferId) {
        // Já emparelhado como transferência (mas classification não internal_transfer?).
        // Remove materialização órfã se houver.
        const removed = await removeMaterialization(transaction);
        if (removed) counters.dematerialized += 1;
        counters.skipped += 1;
        continue;
      }
      if (!categoryId) {
        const fallback = await defaultCategoryId(userId);
        categoryId = fallback.id;
        if (fallback.created) counters.categoryCreated += 1;
      }
      const created = await materializeExpense(transaction, categoryId);
      if (created) counters.expensesCreated += 1;
      continue;
    }

    // 4) Crédito = rendimento (exceto se já for transferência)
    if (transaction.transferId) {
      const removed = await removeMaterialization(transaction);
      if (removed) counters.dematerialized += 1;
      counters.skipped += 1;
      continue;
    }
    if (transaction.classification !== "income") {
      const isRefund = await looksLikeRefund(transaction);
      if (isRefund) {
        await prisma.bankTransaction.update({
          where: { id: transaction.id },
          data: { classification: "refund" },
        });
        counters.refundsDetected += 1;
        continue;
      }
    }

    const created = await materializeIncome(transaction);
    if (created) counters.incomesCreated += 1;
  }

  return counters;
}

/** Remove a materialização de um movimento (usado pelo emparelhamento de transferências). */
export async function dematerialize(transaction: BankTransaction) {
  await removeMaterialization(transaction);
}

export function amountOf(transaction: BankTransaction): Prisma.Decimal {
  return new Prisma.Decimal(transaction.amount as Prisma.Decimal);
}
