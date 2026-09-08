import "dotenv/config";
import { prisma } from "../prisma.js";

function argument(name: string) {
  const prefix = `--${name}=`;
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length);
}

const year = Number(argument("year") ?? new Date().getUTCFullYear());
const apply = process.argv.includes("--apply");

if (!Number.isInteger(year) || year < 2000 || year > 2200) {
  throw new Error("Use --year=AAAA com um ano válido.");
}

const start = new Date(Date.UTC(year, 8, 1));
const end = new Date(Date.UTC(year, 9, 1));
const inPeriod = { gte: start, lt: end };
const effectiveBankDate = {
  OR: [
    { bookingDate: inPeriod },
    { bookingDate: null, valueDate: inPeriod },
    { bookingDate: null, valueDate: null, transactionDate: inPeriod },
    { bookingDate: null, valueDate: null, transactionDate: null, firstSeenAt: inPeriod },
  ],
};

async function inspect() {
  const [bankTransactions, expenses, incomes, transfers, syncJobs] = await Promise.all([
    prisma.bankTransaction.findMany({
      where: effectiveBankDate,
      select: { id: true, expenseId: true, incomeId: true, transferId: true },
    }),
    prisma.expense.count({ where: { date: inPeriod } }),
    prisma.income.count({ where: { date: inPeriod } }),
    prisma.transfer.count({ where: { date: inPeriod } }),
    prisma.bankSyncJob.count({ where: { createdAt: inPeriod } }),
  ]);
  return { bankTransactions, expenses, incomes, transfers, syncJobs };
}

async function main() {
  const found = await inspect();
  const summary = {
    period: `${year}-09`,
    bankTransactions: found.bankTransactions.length,
    expenses: found.expenses,
    incomes: found.incomes,
    transfers: found.transfers,
    syncJobs: found.syncJobs,
  };

  if (!apply) {
    process.stdout.write(`${JSON.stringify({ mode: "dry-run", ...summary }, null, 2)}\n`);
    process.stdout.write(
      "Nada foi apagado. Repita com --apply depois de confirmar o destino da DATABASE_URL.\n",
    );
    return;
  }

  const expenseIds = found.bankTransactions.flatMap((item) =>
    item.expenseId ? [item.expenseId] : [],
  );
  const incomeIds = found.bankTransactions.flatMap((item) =>
    item.incomeId ? [item.incomeId] : [],
  );
  const transferIds = found.bankTransactions.flatMap((item) =>
    item.transferId ? [item.transferId] : [],
  );

  const result = await prisma.$transaction(async (client) => {
    const deletedBankTransactions = await client.bankTransaction.deleteMany({
      where: effectiveBankDate,
    });
    const deletedExpenses = await client.expense.deleteMany({
      where: {
        OR: [{ date: inPeriod }, ...(expenseIds.length ? [{ id: { in: expenseIds } }] : [])],
      },
    });
    const deletedIncomes = await client.income.deleteMany({
      where: { OR: [{ date: inPeriod }, ...(incomeIds.length ? [{ id: { in: incomeIds } }] : [])] },
    });
    const deletedTransfers = await client.transfer.deleteMany({
      where: {
        OR: [{ date: inPeriod }, ...(transferIds.length ? [{ id: { in: transferIds } }] : [])],
      },
    });
    const deletedSyncJobs = await client.bankSyncJob.deleteMany({ where: { createdAt: inPeriod } });

    await client.recurringExpense.updateMany({
      where: { lastPaidAt: inPeriod },
      data: { lastPaidAt: null },
    });
    await client.recurringIncome.updateMany({
      where: { lastReceivedAt: inPeriod },
      data: { lastReceivedAt: null },
    });
    await client.bankAccountLink.updateMany({
      data: { lastTransactionSyncAt: null },
    });
    await client.bankConnection.updateMany({
      data: { lastSyncedAt: null, nextSyncAt: null },
    });
    await client.account.updateMany({
      where: { source: "bank" },
      data: {
        providerCurrentBalance: null,
        providerAvailableBalance: null,
        providerBalanceUpdatedAt: null,
      },
    });

    return {
      bankTransactions: deletedBankTransactions.count,
      expenses: deletedExpenses.count,
      incomes: deletedIncomes.count,
      transfers: deletedTransfers.count,
      syncJobs: deletedSyncJobs.count,
    };
  });

  process.stdout.write(
    `${JSON.stringify({ mode: "applied", period: `${year}-09`, deleted: result }, null, 2)}\n`,
  );
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
