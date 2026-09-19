import { Prisma } from "@prisma/client";
import {
  calculateSpendingLevel,
  currentMonthContext,
  moneyNumber,
  monthBounds,
  monthsEndingAt,
  shiftMonth,
} from "./analyticsService.js";
import { prisma } from "../prisma.js";

type PartialError = { section: string; code: string };
type Categories = Awaited<ReturnType<typeof prisma.category.findMany>>;
type Budgets = Awaited<ReturnType<typeof prisma.budget.findMany>>;
type Expenses = Awaited<ReturnType<typeof prisma.expense.findMany>>;
type Incomes = Awaited<ReturnType<typeof prisma.income.findMany>>;
type Transfers = Awaited<ReturnType<typeof prisma.transfer.findMany>>;
type Accounts = Awaited<ReturnType<typeof prisma.account.findMany>>;
type TodayExpense = {
  id: string;
  description: string;
  amount: Prisma.Decimal;
  currency: string | null;
  date: Date;
  createdAt: Date;
  category: { name: string; icon: string | null };
  account: { name: string; source: string; currency: string } | null;
  bankTransaction: { id: string } | null;
};
type TodayIncome = {
  id: string;
  description: string;
  amount: Prisma.Decimal;
  currency: string | null;
  date: Date;
  createdAt: Date;
  account: { name: string; source: string; currency: string } | null;
  bankTransaction: { id: string } | null;
};
type TodayTransfer = {
  id: string;
  description: string | null;
  amount: Prisma.Decimal;
  currency: string | null;
  date: Date;
  createdAt: Date;
  fromAccount: { name: string; currency: string };
  toAccount: { name: string; currency: string };
  bankTransactions: { id: string }[];
};
type OverviewAccount = {
  id: string;
  name: string;
  type: string;
  source: string;
  currency: string;
  openingBalance: Prisma.Decimal;
  creditLimit: Prisma.Decimal | null;
  providerCurrentBalance: Prisma.Decimal | null;
  providerAvailableBalance: Prisma.Decimal | null;
  providerBalanceUpdatedAt: Date | null;
  providerBalanceCurrency: string | null;
  createdAt: Date;
  updatedAt: Date;
  bankAccountLink: { connection: { status: string; lastSyncedAt: Date | null } } | null;
  expenses: { amount: Prisma.Decimal }[];
  incomes: { amount: Prisma.Decimal }[];
  outgoingTransfers: { amount: Prisma.Decimal }[];
  incomingTransfers: { amount: Prisma.Decimal }[];
};

function monthKey(value: Date) {
  return `${value.getUTCFullYear()}-${String(value.getUTCMonth() + 1).padStart(2, "0")}`;
}

function currencyOf(value: string | null, fallback: string) {
  return value || fallback;
}

function sum(values: Prisma.Decimal[]) {
  return values.reduce((total, value) => total.add(value), new Prisma.Decimal(0));
}

function numeric(value: Prisma.Decimal | null | undefined) {
  return value?.toDecimalPlaces(2).toNumber() ?? null;
}

/**
 * Deep read module for the dashboard. Its interface deliberately exposes one
 * user/month request; all query ordering and financial aggregation stay here.
 * It never calls HTTP routes, so legacy routes and the aggregate endpoint can
 * evolve independently without a request loop.
 */
export async function getDashboardOverview(userId: string, requestedMonth?: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { currency: true, timeZone: true },
  });
  const timeZone = user?.timeZone ?? "Europe/Lisbon";
  const currency = user?.currency ?? "EUR";
  const current = currentMonthContext(new Date(), timeZone);
  const month = requestedMonth ?? current.month;
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month) || month > current.month) {
    throw new RangeError("INVALID_MONTH");
  }

  const previousMonth = shiftMonth(month, -1);
  const historyMonths = monthsEndingAt(month, 6);
  const historyStart = monthBounds(historyMonths[0]!).start;
  const selectedBounds = monthBounds(month);
  const today = `${current.month}-${String(current.elapsedDays).padStart(2, "0")}`;
  const todayStart = new Date(`${today}T00:00:00.000Z`);
  const todayEnd = new Date(todayStart.getTime() + 86_400_000);

  const sections = await Promise.allSettled([
    prisma.category.findMany({
      where: { userId },
      orderBy: [{ isDefault: "desc" }, { name: "asc" }],
      select: { id: true, name: true, icon: true, isDefault: true },
    }),
    prisma.budget.findMany({
      where: { userId },
      include: { category: { select: { id: true, name: true, icon: true, isDefault: true } } },
      orderBy: { category: { name: "asc" } },
    }),
    prisma.expense.findMany({
      where: { userId, date: { gte: historyStart, lt: selectedBounds.end } },
      select: { categoryId: true, amount: true, currency: true, date: true },
    }),
    prisma.expense.findMany({
      where: { userId, date: { gte: todayStart, lt: todayEnd } },
      select: {
        id: true,
        description: true,
        amount: true,
        currency: true,
        date: true,
        createdAt: true,
        category: { select: { name: true, icon: true } },
        account: { select: { name: true, source: true, currency: true } },
        bankTransaction: { select: { id: true } },
      },
    }),
    prisma.income.findMany({
      where: { userId, date: { gte: todayStart, lt: todayEnd } },
      select: {
        id: true,
        description: true,
        amount: true,
        currency: true,
        date: true,
        createdAt: true,
        account: { select: { name: true, source: true, currency: true } },
        bankTransaction: { select: { id: true } },
      },
    }),
    prisma.transfer.findMany({
      where: { userId, date: { gte: todayStart, lt: todayEnd } },
      select: {
        id: true,
        description: true,
        amount: true,
        currency: true,
        date: true,
        createdAt: true,
        fromAccount: { select: { name: true, currency: true } },
        toAccount: { select: { name: true, currency: true } },
        bankTransactions: { select: { id: true }, take: 1 },
      },
    }),
    prisma.account.findMany({
      where: { userId },
      orderBy: [{ type: "asc" }, { name: "asc" }],
      select: {
        id: true,
        name: true,
        type: true,
        source: true,
        currency: true,
        openingBalance: true,
        creditLimit: true,
        providerCurrentBalance: true,
        providerAvailableBalance: true,
        providerBalanceUpdatedAt: true,
        providerBalanceCurrency: true,
        createdAt: true,
        updatedAt: true,
        bankAccountLink: {
          select: { connection: { select: { status: true, lastSyncedAt: true } } },
        },
        expenses: { select: { amount: true } },
        incomes: { select: { amount: true } },
        outgoingTransfers: { select: { amount: true } },
        incomingTransfers: { select: { amount: true } },
      },
    }),
  ]);

  const partialErrors: PartialError[] = [];
  const value = <T>(index: number, fallback: T): T => {
    const result = sections[index];
    if (result?.status === "fulfilled") return result.value as T;
    partialErrors.push({
      section: ["categories", "budgets", "summary", "today", "today", "today", "accounts"][index]!,
      code: "UNAVAILABLE",
    });
    return fallback;
  };
  // The aggregate has partial-failure semantics. Values are normalised at the
  // module seam, so callers always receive every section and partialErrors.
  const categories = value<Categories>(0, []);
  const rawBudgets = value<Budgets>(1, []);
  const historyExpenses = value<Expenses>(2, []);
  const todayExpenses = value<Expenses>(3, []) as unknown as TodayExpense[];
  const todayIncomes = value<Incomes>(4, []) as unknown as TodayIncome[];
  const todayTransfers = value<Transfers>(5, []) as unknown as TodayTransfer[];
  const rawAccounts = value<Accounts>(6, []) as unknown as OverviewAccount[];

  const amounts = new Map<string, Map<string, Prisma.Decimal>>();
  const byMonthAndCurrency = new Map<string, Map<string, Prisma.Decimal>>();
  const selectedDailyTotals = new Map<string, Prisma.Decimal>();
  for (const expense of historyExpenses) {
    const expenseMonth = monthKey(expense.date);
    const expenseCurrency = currencyOf(expense.currency, currency);
    const byCategory = amounts.get(expenseMonth) ?? new Map<string, Prisma.Decimal>();
    if (expenseCurrency === currency)
      byCategory.set(
        expense.categoryId,
        (byCategory.get(expense.categoryId) ?? new Prisma.Decimal(0)).add(expense.amount),
      );
    amounts.set(expenseMonth, byCategory);
    if (expenseMonth === month && expenseCurrency === currency) {
      const day = expense.date.toISOString().slice(0, 10);
      selectedDailyTotals.set(
        day,
        (selectedDailyTotals.get(day) ?? new Prisma.Decimal(0)).add(expense.amount),
      );
    }
    byMonthAndCurrency.set(
      expenseMonth,
      new Map(byMonthAndCurrency.get(expenseMonth) ?? []).set(
        expenseCurrency,
        (byMonthAndCurrency.get(expenseMonth)?.get(expenseCurrency) ?? new Prisma.Decimal(0)).add(
          expense.amount,
        ),
      ),
    );
  }
  const currentAmounts = amounts.get(month) ?? new Map<string, Prisma.Decimal>();
  const previousAmounts = amounts.get(previousMonth) ?? new Map<string, Prisma.Decimal>();
  const total = sum([...currentAmounts.values()]);
  const previousTotal = sum([...previousAmounts.values()]);
  const budgetByCategory = new Map(rawBudgets.map((budget) => [budget.categoryId, budget]));
  const budgets = rawBudgets.map((budget) => ({
    ...budget,
    monthlyLimit: moneyNumber(budget.monthlyLimit),
  }));
  const levels = categories.map((category) => {
    const history = monthsEndingAt(shiftMonth(month, -1), 3).map(
      (entry) => amounts.get(entry)?.get(category.id) ?? new Prisma.Decimal(0),
    );
    const budget = budgetByCategory.get(category.id);
    const calc = calculateSpendingLevel({
      currentAmount: currentAmounts.get(category.id) ?? 0,
      historyAmounts: history,
      monthlyLimit: budget?.monthlyLimit,
      isCurrentMonth: month === current.month,
      elapsedDays:
        month === current.month
          ? current.elapsedDays
          : new Date(selectedBounds.end.getTime() - 1).getUTCDate(),
      daysInMonth:
        month === current.month
          ? current.daysInMonth
          : new Date(selectedBounds.end.getTime() - 1).getUTCDate(),
    });
    return {
      category,
      level: calc.level,
      basis: calc.basis,
      currentAmount: moneyNumber(calc.currentAmount),
      projectedAmount: moneyNumber(calc.projectedAmount),
      baselineAmount: calc.baselineAmount ? moneyNumber(calc.baselineAmount) : null,
      comparisonRatio: calc.comparisonRatio?.toDecimalPlaces(4).toNumber() ?? null,
      budget: budget
        ? { ...budget, monthlyLimit: moneyNumber(budget.monthlyLimit), category }
        : null,
      history: monthsEndingAt(shiftMonth(month, -1), 3).map((entry, index) => ({
        month: entry,
        amount: moneyNumber(history[index]!),
      })),
    };
  });
  const summary = {
    month,
    timeZone,
    currency,
    total: moneyNumber(total),
    previousMonthTotal: moneyNumber(previousTotal),
    changeAmount: moneyNumber(total.sub(previousTotal)),
    changePercent: previousTotal.isZero()
      ? null
      : moneyNumber(total.sub(previousTotal).div(previousTotal).mul(100)),
    byDay: [...selectedDailyTotals.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([day, amount]) => ({ day, total: moneyNumber(amount) })),
    byCategory: categories.map((category) => {
      const amount = currentAmounts.get(category.id) ?? new Prisma.Decimal(0);
      const previousAmount = previousAmounts.get(category.id) ?? new Prisma.Decimal(0);
      return {
        category,
        amount: moneyNumber(amount),
        previousAmount: moneyNumber(previousAmount),
        changeAmount: moneyNumber(amount.sub(previousAmount)),
        changePercent: previousAmount.isZero()
          ? null
          : moneyNumber(amount.sub(previousAmount).div(previousAmount).mul(100)),
        sharePercent: total.isZero() ? 0 : moneyNumber(amount.div(total).mul(100)),
      };
    }),
  };
  const trend = {
    timeZone,
    currency,
    series: historyMonths.map((entry) => ({
      month: entry,
      total: moneyNumber(sum([...(amounts.get(entry)?.values() ?? [])])),
      totalsByCurrency: Object.fromEntries(
        [...(byMonthAndCurrency.get(entry) ?? new Map()).entries()].map(
          ([entryCurrency, amount]) => [entryCurrency, moneyNumber(amount)],
        ),
      ),
    })),
  };
  const todayItems = [
    ...todayExpenses
      .filter((item) => !item.account?.currency || item.account.currency === currency)
      .map((item) => ({
        id: item.id,
        type: "expense" as const,
        description: item.description,
        amount: moneyNumber(item.amount),
        currency: currencyOf(item.currency, currency),
        date: item.date,
        createdAt: item.createdAt,
        accountName: item.account?.name ?? null,
        categoryName: item.category.name,
        categoryIcon: item.category.icon,
        source:
          item.bankTransaction || item.account?.source === "bank"
            ? ("bank" as const)
            : ("manual" as const),
      })),
    ...todayIncomes
      .filter((item) => !item.account?.currency || item.account.currency === currency)
      .map((item) => ({
        id: item.id,
        type: "income" as const,
        description: item.description,
        amount: moneyNumber(item.amount),
        currency: currencyOf(item.currency, currency),
        date: item.date,
        createdAt: item.createdAt,
        accountName: item.account?.name ?? null,
        categoryName: null,
        categoryIcon: null,
        source:
          item.bankTransaction || item.account?.source === "bank"
            ? ("bank" as const)
            : ("manual" as const),
      })),
    ...todayTransfers
      .filter(
        (item) =>
          (!item.fromAccount.currency || item.fromAccount.currency === currency) &&
          (!item.toAccount.currency || item.toAccount.currency === currency),
      )
      .map((item) => ({
        id: item.id,
        type: "transfer" as const,
        description: item.description || `Transferência para ${item.toAccount.name}`,
        amount: moneyNumber(item.amount),
        currency: currencyOf(item.currency, currency),
        date: item.date,
        createdAt: item.createdAt,
        accountName: `${item.fromAccount.name} → ${item.toAccount.name}`,
        categoryName: null,
        categoryIcon: null,
        source: item.bankTransactions.length ? ("bank" as const) : ("manual" as const),
      })),
  ].sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime());
  const todaySummary = {
    date: today,
    timeZone,
    currency,
    expenseTotal: todayItems
      .filter((item) => item.type === "expense")
      .reduce((totalValue, item) => totalValue + item.amount, 0),
    incomeTotal: todayItems
      .filter((item) => item.type === "income")
      .reduce((totalValue, item) => totalValue + item.amount, 0),
    netTotal: 0,
    items: todayItems.map(({ createdAt: _createdAt, ...item }) => item),
  };
  todaySummary.netTotal = todaySummary.incomeTotal - todaySummary.expenseTotal;
  const accounts = rawAccounts.map((account) => {
    const linked = account.source === "bank";
    const provider = account.providerCurrentBalance ?? account.providerAvailableBalance;
    const compatible = provider !== null && account.providerBalanceCurrency === account.currency;
    const derived = account.openingBalance
      .add(sum(account.incomes.map((item: { amount: Prisma.Decimal }) => item.amount)))
      .sub(sum(account.expenses.map((item: { amount: Prisma.Decimal }) => item.amount)))
      .sub(sum(account.outgoingTransfers.map((item: { amount: Prisma.Decimal }) => item.amount)))
      .add(sum(account.incomingTransfers.map((item: { amount: Prisma.Decimal }) => item.amount)));
    const balance = linked ? (compatible ? numeric(provider) : null) : numeric(derived);
    return {
      id: account.id,
      name: account.name,
      type: account.type,
      source: account.source,
      currency: account.currency,
      openingBalance: numeric(account.openingBalance)!,
      creditLimit: numeric(account.creditLimit),
      currentBalance: balance,
      availableBalance: linked && compatible ? numeric(account.providerAvailableBalance) : null,
      derivedBalance: linked ? null : balance,
      providerBalance: linked && compatible ? balance : null,
      balanceDelta: null,
      balanceSource: linked ? (compatible ? "provider" : "unavailable") : "derived",
      balanceLabel: linked
        ? compatible
          ? account.providerCurrentBalance
            ? "Saldo contabilístico"
            : "Saldo disponível"
          : null
        : "Saldo contabilístico",
      balanceAsOf: linked && compatible ? account.providerBalanceUpdatedAt : null,
      connectionStatus: account.bankAccountLink?.connection.status ?? null,
      lastSyncedAt: account.bankAccountLink?.connection.lastSyncedAt ?? null,
      createdAt: account.createdAt,
      updatedAt: account.updatedAt,
    };
  });

  return {
    summary,
    today: todaySummary,
    levels,
    trend,
    budgets,
    categories,
    accounts,
    partialErrors,
  };
}
