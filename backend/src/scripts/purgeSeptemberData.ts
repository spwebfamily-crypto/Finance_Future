import "dotenv/config";
import { prisma } from "../prisma.js";

function argument(name: string) {
  const prefix = `--${name}=`;
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length);
}

const year = Number(argument("year") ?? new Date().getUTCFullYear());
if (process.argv.includes("--apply")) {
  throw new Error(
    "Purge destrutivo de setembro está bloqueado permanentemente. Use apenas a pré-visualização sem --apply.",
  );
}

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

  process.stdout.write(`${JSON.stringify({ mode: "dry-run", ...summary }, null, 2)}\n`);
  process.stdout.write("Nada foi apagado: este comando é somente leitura.\n");
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
