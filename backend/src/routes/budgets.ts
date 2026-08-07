import { Prisma } from '@prisma/client';
import { Router } from 'express';
import { prisma } from '../prisma.js';
import { requireAuth, sendError } from '../middleware.js';
import type { AuthenticatedRequest } from '../types.js';
import { budgetCreateSchema, budgetUpdateSchema } from '../validation.js';

const router = Router();
router.use(requireAuth);

const budgetInclude = { category: true } satisfies Prisma.BudgetInclude;
type BudgetWithCategory = Prisma.BudgetGetPayload<{ include: typeof budgetInclude }>;

function presentBudget(budget: BudgetWithCategory) {
  return { ...budget, monthlyLimit: budget.monthlyLimit.toDecimalPlaces(2).toNumber() };
}

router.get('/', async (request: AuthenticatedRequest, response, next) => {
  try {
    const budgets = await prisma.budget.findMany({
      where: { userId: request.user!.id },
      include: budgetInclude,
      orderBy: { category: { name: 'asc' } },
    });
    return response.json({ data: budgets.map(presentBudget) });
  } catch (error) { return next(error); }
});

router.post('/', async (request: AuthenticatedRequest, response, next) => {
  try {
    const input = budgetCreateSchema.parse(request.body);
    const category = await prisma.category.findFirst({ where: { id: input.categoryId, userId: request.user!.id } });
    if (!category) return sendError(response, 404, 'CATEGORY_NOT_FOUND', 'Categoria não encontrada.');
    const budget = await prisma.budget.create({
      data: { userId: request.user!.id, categoryId: input.categoryId, monthlyLimit: input.monthlyLimit },
      include: budgetInclude,
    });
    return response.status(201).json({ data: presentBudget(budget) });
  } catch (error) { return next(error); }
});

router.patch('/:id', async (request: AuthenticatedRequest, response, next) => {
  try {
    const input = budgetUpdateSchema.parse(request.body);
    const existing = await prisma.budget.findFirst({ where: { id: request.params.id, userId: request.user!.id } });
    if (!existing) return sendError(response, 404, 'BUDGET_NOT_FOUND', 'Orçamento não encontrado.');
    const budget = await prisma.budget.update({
      where: { id: existing.id }, data: { monthlyLimit: input.monthlyLimit }, include: budgetInclude,
    });
    return response.json({ data: presentBudget(budget) });
  } catch (error) { return next(error); }
});

router.delete('/:id', async (request: AuthenticatedRequest, response, next) => {
  try {
    const budget = await prisma.budget.findFirst({ where: { id: request.params.id, userId: request.user!.id }, select: { id: true } });
    if (!budget) return sendError(response, 404, 'BUDGET_NOT_FOUND', 'Orçamento não encontrado.');
    await prisma.budget.delete({ where: { id: budget.id } });
    return response.status(204).end();
  } catch (error) { return next(error); }
});

export default router;
