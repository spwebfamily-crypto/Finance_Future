import { prisma } from "../prisma.js";
import { isReservedCategoryName } from "./categoryPolicy.js";

type CategoryTarget = { id: string; userId: string; name: string };

export interface OtherCategoryCleanupSummary {
  categoryId: string;
  userId: string;
  categoryName: string;
  expensesDeleted: number;
  manualExpensesDeleted: number;
  bankExpensesDeleted: number;
  bankTransactionsRequeued: number;
  budgetsDeleted: number;
  recurringExpensesDeleted: number;
  notesUnlinked: number;
  categoryDeleted: number;
}

async function reservedCategories(userId?: string): Promise<CategoryTarget[]> {
  const categories = await prisma.category.findMany({
    where: userId ? { userId } : undefined,
    select: { id: true, userId: true, name: true },
    orderBy: [{ userId: "asc" }, { name: "asc" }],
  });
  return categories.filter((category) => isReservedCategoryName(category.name));
}

export async function previewOutrosCategoryCleanup(userId?: string) {
  const targets = await reservedCategories(userId);
  const summaries: OtherCategoryCleanupSummary[] = [];

  for (const target of targets) {
    const [expenses, budgets, recurringExpenses, notes] = await Promise.all([
      prisma.expense.findMany({
        where: { userId: target.userId, categoryId: target.id },
        select: { id: true, bankTransaction: { select: { id: true } } },
      }),
      prisma.budget.count({ where: { userId: target.userId, categoryId: target.id } }),
      prisma.recurringExpense.count({
        where: { userId: target.userId, categoryId: target.id },
      }),
      prisma.financialNote.count({
        where: { userId: target.userId, relatedCategoryId: target.id },
      }),
    ]);
    const bankExpensesDeleted = expenses.filter((expense) => expense.bankTransaction).length;
    summaries.push({
      categoryId: target.id,
      userId: target.userId,
      categoryName: target.name,
      expensesDeleted: expenses.length,
      manualExpensesDeleted: expenses.length - bankExpensesDeleted,
      bankExpensesDeleted,
      bankTransactionsRequeued: bankExpensesDeleted,
      budgetsDeleted: budgets,
      recurringExpensesDeleted: recurringExpenses,
      notesUnlinked: notes,
      categoryDeleted: 1,
    });
  }

  return summaries;
}

export async function removeOutrosCategories(userId?: string) {
  const targets = await reservedCategories(userId);
  const summaries: OtherCategoryCleanupSummary[] = [];

  for (const target of targets) {
    const summary = await prisma.$transaction(async (client) => {
      const currentCategory = await client.category.findFirst({
        where: { id: target.id, userId: target.userId },
        select: { id: true, userId: true, name: true },
      });
      if (!currentCategory || !isReservedCategoryName(currentCategory.name)) {
        throw new Error(`Categoria alvo ${target.id} mudou antes da limpeza.`);
      }
      const expenses = await client.expense.findMany({
        where: { userId: target.userId, categoryId: target.id },
        select: { id: true, bankTransaction: { select: { id: true } } },
      });
      const expenseIds = expenses.map((expense) => expense.id);
      const bankExpenseIds = expenses
        .filter((expense) => expense.bankTransaction)
        .map((expense) => expense.id);

      let bankTransactionsRequeued = 0;
      if (expenseIds.length) {
        await client.bankTransaction.updateMany({
          where: { userId: target.userId, expenseId: { in: expenseIds } },
          data: { expenseId: null },
        });
        const requeued = await client.bankTransaction.updateMany({
          where: {
            userId: target.userId,
            expenseId: null,
            status: { not: "removed" },
            id: {
              in: expenses.flatMap((expense) =>
                expense.bankTransaction ? [expense.bankTransaction.id] : [],
              ),
            },
          },
          data: {
            classification: "unreviewed",
            excludedFromAnalytics: false,
            reviewedAt: null,
          },
        });
        bankTransactionsRequeued = requeued.count;
      }

      const deletedExpenses = await client.expense.deleteMany({
        where: { userId: target.userId, categoryId: target.id },
      });
      const deletedBudgets = await client.budget.deleteMany({
        where: { userId: target.userId, categoryId: target.id },
      });
      const deletedRecurringExpenses = await client.recurringExpense.deleteMany({
        where: { userId: target.userId, categoryId: target.id },
      });
      const unlinkedNotes = await client.financialNote.updateMany({
        where: { userId: target.userId, relatedCategoryId: target.id },
        data: { relatedCategoryId: null },
      });
      await client.category.delete({ where: { id: target.id } });

      return {
        categoryId: target.id,
        userId: target.userId,
        categoryName: target.name,
        expensesDeleted: deletedExpenses.count,
        manualExpensesDeleted: deletedExpenses.count - bankExpenseIds.length,
        bankExpensesDeleted: bankExpenseIds.length,
        bankTransactionsRequeued,
        budgetsDeleted: deletedBudgets.count,
        recurringExpensesDeleted: deletedRecurringExpenses.count,
        notesUnlinked: unlinkedNotes.count,
        categoryDeleted: 1,
      } satisfies OtherCategoryCleanupSummary;
    });
    summaries.push(summary);
  }

  return summaries;
}

export function totalCleanupCounts(summaries: OtherCategoryCleanupSummary[]) {
  return summaries.reduce(
    (totals, summary) => ({
      categoriesDeleted: totals.categoriesDeleted + summary.categoryDeleted,
      expensesDeleted: totals.expensesDeleted + summary.expensesDeleted,
      manualExpensesDeleted: totals.manualExpensesDeleted + summary.manualExpensesDeleted,
      bankExpensesDeleted: totals.bankExpensesDeleted + summary.bankExpensesDeleted,
      bankTransactionsRequeued: totals.bankTransactionsRequeued + summary.bankTransactionsRequeued,
      budgetsDeleted: totals.budgetsDeleted + summary.budgetsDeleted,
      recurringExpensesDeleted: totals.recurringExpensesDeleted + summary.recurringExpensesDeleted,
      notesUnlinked: totals.notesUnlinked + summary.notesUnlinked,
    }),
    {
      categoriesDeleted: 0,
      expensesDeleted: 0,
      manualExpensesDeleted: 0,
      bankExpensesDeleted: 0,
      bankTransactionsRequeued: 0,
      budgetsDeleted: 0,
      recurringExpensesDeleted: 0,
      notesUnlinked: 0,
    },
  );
}
