import { prisma } from "../prisma.js";

/**
 * One read seam for Planning. It intentionally returns source records only:
 * recording a recurrence or changing a goal remains an explicit user action.
 */
export async function getPlanningOverview(userId: string, from: Date, to: Date) {
  const [categories, incomes, goals, recurringExpenses, recurringIncomes, debts] =
    await Promise.all([
      prisma.category.findMany({
        where: { userId },
        orderBy: [{ isDefault: "desc" }, { name: "asc" }],
      }),
      prisma.income.findMany({
        where: { userId, date: { gte: from, lt: to } },
        orderBy: { date: "desc" },
        include: { account: true },
      }),
      prisma.savingsGoal.findMany({
        where: { userId },
        orderBy: [{ targetDate: "asc" }, { createdAt: "desc" }],
      }),
      prisma.recurringExpense.findMany({
        where: { userId },
        orderBy: [{ isActive: "desc" }, { nextDueDate: "asc" }],
        include: { category: true, account: true },
      }),
      prisma.recurringIncome.findMany({
        where: { userId },
        orderBy: [{ isActive: "desc" }, { nextDueDate: "asc" }],
        include: { account: true },
      }),
      prisma.debt.findMany({
        where: { userId },
        orderBy: [{ nextPaymentDate: "asc" }, { createdAt: "desc" }],
      }),
    ]);
  return {
    from,
    to,
    categories,
    incomes: incomes.map((item) => ({
      ...item,
      amount: item.amount.toDecimalPlaces(2).toNumber(),
    })),
    goals: goals.map((item) => ({
      ...item,
      targetAmount: item.targetAmount.toDecimalPlaces(2).toNumber(),
      currentAmount: item.currentAmount.toDecimalPlaces(2).toNumber(),
    })),
    recurringExpenses: recurringExpenses.map((item) => ({
      ...item,
      amount: item.amount.toDecimalPlaces(2).toNumber(),
    })),
    recurringIncomes: recurringIncomes.map((item) => ({
      ...item,
      amount: item.amount.toDecimalPlaces(2).toNumber(),
    })),
    debts: debts.map((item) => ({
      ...item,
      currentBalance: item.currentBalance.toDecimalPlaces(2).toNumber(),
      annualInterestRate: item.annualInterestRate.toDecimalPlaces(2).toNumber(),
      monthlyPayment: item.monthlyPayment.toDecimalPlaces(2).toNumber(),
    })),
  };
}
