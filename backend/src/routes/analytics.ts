import { Prisma } from "@prisma/client";
import { Router } from "express";
import { requireAuth, sendError } from "../middleware.js";
import { prisma } from "../prisma.js";
import {
  calculateSpendingLevel,
  currentMonthContext,
  dayBounds,
  daysInMonth,
  moneyNumber,
  monthBoundsInTimeZone,
  monthKeyForDate,
  monthsEndingAt,
  shiftMonth,
} from "../services/analyticsService.js";
import { aggregateExpenses } from "../services/financialAggregationService.js";
import type { AuthenticatedRequest } from "../types.js";
import { analyticsMonthSchema, analyticsTrendSchema } from "../validation.js";

const router = Router();
router.use(requireAuth);

function sum(values: Prisma.Decimal[]) {
  return values.reduce((total, value) => total.add(value), new Prisma.Decimal(0));
}

type CurrencyTotals = {
  total: number;
  previousMonthTotal: number;
  changeAmount: number;
  changePercent: number | null;
};

type TodayCurrencyTotals = {
  expenseTotal: number;
  incomeTotal: number;
  netTotal: number;
};

function movementCurrency(currency: string | null | undefined, fallback: string) {
  return currency || fallback;
}

function isInCurrency(account: { currency?: string | null } | null | undefined, currency: string) {
  return !account?.currency || account.currency === currency;
}

function sortedCurrencyKeys(...maps: Map<string, Prisma.Decimal>[]) {
  return [...new Set(maps.flatMap((map) => [...map.keys()]))].sort();
}

function todayCurrencyTotals(
  expenses: Array<{
    amount: Prisma.Decimal;
    currency?: string | null;
    account?: { currency?: string | null } | null;
  }>,
  incomes: Array<{
    amount: Prisma.Decimal;
    currency?: string | null;
    account?: { currency?: string | null } | null;
  }>,
  fallbackCurrency: string,
) {
  const expenseTotals = new Map<string, Prisma.Decimal>();
  const incomeTotals = new Map<string, Prisma.Decimal>();
  for (const expense of expenses) {
    const currency = movementCurrency(
      expense.currency,
      expense.account?.currency ?? fallbackCurrency,
    );
    expenseTotals.set(
      currency,
      (expenseTotals.get(currency) ?? new Prisma.Decimal(0)).add(expense.amount),
    );
  }
  for (const income of incomes) {
    const currency = movementCurrency(
      income.currency,
      income.account?.currency ?? fallbackCurrency,
    );
    incomeTotals.set(
      currency,
      (incomeTotals.get(currency) ?? new Prisma.Decimal(0)).add(income.amount),
    );
  }
  return Object.fromEntries(
    sortedCurrencyKeys(expenseTotals, incomeTotals).map((currency) => {
      const expenseTotal = expenseTotals.get(currency) ?? new Prisma.Decimal(0);
      const incomeTotal = incomeTotals.get(currency) ?? new Prisma.Decimal(0);
      return [
        currency,
        {
          expenseTotal: moneyNumber(expenseTotal),
          incomeTotal: moneyNumber(incomeTotal),
          netTotal: moneyNumber(incomeTotal.sub(expenseTotal)),
        } satisfies TodayCurrencyTotals,
      ];
    }),
  ) as Record<string, TodayCurrencyTotals>;
}

async function userContext(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { timeZone: true, currency: true },
  });
  const timeZone = user?.timeZone ?? "Europe/Lisbon";
  const now = new Date();
  const monthContext = currentMonthContext(now, timeZone);
  return {
    ...monthContext,
    today: `${monthContext.month}-${String(monthContext.elapsedDays).padStart(2, "0")}`,
    timeZone,
    currency: user?.currency ?? "EUR",
  };
}

function dateBounds(day: string, timeZone: string) {
  return dayBounds(day, timeZone);
}

function validateSelectedMonth(
  month: string,
  currentMonth: string,
  response: Parameters<typeof sendError>[0],
) {
  if (month > currentMonth) {
    sendError(response, 422, "FUTURE_MONTH", "Não é possível consultar meses futuros.");
    return false;
  }
  return true;
}

async function categoriesAndBudgets(userId: string) {
  const [categories, budgets] = await Promise.all([
    prisma.category.findMany({ where: { userId }, orderBy: { name: "asc" } }),
    prisma.budget.findMany({
      where: { userId },
      select: { id: true, categoryId: true, monthlyLimit: true, createdAt: true, updatedAt: true },
    }),
  ]);
  return { categories, budgets: new Map(budgets.map((budget) => [budget.categoryId, budget])) };
}

router.get("/today", async (request: AuthenticatedRequest, response, next) => {
  try {
    const context = await userContext(request.user!.id);
    const { start, end } = dateBounds(context.today, context.timeZone);
    const [expenses, incomes, transfers] = await Promise.all([
      prisma.expense.findMany({
        where: { userId: request.user!.id, date: { gte: start, lt: end } },
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
        where: { userId: request.user!.id, date: { gte: start, lt: end } },
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
        where: { userId: request.user!.id, date: { gte: start, lt: end } },
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
    ]);

    const scopedExpenses = expenses.filter((item) => isInCurrency(item.account, context.currency));
    const scopedIncomes = incomes.filter((item) => isInCurrency(item.account, context.currency));
    const scopedTransfers = transfers.filter(
      (item) =>
        isInCurrency(item.fromAccount, context.currency) &&
        isInCurrency(item.toAccount, context.currency),
    );
    const totalsByCurrency = todayCurrencyTotals(scopedExpenses, scopedIncomes, context.currency);
    const selectedTotals = totalsByCurrency[context.currency] ?? {
      expenseTotal: 0,
      incomeTotal: 0,
      netTotal: 0,
    };
    const items = [
      ...scopedExpenses.map((item) => ({
        id: item.id,
        type: "expense" as const,
        description: item.description,
        amount: moneyNumber(item.amount),
        currency: movementCurrency(item.currency, item.account?.currency ?? context.currency),
        date: item.date,
        createdAt: item.createdAt,
        accountName: item.account?.name ?? null,
        categoryName: item.category.name,
        categoryIcon: item.category.icon,
        source: item.bankTransaction || item.account?.source === "bank" ? "bank" : "manual",
      })),
      ...scopedIncomes.map((item) => ({
        id: item.id,
        type: "income" as const,
        description: item.description,
        amount: moneyNumber(item.amount),
        currency: movementCurrency(item.currency, item.account?.currency ?? context.currency),
        date: item.date,
        createdAt: item.createdAt,
        accountName: item.account?.name ?? null,
        categoryName: null,
        categoryIcon: null,
        source: item.bankTransaction || item.account?.source === "bank" ? "bank" : "manual",
      })),
      ...scopedTransfers.map((item) => ({
        id: item.id,
        type: "transfer" as const,
        description: item.description || `Transferência para ${item.toAccount.name}`,
        amount: moneyNumber(item.amount),
        currency: movementCurrency(item.currency, item.fromAccount.currency ?? context.currency),
        date: item.date,
        createdAt: item.createdAt,
        accountName: `${item.fromAccount.name} → ${item.toAccount.name}`,
        categoryName: null,
        categoryIcon: null,
        source: item.bankTransactions.length ? ("bank" as const) : ("manual" as const),
      })),
    ]
      .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())
      .map(({ createdAt: _createdAt, ...item }) => item);

    return response.json({
      data: {
        date: context.today,
        timeZone: context.timeZone,
        currency: context.currency,
        expenseTotal: selectedTotals.expenseTotal,
        incomeTotal: selectedTotals.incomeTotal,
        netTotal: selectedTotals.netTotal,
        totalsByCurrency,
        items,
      },
    });
  } catch (error) {
    return next(error);
  }
});

router.get("/summary", async (request: AuthenticatedRequest, response, next) => {
  try {
    const input = analyticsMonthSchema.parse(request.query);
    const context = await userContext(request.user!.id);
    const month = input.month ?? context.month;
    if (!validateSelectedMonth(month, context.month, response)) return;
    const previousMonth = shiftMonth(month, -1);
    const [{ start, end }, previousBounds, categoryData] = await Promise.all([
      Promise.resolve(monthBoundsInTimeZone(month, context.timeZone)),
      Promise.resolve(monthBoundsInTimeZone(previousMonth, context.timeZone)),
      categoriesAndBudgets(request.user!.id),
    ]);
    const { categories } = categoryData;
    const [expenses, previousExpenses] = await Promise.all([
      prisma.expense.findMany({
        where: { userId: request.user!.id, date: { gte: start, lt: end } },
        select: {
          categoryId: true,
          amount: true,
          currency: true,
          date: true,
          account: { select: { currency: true } },
        },
      }),
      prisma.expense.findMany({
        where: {
          userId: request.user!.id,
          date: { gte: previousBounds.start, lt: previousBounds.end },
        },
        select: {
          categoryId: true,
          amount: true,
          currency: true,
          date: true,
          account: { select: { currency: true } },
        },
      }),
    ]);
    const expenseAggregate = aggregateExpenses(
      [...expenses, ...previousExpenses],
      context.timeZone,
      context.currency,
    );
    const amountsByCurrency = new Map<string, Map<string, Prisma.Decimal>>(
      expenseAggregate.byMonthCurrencyCategory.get(month) ?? new Map(),
    );
    const previousAmountsByCurrency = new Map<string, Map<string, Prisma.Decimal>>(
      expenseAggregate.byMonthCurrencyCategory.get(previousMonth) ?? new Map(),
    );
    const dailyAmounts = new Map<string, Prisma.Decimal>();
    const dailyAmountsByCurrency = new Map<string, Map<string, Prisma.Decimal>>();
    for (const [day, currencies] of expenseAggregate.byDayCurrency) {
      if (day.slice(0, 7) !== month) continue;
      for (const [currency, amount] of currencies) {
        const currencyDays =
          dailyAmountsByCurrency.get(currency) ?? new Map<string, Prisma.Decimal>();
        currencyDays.set(day, amount);
        dailyAmountsByCurrency.set(currency, currencyDays);
        if (currency === context.currency) dailyAmounts.set(day, amount);
      }
    }
    const amounts = amountsByCurrency.get(context.currency) ?? new Map<string, Prisma.Decimal>();
    const previousAmounts =
      previousAmountsByCurrency.get(context.currency) ?? new Map<string, Prisma.Decimal>();
    const total = sum([...amounts.values()]);
    const previousTotal = sum([...previousAmounts.values()]);
    const difference = total.sub(previousTotal);
    const totalsByCurrency = Object.fromEntries(
      sortedCurrencyKeys(
        new Map(
          [...amountsByCurrency.entries()].map(([currency, values]) => [
            currency,
            sum([...values.values()]),
          ]),
        ),
        new Map(
          [...previousAmountsByCurrency.entries()].map(([currency, values]) => [
            currency,
            sum([...values.values()]),
          ]),
        ),
      ).map((currency) => {
        const current = sum([...(amountsByCurrency.get(currency)?.values() ?? [])]);
        const previous = sum([...(previousAmountsByCurrency.get(currency)?.values() ?? [])]);
        const change = current.sub(previous);
        return [
          currency,
          {
            total: moneyNumber(current),
            previousMonthTotal: moneyNumber(previous),
            changeAmount: moneyNumber(change),
            changePercent: previous.isZero() ? null : moneyNumber(change.div(previous).mul(100)),
          } satisfies CurrencyTotals,
        ];
      }),
    ) as Record<string, CurrencyTotals>;
    return response.json({
      data: {
        month,
        timeZone: context.timeZone,
        currency: context.currency,
        total: moneyNumber(total),
        previousMonthTotal: moneyNumber(previousTotal),
        changeAmount: moneyNumber(difference),
        changePercent: previousTotal.isZero()
          ? null
          : moneyNumber(difference.div(previousTotal).mul(100)),
        totalsByCurrency,
        // Total gasto por dia do mês (dias sem despesas ficam de fora).
        byDay: [...dailyAmounts.entries()]
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([day, amount]) => ({ day, total: moneyNumber(amount) })),
        byDayByCurrency: Object.fromEntries(
          [...dailyAmountsByCurrency.entries()].map(([currency, days]) => [
            currency,
            [...days.entries()]
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([day, amount]) => ({ day, total: moneyNumber(amount) })),
          ]),
        ),
        byCategory: categories.map((category) => {
          const amount = amounts.get(category.id) ?? new Prisma.Decimal(0);
          const previousAmount = previousAmounts.get(category.id) ?? new Prisma.Decimal(0);
          const changeAmount = amount.sub(previousAmount);
          return {
            category: { id: category.id, name: category.name, icon: category.icon },
            amount: moneyNumber(amount),
            previousAmount: moneyNumber(previousAmount),
            changeAmount: moneyNumber(changeAmount),
            changePercent: previousAmount.isZero()
              ? null
              : moneyNumber(changeAmount.div(previousAmount).mul(100)),
            sharePercent: total.isZero() ? 0 : moneyNumber(amount.div(total).mul(100)),
          };
        }),
      },
    });
  } catch (error) {
    return next(error);
  }
});

router.get("/levels", async (request: AuthenticatedRequest, response, next) => {
  try {
    const input = analyticsMonthSchema.parse(request.query);
    const context = await userContext(request.user!.id);
    const month = input.month ?? context.month;
    if (!validateSelectedMonth(month, context.month, response)) return;
    const historyMonths = monthsEndingAt(shiftMonth(month, -1), 3);
    const historyStart = monthBoundsInTimeZone(historyMonths[0]!, context.timeZone).start;
    const { end } = monthBoundsInTimeZone(month, context.timeZone);
    const [{ categories, budgets }, expenses] = await Promise.all([
      categoriesAndBudgets(request.user!.id),
      prisma.expense.findMany({
        where: { userId: request.user!.id, date: { gte: historyStart, lt: end } },
        select: {
          categoryId: true,
          amount: true,
          currency: true,
          date: true,
          account: { select: { currency: true } },
        },
      }),
    ]);
    const expenseAggregate = aggregateExpenses(expenses, context.timeZone, context.currency);
    const values = new Map<string, Map<string, Prisma.Decimal>>();
    for (const [expenseMonth, currencies] of expenseAggregate.byMonthCurrencyCategory) {
      for (const [categoryId, amount] of currencies.get(context.currency) ?? new Map()) {
        const categoryValues = values.get(categoryId) ?? new Map<string, Prisma.Decimal>();
        categoryValues.set(expenseMonth, amount);
        values.set(categoryId, categoryValues);
      }
    }
    const isCurrentMonth = month === context.month;
    const selectedDaysInMonth = isCurrentMonth ? context.daysInMonth : daysInMonth(month);
    return response.json({
      data: categories.map((category) => {
        const categoryValues = values.get(category.id) ?? new Map<string, Prisma.Decimal>();
        const currentAmount = categoryValues.get(month) ?? new Prisma.Decimal(0);
        const historyAmounts = historyMonths.map(
          (historyMonth) => categoryValues.get(historyMonth) ?? new Prisma.Decimal(0),
        );
        const budget = budgets.get(category.id);
        const calculation = calculateSpendingLevel({
          currentAmount,
          historyAmounts,
          monthlyLimit: budget?.monthlyLimit,
          isCurrentMonth,
          elapsedDays: isCurrentMonth ? context.elapsedDays : selectedDaysInMonth,
          daysInMonth: selectedDaysInMonth,
        });
        return {
          category: { id: category.id, name: category.name, icon: category.icon },
          level: calculation.level,
          basis: calculation.basis,
          currentAmount: moneyNumber(calculation.currentAmount),
          projectedAmount: moneyNumber(calculation.projectedAmount),
          baselineAmount:
            calculation.baselineAmount === null ? null : moneyNumber(calculation.baselineAmount),
          comparisonRatio:
            calculation.comparisonRatio === null
              ? null
              : calculation.comparisonRatio.toDecimalPlaces(4).toNumber(),
          budget: budget
            ? {
                id: budget.id,
                categoryId: budget.categoryId,
                monthlyLimit: moneyNumber(budget.monthlyLimit),
                category: { id: category.id, name: category.name, icon: category.icon },
                createdAt: budget.createdAt,
                updatedAt: budget.updatedAt,
              }
            : null,
          history: historyMonths.map((historyMonth, index) => ({
            month: historyMonth,
            amount: moneyNumber(historyAmounts[index]!),
          })),
        };
      }),
    });
  } catch (error) {
    return next(error);
  }
});

router.get("/trend", async (request: AuthenticatedRequest, response, next) => {
  try {
    const { months, month: requestedMonth } = analyticsTrendSchema.parse(request.query);
    const context = await userContext(request.user!.id);
    const selectedMonth = requestedMonth ?? context.month;
    if (!validateSelectedMonth(selectedMonth, context.month, response)) return;
    const monthKeys = monthsEndingAt(selectedMonth, months);
    const { start } = monthBoundsInTimeZone(monthKeys[0]!, context.timeZone);
    const { end } = monthBoundsInTimeZone(selectedMonth, context.timeZone);
    const [expenses, categories] = await Promise.all([
      prisma.expense.findMany({
        where: { userId: request.user!.id, date: { gte: start, lt: end } },
        select: {
          categoryId: true,
          amount: true,
          currency: true,
          date: true,
          account: { select: { currency: true } },
        },
      }),
      prisma.category.findMany({
        where: { userId: request.user!.id },
        orderBy: { name: "asc" },
        select: { id: true, name: true, icon: true },
      }),
    ]);
    const expenseAggregate = aggregateExpenses(expenses, context.timeZone, context.currency);
    const values = new Map<string, Map<string, Prisma.Decimal>>();
    for (const [month, currencies] of expenseAggregate.byMonthCurrencyCategory) {
      values.set(month, currencies.get(context.currency) ?? new Map<string, Prisma.Decimal>());
    }
    return response.json({
      data: {
        timeZone: context.timeZone,
        currency: context.currency,
        series: monthKeys.map((month) => {
          const monthValues = values.get(month) ?? new Map<string, Prisma.Decimal>();
          return {
            month,
            total: moneyNumber(
              expenseAggregate.byMonthCurrency.get(month)?.get(context.currency) ?? 0,
            ),
            totalsByCurrency: Object.fromEntries(
              [...(expenseAggregate.byMonthCurrency.get(month) ?? new Map()).entries()].map(
                ([entryCurrency, amount]) => [entryCurrency, moneyNumber(amount)],
              ),
            ),
            categories: categories.map((category) => ({
              category: { id: category.id, name: category.name, icon: category.icon },
              amount: moneyNumber(monthValues.get(category.id) ?? new Prisma.Decimal(0)),
            })),
          };
        }),
      },
    });
  } catch (error) {
    return next(error);
  }
});

export default router;
