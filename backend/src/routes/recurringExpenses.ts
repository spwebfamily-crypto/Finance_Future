import { Prisma } from '@prisma/client';
import { Router } from 'express';
import { requireAuth, sendError } from '../middleware.js';
import { prisma } from '../prisma.js';
import type { AuthenticatedRequest } from '../types.js';
import { recurringExpenseCreateSchema, recurringExpenseUpdateSchema } from '../validation.js';

const router = Router();
router.use(requireAuth);

const recurringExpenseSelect = {
  id: true,
  categoryId: true,
  description: true,
  location: true,
  amount: true,
  dayOfMonth: true,
  nextDueDate: true,
  isActive: true,
  lastPaidAt: true,
  createdAt: true,
  updatedAt: true,
  category: { select: { id: true, name: true, icon: true } },
} satisfies Prisma.RecurringExpenseSelect;

type PublicRecurringExpense = Prisma.RecurringExpenseGetPayload<{ select: typeof recurringExpenseSelect }>;

function presentRecurringExpense(expense: PublicRecurringExpense) {
  return { ...expense, amount: expense.amount.toDecimalPlaces(2).toNumber() };
}

function dueDateForMonth(year: number, month: number, dayOfMonth: number) {
  const finalDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return new Date(Date.UTC(year, month, Math.min(dayOfMonth, finalDay)));
}

function nextDueDate(dayOfMonth: number, from = new Date()) {
  const candidate = dueDateForMonth(from.getUTCFullYear(), from.getUTCMonth(), dayOfMonth);
  const today = Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate());
  return candidate.getTime() < today
    ? dueDateForMonth(from.getUTCFullYear(), from.getUTCMonth() + 1, dayOfMonth)
    : candidate;
}

function advanceDueDate(current: Date, dayOfMonth: number) {
  return dueDateForMonth(current.getUTCFullYear(), current.getUTCMonth() + 1, dayOfMonth);
}

async function categoryBelongsToUser(categoryId: string, userId: string) {
  return prisma.category.findFirst({ where: { id: categoryId, userId }, select: { id: true } });
}

router.get('/', async (request: AuthenticatedRequest, response, next) => {
  try {
    const recurringExpenses = await prisma.recurringExpense.findMany({
      where: { userId: request.user!.id },
      select: recurringExpenseSelect,
      orderBy: [{ isActive: 'desc' }, { nextDueDate: 'asc' }],
    });
    return response.json({ data: recurringExpenses.map(presentRecurringExpense) });
  } catch (error) { return next(error); }
});

router.post('/', async (request: AuthenticatedRequest, response, next) => {
  try {
    const input = recurringExpenseCreateSchema.parse(request.body);
    if (!(await categoryBelongsToUser(input.categoryId, request.user!.id))) {
      return sendError(response, 404, 'CATEGORY_NOT_FOUND', 'Categoria não encontrada.');
    }
    const recurringExpense = await prisma.recurringExpense.create({
      data: { ...input, userId: request.user!.id, nextDueDate: nextDueDate(input.dayOfMonth) },
      select: recurringExpenseSelect,
    });
    return response.status(201).json({ data: presentRecurringExpense(recurringExpense) });
  } catch (error) { return next(error); }
});

router.patch('/:id', async (request: AuthenticatedRequest, response, next) => {
  try {
    const input = recurringExpenseUpdateSchema.parse(request.body);
    const existing = await prisma.recurringExpense.findFirst({ where: { id: request.params.id, userId: request.user!.id }, select: { id: true } });
    if (!existing) return sendError(response, 404, 'RECURRING_EXPENSE_NOT_FOUND', 'Despesa recorrente não encontrada.');
    if (input.categoryId && !(await categoryBelongsToUser(input.categoryId, request.user!.id))) {
      return sendError(response, 404, 'CATEGORY_NOT_FOUND', 'Categoria não encontrada.');
    }
    const recurringExpense = await prisma.recurringExpense.update({
      where: { id: existing.id },
      data: { ...input, ...(input.dayOfMonth === undefined ? {} : { nextDueDate: nextDueDate(input.dayOfMonth) }) },
      select: recurringExpenseSelect,
    });
    return response.json({ data: presentRecurringExpense(recurringExpense) });
  } catch (error) { return next(error); }
});

router.post('/:id/record', async (request: AuthenticatedRequest, response, next) => {
  try {
    const recurringExpense = await prisma.$transaction(async (transaction) => {
      const current = await transaction.recurringExpense.findFirst({
        where: { id: request.params.id, userId: request.user!.id, isActive: true },
        select: { id: true, userId: true, categoryId: true, description: true, location: true, amount: true, dayOfMonth: true, nextDueDate: true },
      });
      if (!current) return null;
      await transaction.expense.create({
        data: {
          userId: current.userId,
          categoryId: current.categoryId,
          description: current.description,
          location: current.location,
          amount: current.amount,
          date: current.nextDueDate,
        },
      });
      return transaction.recurringExpense.update({
        where: { id: current.id },
        data: { lastPaidAt: new Date(), nextDueDate: advanceDueDate(current.nextDueDate, current.dayOfMonth) },
        select: recurringExpenseSelect,
      });
    });
    if (!recurringExpense) return sendError(response, 404, 'RECURRING_EXPENSE_NOT_FOUND', 'Despesa recorrente ativa não encontrada.');
    return response.json({ data: presentRecurringExpense(recurringExpense) });
  } catch (error) { return next(error); }
});

router.delete('/:id', async (request: AuthenticatedRequest, response, next) => {
  try {
    const existing = await prisma.recurringExpense.findFirst({ where: { id: request.params.id, userId: request.user!.id }, select: { id: true } });
    if (!existing) return sendError(response, 404, 'RECURRING_EXPENSE_NOT_FOUND', 'Despesa recorrente não encontrada.');
    await prisma.recurringExpense.delete({ where: { id: existing.id } });
    return response.status(204).end();
  } catch (error) { return next(error); }
});

export default router;
