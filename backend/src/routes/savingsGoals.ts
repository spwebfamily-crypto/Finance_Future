import { Prisma } from '@prisma/client';
import { Router } from 'express';
import { requireAuth, sendError } from '../middleware.js';
import { prisma } from '../prisma.js';
import type { AuthenticatedRequest } from '../types.js';
import { savingsGoalCreateSchema, savingsGoalUpdateSchema } from '../validation.js';

const router = Router();
router.use(requireAuth);

const goalSelect = {
  id: true,
  name: true,
  icon: true,
  targetAmount: true,
  currentAmount: true,
  targetDate: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.SavingsGoalSelect;

type PublicGoal = Prisma.SavingsGoalGetPayload<{ select: typeof goalSelect }>;

function presentGoal(goal: PublicGoal) {
  return {
    ...goal,
    targetAmount: goal.targetAmount.toDecimalPlaces(2).toNumber(),
    currentAmount: goal.currentAmount.toDecimalPlaces(2).toNumber(),
  };
}

router.get('/', async (request: AuthenticatedRequest, response, next) => {
  try {
    const goals = await prisma.savingsGoal.findMany({
      where: { userId: request.user!.id },
      select: goalSelect,
      orderBy: [{ targetDate: 'asc' }, { createdAt: 'desc' }],
    });
    return response.json({ data: goals.map(presentGoal) });
  } catch (error) { return next(error); }
});

router.post('/', async (request: AuthenticatedRequest, response, next) => {
  try {
    const input = savingsGoalCreateSchema.parse(request.body);
    const goal = await prisma.savingsGoal.create({
      data: { ...input, icon: input.icon || null, userId: request.user!.id },
      select: goalSelect,
    });
    return response.status(201).json({ data: presentGoal(goal) });
  } catch (error) { return next(error); }
});

router.patch('/:id', async (request: AuthenticatedRequest, response, next) => {
  try {
    const input = savingsGoalUpdateSchema.parse(request.body);
    const existing = await prisma.savingsGoal.findFirst({ where: { id: request.params.id, userId: request.user!.id }, select: { id: true } });
    if (!existing) return sendError(response, 404, 'SAVINGS_GOAL_NOT_FOUND', 'Meta não encontrada.');
    const goal = await prisma.savingsGoal.update({
      where: { id: existing.id },
      data: { ...input, ...(input.icon === undefined ? {} : { icon: input.icon || null }) },
      select: goalSelect,
    });
    return response.json({ data: presentGoal(goal) });
  } catch (error) { return next(error); }
});

router.delete('/:id', async (request: AuthenticatedRequest, response, next) => {
  try {
    const existing = await prisma.savingsGoal.findFirst({ where: { id: request.params.id, userId: request.user!.id }, select: { id: true } });
    if (!existing) return sendError(response, 404, 'SAVINGS_GOAL_NOT_FOUND', 'Meta não encontrada.');
    await prisma.savingsGoal.delete({ where: { id: existing.id } });
    return response.status(204).end();
  } catch (error) { return next(error); }
});

export default router;
