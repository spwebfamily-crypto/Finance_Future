import { Prisma } from "@prisma/client";
import type { BankConnection } from "@prisma/client";
import { prisma } from "../prisma.js";
import { decryptSessionId } from "./authorizationService.js";
import { encryptString } from "./crypto.js";
import { bankError } from "./errors.js";
import { createOpenBankingProvider } from "./providerFactory.js";

export type Retention = "keep_imported" | "delete_imported";

export interface DisconnectResult {
  connectionId: string;
  retention: Retention;
  accountsKept: number;
  accountsDeleted: number;
  expensesDeleted: number;
  incomesDeleted: number;
  transfersDeleted: number;
  transactionsDeleted: number;
  sessionRevoked: boolean;
}

/**
 * Desconexão controlada e idempotente. Nunca apaga registos manuais: apenas os
 * movimentos e as materializações originados nesta ligação.
 */
export async function disconnectConnection(
  connectionId: string,
  userId: string,
  retention: Retention,
): Promise<DisconnectResult> {
  const connection = (await prisma.bankConnection.findFirst({
    where: { id: connectionId, userId },
  })) as BankConnection | null;
  if (!connection) throw bankError(404, "BANK_CONNECTION_NOT_FOUND");

  const result: DisconnectResult = {
    connectionId,
    retention,
    accountsKept: 0,
    accountsDeleted: 0,
    expensesDeleted: 0,
    incomesDeleted: 0,
    transfersDeleted: 0,
    transactionsDeleted: 0,
    sessionRevoked: false,
  };

  // A sessão do provedor é fechada sempre que possível; uma falha não impede a
  // desconexão local, porque o consentimento também pode ser revogado no banco.
  if (connection.status !== "disconnected") {
    try {
      const provider = createOpenBankingProvider();
      await provider.revokeSession(decryptSessionId(connection));
      result.sessionRevoked = true;
    } catch {
      result.sessionRevoked = false;
    }
  }

  const links = await prisma.bankAccountLink.findMany({
    where: { connectionId },
    select: { id: true, accountId: true },
  });

  if (retention === "keep_imported") {
    for (const link of links) {
      const account = await prisma.account.findUnique({
        where: { id: link.accountId },
        select: {
          id: true,
          openingBalance: true,
          providerCurrentBalance: true,
          providerAvailableBalance: true,
          expenses: { select: { amount: true } },
          incomes: { select: { amount: true } },
          outgoingTransfers: { select: { amount: true } },
          incomingTransfers: { select: { amount: true } },
        },
      });
      if (!account) continue;

      // O saldo visível passa a ser reproduzido pelo saldo derivado.
      const activity = activityBalance(account);
      const snapshot = account.providerCurrentBalance;
      const openingBalance =
        snapshot === null
          ? account.openingBalance
          : new Prisma.Decimal(snapshot).sub(activity).toDecimalPlaces(2);

      await prisma.account.update({
        where: { id: account.id },
        data: {
          source: "manual",
          openingBalance,
          providerCurrentBalance: null,
          providerAvailableBalance: null,
          providerBalanceUpdatedAt: null,
        },
      });
      // O identificador da conta no provedor é removido; o histórico fica.
      await prisma.bankAccountLink.update({
        where: { id: link.id },
        data: { providerAccountIdCiphertext: "", providerIbanHash: null },
      });
      result.accountsKept += 1;
    }

    await prisma.bankConnection.update({
      where: { id: connectionId },
      data: {
        status: "disconnected",
        disconnectedAt: new Date(),
        providerSessionCiphertext: "",
        consentExpiresAt: null,
        nextSyncAt: null,
      },
    });

    console.warn(
      `[open-banking] ligação ${connectionId} desligada com dados conservados (${result.accountsKept} contas)`,
    );
    return result;
  }

  const linkIds = links.map((link) => link.id);

  await prisma.$transaction(async (transaction) => {
    const transactions = await transaction.bankTransaction.findMany({
      where: { bankAccountLinkId: { in: linkIds } },
      select: { id: true, expenseId: true, incomeId: true, transferId: true },
    });
    const expenseIds = transactions
      .map((item) => item.expenseId)
      .filter((id): id is string => typeof id === "string");
    const incomeIds = transactions
      .map((item) => item.incomeId)
      .filter((id): id is string => typeof id === "string");
    const transferIds = transactions
      .map((item) => item.transferId)
      .filter((id): id is string => typeof id === "string");

    if (expenseIds.length) {
      const deleted = await transaction.expense.deleteMany({ where: { id: { in: expenseIds } } });
      result.expensesDeleted = deleted.count;
    }
    if (incomeIds.length) {
      const deleted = await transaction.income.deleteMany({ where: { id: { in: incomeIds } } });
      result.incomesDeleted = deleted.count;
    }
    if (transferIds.length) {
      const deleted = await transaction.transfer.deleteMany({ where: { id: { in: transferIds } } });
      result.transfersDeleted = deleted.count;
    }

    const transactionsDeleted = await transaction.bankTransaction.deleteMany({
      where: { bankAccountLinkId: { in: linkIds } },
    });
    result.transactionsDeleted = transactionsDeleted.count;

    await transaction.bankAccountLink.deleteMany({ where: { id: { in: linkIds } } });

    // Só as contas criadas por esta ligação e sem movimentos manuais são removidas.
    for (const link of links) {
      const account = await transaction.account.findUnique({
        where: { id: link.accountId },
        select: {
          id: true,
          source: true,
          _count: {
            select: {
              expenses: true,
              incomes: true,
              recurringExpenses: true,
              recurringIncomes: true,
            },
          },
        },
      });
      if (!account || account.source !== "bank") continue;
      const hasManualData =
        account._count.expenses > 0 ||
        account._count.incomes > 0 ||
        account._count.recurringExpenses > 0 ||
        account._count.recurringIncomes > 0;
      if (hasManualData) {
        await transaction.account.update({
          where: { id: account.id },
          data: {
            source: "manual",
            providerCurrentBalance: null,
            providerAvailableBalance: null,
            providerBalanceUpdatedAt: null,
          },
        });
        result.accountsKept += 1;
        continue;
      }
      await transaction.account.delete({ where: { id: account.id } });
      result.accountsDeleted += 1;
    }
  });

  await prisma.bankConnection.update({
    where: { id: connectionId },
    data: {
      status: "disconnected",
      disconnectedAt: new Date(),
      providerSessionCiphertext: "",
      consentExpiresAt: null,
      nextSyncAt: null,
    },
  });

  console.warn(
    `[open-banking] ligação ${connectionId} desligada com dados eliminados (${result.transactionsDeleted} movimentos)`,
  );
  return result;
}

function activityBalance(account: {
  incomes: Array<{ amount: Prisma.Decimal }>;
  expenses: Array<{ amount: Prisma.Decimal }>;
  outgoingTransfers: Array<{ amount: Prisma.Decimal }>;
  incomingTransfers: Array<{ amount: Prisma.Decimal }>;
}) {
  return account.incomes
    .reduce((total, item) => total.add(item.amount), new Prisma.Decimal(0))
    .sub(account.expenses.reduce((total, item) => total.add(item.amount), new Prisma.Decimal(0)))
    .sub(
      account.outgoingTransfers.reduce(
        (total, item) => total.add(item.amount),
        new Prisma.Decimal(0),
      ),
    )
    .add(
      account.incomingTransfers.reduce(
        (total, item) => total.add(item.amount),
        new Prisma.Decimal(0),
      ),
    );
}

/**
 * Substitui a sessão cifrada depois de uma reautorização, sem apagar contas ou
 * movimentos anteriores.
 */
export async function replaceSession(connectionId: string, sessionId: string) {
  await prisma.bankConnection.update({
    where: { id: connectionId },
    data: {
      providerSessionCiphertext: encryptString(sessionId),
      status: "active",
      lastErrorCode: null,
      lastErrorAt: null,
    },
  });
}
