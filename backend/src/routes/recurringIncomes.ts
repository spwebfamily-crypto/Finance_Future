import { Prisma } from '@prisma/client';
import { Router } from 'express';
import { requireAuth, sendError } from '../middleware.js';
import { prisma } from '../prisma.js';
import type { AuthenticatedRequest } from '../types.js';
import { recurringIncomeCreateSchema, recurringIncomeUpdateSchema } from '../validation.js';

const router = Router();
router.use(requireAuth);

const recurringIncomeSelect = {
  id: true,
  accountId: true,
  description: true,
  source: true,
  amount: true,
  dayOfMonth: true,
  nextDueDate: true,
  isActive: true,
  lastReceivedAt: true,
  createdAt: true,
  updatedAt: true,
  account: { select: { id: true, name: true, type: true } },
} satisfies Prisma.RecurringIncomeSelect;

type PublicRecurringIncome = Prisma.RecurringIncomeGetPayload<{ select: typeof recurringIncomeSelect }>;

function presentRecurringIncome(income: PublicRecurringIncome) {
  return { ...income, amount: income.amount.toDecimalPlaces(2).toNumber() };
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

async function accountBelongsToUser(accountId: string, userId: string) {
  return prisma.account.findFirst({ where: { id: accountId, userId }, select: { id: true } });
}

router.get('/', async (request: AuthenticatedRequest, response, next) => {
  try {
    const recurringIncomes = await prisma.recurringIncome.findMany({
      where: { userId: request.user!.id },
      select: recurringIncomeSelect,
      orderBy: [{ isActive: 'desc' }, { nextDueDate: 'asc' }],
    });
    return response.json({ data: recurringIncomes.map(presentRecurringIncome) });
  } catch (error) { return next(error); }
});

router.post('/', async (request: AuthenticatedRequest, response, next) => {
  try {
    const input = recurringIncomeCreateSchema.parse(request.body);
    if (input.accountId && !(await accountBelongsToUser(input.accountId, request.user!.id))) {
      return sendError(response, 404, 'ACCOUNT_NOT_FOUND', 'Conta não encontrada.');
    }
    const recurringIncome = await prisma.recurringIncome.create({
      data: { ...input, accountId: input.accountId ?? null, userId: request.user!.id, source: input.source || null, nextDueDate: nextDueDate(input.dayOfMonth) },
      select: recurringIncomeSelect,
    });
    return response.status(201).json({ data: presentRecurringIncome(recurringIncome) });
  } catch (error) { return next(error); }
});

router.patch('/:id', async (request: AuthenticatedRequest, response, next) => {
  try {
    const input = recurringIncomeUpdateSchema.parse(request.body);
    const existing = await prisma.recurringIncome.findFirst({ where: { id: request.params.id, userId: request.user!.id }, select: { id: true } });
    if (!existing) return sendError(response, 404, 'RECURRING_INCOME_NOT_FOUND', 'Rendimento recorrente não encontrado.');
    if (input.accountId && !(await accountBelongsToUser(input.accountId, request.user!.id))) {
      return sendError(response, 404, 'ACCOUNT_NOT_FOUND', 'Conta não encontrada.');
    }
    const recurringIncome = await prisma.recurringIncome.update({
      where: { id: existing.id },
      data: {
        ...input,
        ...(input.source === undefined ? {} : { source: input.source || null }),
        ...(input.dayOfMonth === undefined ? {} : { nextDueDate: nextDueDate(input.dayOfMonth) }),
      },
      select: recurringIncomeSelect,
    });
    return response.json({ data: presentRecurringIncome(recurringIncome) });
  } catch (error) { return next(error); }
});

router.post('/:id/record', async (request: AuthenticatedRequest, response, next) => {
  try {
    const recurringIncome = await prisma.$transaction(async (transaction) => {
      const current = await transaction.recurringIncome.findFirst({
        where: { id: request.params.id, userId: request.user!.id, isActive: true },
        select: { id: true, userId: true, accountId: true, description: true, source: true, amount: true, dayOfMonth: true, nextDueDate: true },
      });
      if (!current) return null;
      await transaction.income.create({
        data: { userId: current.userId, accountId: current.accountId, description: current.description, source: current.source, amount: current.amount, date: current.nextDueDate },
      });
      return transaction.recurringIncome.update({
        where: { id: current.id },
        data: { lastReceivedAt: new Date(), nextDueDate: advanceDueDate(current.nextDueDate, current.dayOfMonth) },
        select: recurringIncomeSelect,
      });
    });
    if (!recurringIncome) return sendError(response, 404, 'RECURRING_INCOME_NOT_FOUND', 'Rendimento recorrente ativo não encontrado.');
    return response.json({ data: presentRecurringIncome(recurringIncome) });
  } catch (error) { return next(error); }
});

router.delete('/:id', async (request: AuthenticatedRequest, response, next) => {
  try {
    const existing = await prisma.recurringIncome.findFirst({ where: { id: request.params.id, userId: request.user!.id }, select: { id: true } });
    if (!existing) return sendError(response, 404, 'RECURRING_INCOME_NOT_FOUND', 'Rendimento recorrente não encontrado.');
    await prisma.recurringIncome.delete({ where: { id: existing.id } });
    return response.status(204).end();
  } catch (error) { return next(error); }
});

export default router;
