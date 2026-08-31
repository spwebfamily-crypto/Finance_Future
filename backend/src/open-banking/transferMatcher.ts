import { Prisma } from "@prisma/client";
import type { BankAccountLink, BankTransaction } from "@prisma/client";
import { prisma } from "../prisma.js";

const MATCH_WINDOW_DAYS = 3;

interface AccountRefs {
  accountId: string;
  providerAccountHash: string;
  providerIbanHash: string | null;
}

function dateOf(transaction: BankTransaction) {
  return (
    transaction.bookingDate ??
    transaction.valueDate ??
    transaction.transactionDate ??
    transaction.firstSeenAt
  );
}

function withinWindow(left: BankTransaction, right: BankTransaction) {
  return (
    Math.abs(dateOf(left).getTime() - dateOf(right).getTime()) <= MATCH_WINDOW_DAYS * 86_400_000
  );
}

/**
 * Um lado aponta para o outro quando o hash da contraparte coincide com o hash
 * da conta (IBAN ou identificação do provedor).
 */
function referencesAccount(transaction: BankTransaction, account: AccountRefs) {
  if (!transaction.counterpartyAccountHash) return false;
  return (
    transaction.counterpartyAccountHash === account.providerIbanHash ||
    transaction.counterpartyAccountHash === account.providerAccountHash
  );
}

export interface TransferMatchResult {
  transfersCreated: number;
  pairsLinked: number;
  ambiguous: number;
}

interface Pair {
  debit: BankTransaction;
  credit: BankTransaction;
}

/**
 * Casa débitos e créditos do mesmo valor entre contas próprias ligadas.
 * Só emparelha quando a correspondência é inequívoca: com mais do que um
 * candidato o movimento fica por rever (e nunca é apagado).
 */
export function findTransferPairs(
  debits: BankTransaction[],
  credits: BankTransaction[],
  accounts: Map<string, AccountRefs>,
): { pairs: Pair[]; ambiguous: string[] } {
  const pairs: Pair[] = [];
  const ambiguous: string[] = [];
  const usedDebits = new Set<string>();
  const usedCredits = new Set<string>();

  for (const debit of debits) {
    if (usedDebits.has(debit.id)) continue;
    const debitAccount = accounts.get(debit.bankAccountLinkId);
    if (!debitAccount) continue;

    const candidates = credits.filter((credit) => {
      if (usedCredits.has(credit.id)) return false;
      if (credit.id === debit.id) return false;
      if (credit.currency !== debit.currency) return false;
      if (
        !new Prisma.Decimal(credit.amount as Prisma.Decimal).equals(debit.amount as Prisma.Decimal)
      ) {
        return false;
      }
      if (!withinWindow(debit, credit)) return false;
      const creditAccount = accounts.get(credit.bankAccountLinkId);
      if (!creditAccount) return false;
      if (creditAccount.accountId === debitAccount.accountId) return false;

      const explicit =
        referencesAccount(debit, creditAccount) || referencesAccount(credit, debitAccount);
      const noCounterparty = !debit.counterpartyAccountHash && !credit.counterpartyAccountHash;
      return explicit || noCounterparty;
    });

    if (candidates.length === 1) {
      pairs.push({ debit, credit: candidates[0]! });
      usedDebits.add(debit.id);
      usedCredits.add(candidates[0]!.id);
    } else if (candidates.length > 1) {
      ambiguous.push(debit.id, ...candidates.map((credit) => credit.id));
    }
  }

  return { pairs, ambiguous };
}

/** Cria a Transfer, liga os dois movimentos e remove despesas/rendimentos criados. */
export async function materializeTransfer(pair: Pair): Promise<boolean> {
  const debitAccount = await prisma.bankAccountLink.findUnique({
    where: { id: pair.debit.bankAccountLinkId },
    select: { accountId: true },
  });
  const creditAccount = await prisma.bankAccountLink.findUnique({
    where: { id: pair.credit.bankAccountLinkId },
    select: { accountId: true },
  });
  if (!debitAccount || !creditAccount) return false;

  return prisma.$transaction(async (transaction) => {
    await dematerializeIn(pair.debit, transaction);
    await dematerializeIn(pair.credit, transaction);

    const existing = pair.debit.transferId
      ? await transaction.transfer.findUnique({ where: { id: pair.debit.transferId } })
      : null;
    const transfer = existing
      ? await transaction.transfer.update({
          where: { id: existing.id },
          data: {
            fromAccountId: debitAccount.accountId,
            toAccountId: creditAccount.accountId,
            amount: pair.debit.amount,
            date: dateOf(pair.debit),
            description: "Transferência entre contas",
          },
        })
      : await transaction.transfer.create({
          data: {
            userId: pair.debit.userId,
            fromAccountId: debitAccount.accountId,
            toAccountId: creditAccount.accountId,
            amount: pair.debit.amount,
            date: dateOf(pair.debit),
            description: "Transferência entre contas",
          },
        });

    await transaction.bankTransaction.update({
      where: { id: pair.debit.id },
      data: { transferId: transfer.id, classification: "internal_transfer" },
    });
    await transaction.bankTransaction.update({
      where: { id: pair.credit.id },
      data: { transferId: transfer.id, classification: "internal_transfer" },
    });
    return true;
  });
}

type TransactionClient = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

async function dematerializeIn(transaction_: BankTransaction, client: TransactionClient) {
  if (transaction_.expenseId) {
    await client.expense.delete({ where: { id: transaction_.expenseId } });
  }
  if (transaction_.incomeId) {
    await client.income.delete({ where: { id: transaction_.incomeId } });
  }
  if (transaction_.expenseId || transaction_.incomeId) {
    await client.bankTransaction.update({
      where: { id: transaction_.id },
      data: { expenseId: null, incomeId: null },
    });
  }
}

/** Procura e materializa transferências entre contas próprias de um utilizador. */
export async function matchInternalTransfers(userId: string): Promise<TransferMatchResult> {
  const result: TransferMatchResult = { transfersCreated: 0, pairsLinked: 0, ambiguous: 0 };

  const userAccounts = await prisma.account.findMany({ where: { userId }, select: { id: true } });
  const links = (await prisma.bankAccountLink.findMany({
    where: { accountId: { in: userAccounts.map((account) => account.id as string) } },
    select: { id: true, accountId: true, providerAccountHash: true, providerIbanHash: true },
  })) as Array<
    Pick<BankAccountLink, "id" | "accountId" | "providerAccountHash" | "providerIbanHash">
  >;

  if (links.length < 2) return result;

  const accountRefs = new Map<string, AccountRefs>(
    links.map((link) => [
      link.id,
      {
        accountId: link.accountId,
        providerAccountHash: link.providerAccountHash,
        providerIbanHash: link.providerIbanHash,
      },
    ]),
  );

  const pending = await prisma.bankTransaction.findMany({
    where: {
      userId,
      status: "booked",
      transferId: null,
      classification: { not: "internal_transfer" },
    },
    orderBy: { bookingDate: "asc" },
  });
  const transactions = pending as BankTransaction[];
  const debits = transactions.filter((item) => item.direction === "debit");
  const credits = transactions.filter((item) => item.direction === "credit");

  const { pairs, ambiguous } = findTransferPairs(debits, credits, accountRefs);
  result.ambiguous = new Set(ambiguous).size;

  for (const pair of pairs) {
    const created = await materializeTransfer(pair);
    if (created) {
      result.transfersCreated += 1;
      result.pairsLinked += 2;
    }
  }

  return result;
}
