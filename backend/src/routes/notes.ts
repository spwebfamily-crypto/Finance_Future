import { Prisma } from '@prisma/client';
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { env } from '../config.js';
import { requireAuth, sendError } from '../middleware.js';
import { prisma } from '../prisma.js';
import {
  generateFinancialNote,
  type FinancialSnapshot,
} from '../services/aiNotesService.js';
import {
  calculateSpendingLevel,
  currentMonthContext,
  moneyNumber,
  monthBounds,
  monthsEndingAt,
  shiftMonth,
} from '../services/analyticsService.js';
import type { AuthenticatedRequest } from '../types.js';

const router = Router();
router.use(requireAuth);

const generateLimiter = rateLimit({
  windowMs: 60 * 60_000,
  limit: 12,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: {
      code: 'NOTES_RATE_LIMITED',
      message: 'Aguarde antes de gerar outra nota financeira.',
    },
  },
});

const noteInclude = {
  relatedCategory: { select: { id: true, name: true, icon: true, isDefault: true } },
} satisfies Prisma.FinancialNoteInclude;

router.get('/', async (request: AuthenticatedRequest, response, next) => {
  try {
    const notes = await prisma.financialNote.findMany({
      where: { userId: request.user!.id },
      include: noteInclude,
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return response.json({ data: notes });
  } catch (error) {
    return next(error);
  }
});

router.post('/generate', generateLimiter, async (request: AuthenticatedRequest, response, next) => {
  try {
    const context = await buildSnapshot(request.user!.id);
    if (!context) {
      return sendError(response, 404, 'USER_NOT_FOUND', 'Utilizador não encontrado.');
    }

    const generated = await generateFinancialNote(context.snapshot, {
      apiKey: env.ANTHROPIC_API_KEY,
      model: env.ANTHROPIC_MODEL,
    });
    const relatedCategory = generated.relatedCategory
      ? context.categories.find((category) => normalize(category.name) === normalize(generated.relatedCategory!))
      : undefined;

    const note = await prisma.financialNote.create({
      data: {
        userId: request.user!.id,
        content: generated.content,
        severity: generated.severity,
        relatedCategoryId: relatedCategory?.id ?? null,
      },
      include: noteInclude,
    });

    return response.status(201).json({ data: { ...note, source: generated.source } });
  } catch (error) {
    return next(error);
  }
});

async function buildSnapshot(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { currency: true, timeZone: true },
  });
  if (!user) return null;

  const current = currentMonthContext(new Date(), user.timeZone);
  const historyMonths = monthsEndingAt(shiftMonth(current.month, -1), 3);
  const historyStart = monthBounds(historyMonths[0]!).start;
  const currentEnd = monthBounds(current.month).end;
  const [categories, budgets, expenses] = await Promise.all([
    prisma.category.findMany({
      where: { userId },
      orderBy: { name: 'asc' },
      select: { id: true, name: true },
    }),
    prisma.budget.findMany({
      where: { userId },
      select: { categoryId: true, monthlyLimit: true },
    }),
    prisma.expense.findMany({
      where: { userId, date: { gte: historyStart, lt: currentEnd } },
      select: { categoryId: true, amount: true, date: true },
    }),
  ]);

  const byCategory = new Map<string, Map<string, Prisma.Decimal>>();
  for (const expense of expenses) {
    const month = `${expense.date.getUTCFullYear()}-${String(expense.date.getUTCMonth() + 1).padStart(2, '0')}`;
    const values = byCategory.get(expense.categoryId) ?? new Map<string, Prisma.Decimal>();
    values.set(month, (values.get(month) ?? new Prisma.Decimal(0)).add(expense.amount));
    byCategory.set(expense.categoryId, values);
  }

  const budgetMap = new Map(budgets.map((budget) => [budget.categoryId, budget.monthlyLimit]));
  const categorySnapshots = categories.map((category) => {
    const values = byCategory.get(category.id) ?? new Map<string, Prisma.Decimal>();
    const amount = values.get(current.month) ?? new Prisma.Decimal(0);
    return { id: category.id, name: category.name, amount: moneyNumber(amount), values };
  });
  const spent = categorySnapshots.reduce((total, category) => total.add(category.amount), new Prisma.Decimal(0));

  const snapshot: FinancialSnapshot = {
    currency: user.currency,
    month: current.month,
    totals: { spent: moneyNumber(spent) },
    categories: categorySnapshots
      .map(({ id, name, amount }) => ({ id, name, amount }))
      .sort((first, second) => second.amount - first.amount),
    levels: categorySnapshots.map((category) => {
      const historyAmounts = historyMonths.map((month) => category.values.get(month) ?? new Prisma.Decimal(0));
      const calculation = calculateSpendingLevel({
        currentAmount: category.amount,
        historyAmounts,
        monthlyLimit: budgetMap.get(category.id),
        isCurrentMonth: true,
        elapsedDays: current.elapsedDays,
        daysInMonth: current.daysInMonth,
      });
      return { categoryId: category.id, categoryName: category.name, level: calculation.level };
    }),
    budgets: budgets.map((budget) => {
      const category = categorySnapshots.find((item) => item.id === budget.categoryId)!;
      return {
        categoryId: budget.categoryId,
        categoryName: category.name,
        limit: moneyNumber(budget.monthlyLimit),
        spent: category.amount,
      };
    }),
  };

  return { snapshot, categories };
}

function normalize(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-PT').trim();
}

export default router;
