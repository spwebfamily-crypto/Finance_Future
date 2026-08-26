import { Prisma } from "@prisma/client";
import { Router } from "express";
import { requireAuth, sendError } from "../middleware.js";
import { prisma } from "../prisma.js";
import {
  calculateSpendingLevel,
  currentMonthContext,
  moneyNumber,
  monthBounds,
  monthsEndingAt,
  shiftMonth,
} from "../services/analyticsService.js";
import type { AuthenticatedRequest } from "../types.js";
import { analyticsMonthSchema, analyticsTrendSchema } from "../validation.js";

const router = Router();
router.use(requireAuth);

function sum(values: Prisma.Decimal[]) {
  return values.reduce((total, value) => total.add(value), new Prisma.Decimal(0));
}

async function userContext(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { timeZone: true, currency: true },
  });
  const timeZone = user?.timeZone ?? "Europe/Lisbon";
  return {
    ...currentMonthContext(new Date(), timeZone),
    timeZone,
    currency: user?.currency ?? "EUR",
  };
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

router.get("/summary", async (request: AuthenticatedRequest, response, next) => {
  try {
    const input = analyticsMonthSchema.parse(request.query);
    const context = await userContext(request.user!.id);
    const month = input.month ?? context.month;
    if (!validateSelectedMonth(month, context.month, response)) return;
    const previousMonth = shiftMonth(month, -1);
    const [{ start, end }, previousBounds, categoryData] = await Promise.all([
      Promise.resolve(monthBounds(month)),
      Promise.resolve(monthBounds(previousMonth)),
      categoriesAndBudgets(request.user!.id),
    ]);
    const { categories } = categoryData;
    const [expenses, previousExpenses] = await Promise.all([
      prisma.expense.findMany({
        where: { userId: request.user!.id, date: { gte: start, lt: end } },
        select: { categoryId: true, amount: true, date: true },
      }),
      prisma.expense.findMany({
        where: {
          userId: request.user!.id,
          date: { gte: previousBounds.start, lt: previousBounds.end },
        },
        select: { categoryId: true, amount: true },
      }),
    ]);
    const amounts = new Map<string, Prisma.Decimal>();
    const previousAmounts = new Map<string, Prisma.Decimal>();
    const dailyAmounts = new Map<string, Prisma.Decimal>();
    for (const expense of expenses) {
      amounts.set(
        expense.categoryId,
        (amounts.get(expense.categoryId) ?? new Prisma.Decimal(0)).add(expense.amount),
      );
      const day = expense.date.toISOString().slice(0, 10);
      dailyAmounts.set(day, (dailyAmounts.get(day) ?? new Prisma.Decimal(0)).add(expense.amount));
    }
    for (const expense of previousExpenses)
      previousAmounts.set(
        expense.categoryId,
        (previousAmounts.get(expense.categoryId) ?? new Prisma.Decimal(0)).add(expense.amount),
      );
    const total = sum([...amounts.values()]);
    const previousTotal = sum([...previousAmounts.values()]);
    const difference = total.sub(previousTotal);
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
        // Total gasto por dia do mês (dias sem despesas ficam de fora).
        byDay: [...dailyAmounts.entries()]
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([day, amount]) => ({ day, total: moneyNumber(amount) })),
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
    const historyStart = monthBounds(historyMonths[0]!).start;
    const { end } = monthBounds(month);
    const [{ categories, budgets }, expenses] = await Promise.all([
      categoriesAndBudgets(request.user!.id),
      prisma.expense.findMany({
        where: { userId: request.user!.id, date: { gte: historyStart, lt: end } },
        select: { categoryId: true, amount: true, date: true },
      }),
    ]);
    const values = new Map<string, Map<string, Prisma.Decimal>>();
    for (const expense of expenses) {
      const date = expense.date;
      const expenseMonth = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
      const categoryValues = values.get(expense.categoryId) ?? new Map<string, Prisma.Decimal>();
      categoryValues.set(
        expenseMonth,
        (categoryValues.get(expenseMonth) ?? new Prisma.Decimal(0)).add(expense.amount),
      );
      values.set(expense.categoryId, categoryValues);
    }
    const isCurrentMonth = month === context.month;
    const selectedBounds = monthBounds(month);
    const daysInMonth = isCurrentMonth
      ? context.daysInMonth
      : new Date(selectedBounds.end.getTime() - 1).getUTCDate();
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
          elapsedDays: isCurrentMonth ? context.elapsedDays : daysInMonth,
          daysInMonth,
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
    const { start } = monthBounds(monthKeys[0]!);
    const { end } = monthBounds(selectedMonth);
    const [expenses, categories] = await Promise.all([
      prisma.expense.findMany({
        where: { userId: request.user!.id, date: { gte: start, lt: end } },
        select: { categoryId: true, amount: true, date: true },
      }),
      prisma.category.findMany({
        where: { userId: request.user!.id },
        orderBy: { name: "asc" },
        select: { id: true, name: true, icon: true },
      }),
    ]);
    const values = new Map<string, Map<string, Prisma.Decimal>>();
    for (const expense of expenses) {
      const month = `${expense.date.getUTCFullYear()}-${String(expense.date.getUTCMonth() + 1).padStart(2, "0")}`;
      const monthValues = values.get(month) ?? new Map<string, Prisma.Decimal>();
      monthValues.set(
        expense.categoryId,
        (monthValues.get(expense.categoryId) ?? new Prisma.Decimal(0)).add(expense.amount),
      );
      values.set(month, monthValues);
    }
    return response.json({
      data: {
        timeZone: context.timeZone,
        currency: context.currency,
        series: monthKeys.map((month) => {
          const monthValues = values.get(month) ?? new Map<string, Prisma.Decimal>();
          return {
            month,
            total: moneyNumber(sum([...monthValues.values()])),
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
