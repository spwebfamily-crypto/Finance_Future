import { Prisma } from "@prisma/client";
import type { BankTransaction } from "@prisma/client";
import { prisma } from "../prisma.js";
import { isReservedCategoryName } from "../services/categoryPolicy.js";
import { sanitizeText } from "./normalize.js";

export interface MaterializationCounters {
  expensesCreated: number;
  incomesCreated: number;
  refundsDetected: number;
  skipped: number;
  awaitingReview: number;
  dematerialized: number;
}

/**
 * Uma despesa só nasce depois de o utilizador a confirmar. A confirmação pode
 * acontecer enquanto o banco ainda marca o movimento como pendente; por isso
 * o materializador aceita os dois estados, mas apenas para classificações
 * explícitas (`expense`). Rendimentos continuam a exigir um movimento
 * contabilizado.
 */
export const MATERIALIZABLE_STATUSES = ["booked", "pending"] as const;

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

async function materializeExpense(transaction: BankTransaction, categoryId?: string) {
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
        currency: transaction.currency,
        date: transactionDate(transaction),
      },
    });
    return false;
  }

  // Uma despesa nova nunca pode nascer sem uma escolha explícita do utilizador.
  // O movimento permanece em revisão e volta a ser processado após a seleção.
  if (!categoryId) return false;

  const expense = await prisma.expense.create({
    data: {
      userId: transaction.userId,
      categoryId,
      accountId: (await accountIdFor(transaction)) ?? null,
      description,
      location,
      amount: transaction.amount,
      currency: transaction.currency,
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
        currency: transaction.currency,
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
      currency: transaction.currency,
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

async function validExpenseCategoryId(userId: string, categoryId: string | undefined) {
  if (!categoryId) return null;
  const category = await prisma.category.findFirst({
    where: { id: categoryId, userId },
    select: { id: true, name: true },
  });
  return category && !isReservedCategoryName(category.name) ? category.id : null;
}

export async function materializeBookedTransactions(
  userId: string,
  linkId?: string,
  categoryByTransactionId: ReadonlyMap<string, string> = new Map(),
): Promise<MaterializationCounters> {
  const counters: MaterializationCounters = {
    expensesCreated: 0,
    incomesCreated: 0,
    refundsDetected: 0,
    skipped: 0,
    awaitingReview: 0,
    dematerialized: 0,
  };

  const transactions = await prisma.bankTransaction.findMany({
    where: {
      userId,
      status: { in: [...MATERIALIZABLE_STATUSES] },
      ...(linkId ? { bankAccountLinkId: linkId } : {}),
    },
    orderBy: { bookingDate: "asc" },
  });

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

    // 3) Débitos só entram depois de confirmação explícita. Isto evita que
    // transferências, autorizações pendentes ou débitos desconhecidos criem
    // falsos gastos no painel.
    if (transaction.direction === "debit") {
      if (transaction.transferId) {
        // Já emparelhado como transferência (mas classification não internal_transfer?).
        // Remove materialização órfã se houver.
        const removed = await removeMaterialization(transaction);
        if (removed) counters.dematerialized += 1;
        counters.skipped += 1;
        continue;
      }
      if (transaction.classification !== "expense") {
        const removed = await removeMaterialization(transaction);
        if (removed) counters.dematerialized += 1;
        if (transaction.status === "pending" && transaction.classification === "unreviewed") {
          await prisma.bankTransaction.update({
            where: { id: transaction.id },
            data: { classification: "unreviewed", reviewedAt: null },
          });
          counters.awaitingReview += 1;
        }
        counters.skipped += 1;
        continue;
      }
      const selectedCategoryId = await validExpenseCategoryId(
        transaction.userId,
        categoryByTransactionId.get(transaction.id) ?? undefined,
      );
      if (!selectedCategoryId && !transaction.expenseId) {
        await prisma.bankTransaction.update({
          where: { id: transaction.id },
          data: { classification: "unreviewed", reviewedAt: null },
        });
        counters.awaitingReview += 1;
        counters.skipped += 1;
        continue;
      }
      const created = await materializeExpense(transaction, selectedCategoryId ?? undefined);
      if (created) counters.expensesCreated += 1;
      continue;
    }

    // 4) Crédito só entra depois de classificação explícita. Isto também
    // permite que um pending confirmado siga o mesmo fluxo de revisão.
    if (transaction.transferId) {
      const removed = await removeMaterialization(transaction);
      if (removed) counters.dematerialized += 1;
      counters.skipped += 1;
      continue;
    }
    if (transaction.classification !== "income") {
      if (transaction.status !== "booked") {
        await prisma.bankTransaction.update({
          where: { id: transaction.id },
          data: { classification: "unreviewed", reviewedAt: null },
        });
        counters.awaitingReview += 1;
        counters.skipped += 1;
        continue;
      }
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
