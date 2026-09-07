import { Prisma } from "@prisma/client";
import { prisma } from "../prisma.js";

const duplicateCandidateSelect = {
  id: true,
  userId: true,
  providerEntryReference: true,
  status: true,
  classification: true,
  expenseId: true,
  incomeId: true,
  transferId: true,
  firstSeenAt: true,
  bankAccountLink: {
    select: {
      providerAccountHash: true,
      connection: { select: { provider: true } },
    },
  },
} satisfies Prisma.BankTransactionSelect;

type DuplicateCandidate = Prisma.BankTransactionGetPayload<{
  select: typeof duplicateCandidateSelect;
}>;

export interface DuplicateCleanupResult {
  groupsFound: number;
  transactionsRemoved: number;
  expensesRemoved: number;
  incomesRemoved: number;
  conflictsSkipped: number;
}

function groupKey(transaction: DuplicateCandidate) {
  return [
    transaction.userId,
    transaction.bankAccountLink.connection.provider,
    transaction.bankAccountLink.providerAccountHash,
    transaction.providerEntryReference,
  ].join("|");
}

function canonicalScore(transaction: DuplicateCandidate) {
  return (
    (transaction.status === "booked" ? 100 : 0) +
    (transaction.transferId ? 30 : 0) +
    (transaction.expenseId || transaction.incomeId ? 20 : 0)
  );
}

function orderCandidates(left: DuplicateCandidate, right: DuplicateCandidate) {
  const score = canonicalScore(right) - canonicalScore(left);
  if (score !== 0) return score;
  const firstSeen = left.firstSeenAt.getTime() - right.firstSeenAt.getTime();
  return firstSeen !== 0 ? firstSeen : left.id.localeCompare(right.id);
}

/**
 * Remove apenas duplicados comprovados pela referência estável do provedor,
 * na mesma conta lógica e para o mesmo utilizador. Fallbacks por data/valor/
 * descrição não são apagados automaticamente porque duas compras iguais podem
 * ser legítimas.
 *
 * O modo padrão é auditoria (`apply=false`). Quando aplicado, conserva o
 * registo contabilizado mais completo e remove as despesas/rendimentos que
 * pertenciam exclusivamente às cópias.
 */
export async function cleanupStableBankTransactionDuplicates(
  options: { userId?: string; apply?: boolean } = {},
): Promise<DuplicateCleanupResult> {
  const result: DuplicateCleanupResult = {
    groupsFound: 0,
    transactionsRemoved: 0,
    expensesRemoved: 0,
    incomesRemoved: 0,
    conflictsSkipped: 0,
  };

  const candidates = await prisma.bankTransaction.findMany({
    where: {
      providerEntryReference: { not: null },
      ...(options.userId ? { userId: options.userId } : {}),
    },
    select: duplicateCandidateSelect,
  });

  const groups = new Map<string, DuplicateCandidate[]>();
  for (const candidate of candidates) {
    const key = groupKey(candidate);
    const group = groups.get(key) ?? [];
    group.push(candidate);
    groups.set(key, group);
  }

  for (const group of groups.values()) {
    if (group.length < 2) continue;
    result.groupsFound += 1;

    const ordered = [...group].sort(orderCandidates);
    const canonical = ordered[0]!;
    const duplicates = ordered.slice(1);

    // Transferências precisam de dois lados. Se existirem transferências
    // diferentes no mesmo grupo, nada é eliminado automaticamente.
    const transferIds = new Set(group.map((item) => item.transferId).filter(Boolean));
    if (transferIds.size > 1) {
      result.conflictsSkipped += duplicates.length;
      continue;
    }

    if (!options.apply) {
      result.transactionsRemoved += duplicates.length;
      result.expensesRemoved += duplicates.filter((item) => item.expenseId).length;
      result.incomesRemoved += duplicates.filter((item) => item.incomeId).length;
      continue;
    }

    await prisma.$transaction(async (client) => {
      let canonicalExpenseId = canonical.expenseId;
      let canonicalIncomeId = canonical.incomeId;
      let canonicalTransferId = canonical.transferId;

      for (const duplicate of duplicates) {
        if (!canonicalExpenseId && duplicate.expenseId) {
          await client.bankTransaction.update({
            where: { id: duplicate.id },
            data: { expenseId: null },
          });
          await client.bankTransaction.update({
            where: { id: canonical.id },
            data: { expenseId: duplicate.expenseId, classification: duplicate.classification },
          });
          canonicalExpenseId = duplicate.expenseId;
        } else if (duplicate.expenseId) {
          await client.bankTransaction.update({
            where: { id: duplicate.id },
            data: { expenseId: null },
          });
          await client.expense.delete({ where: { id: duplicate.expenseId } });
          result.expensesRemoved += 1;
        }

        if (!canonicalIncomeId && duplicate.incomeId) {
          await client.bankTransaction.update({
            where: { id: duplicate.id },
            data: { incomeId: null },
          });
          await client.bankTransaction.update({
            where: { id: canonical.id },
            data: { incomeId: duplicate.incomeId, classification: duplicate.classification },
          });
          canonicalIncomeId = duplicate.incomeId;
        } else if (duplicate.incomeId) {
          await client.bankTransaction.update({
            where: { id: duplicate.id },
            data: { incomeId: null },
          });
          await client.income.delete({ where: { id: duplicate.incomeId } });
          result.incomesRemoved += 1;
        }

        if (!canonicalTransferId && duplicate.transferId) {
          await client.bankTransaction.update({
            where: { id: canonical.id },
            data: { transferId: duplicate.transferId, classification: "internal_transfer" },
          });
          canonicalTransferId = duplicate.transferId;
        }

        await client.bankTransaction.delete({ where: { id: duplicate.id } });
        result.transactionsRemoved += 1;
      }
    });
  }

  return result;
}
