import { Prisma } from '@prisma/client';
import { Router } from 'express';
import { requireAuth, sendError } from '../middleware.js';
import { prisma } from '../prisma.js';
import type { AuthenticatedRequest } from '../types.js';
import { accountCreateSchema, accountUpdateSchema, transferCreateSchema } from '../validation.js';

const router = Router();
router.use(requireAuth);

const accountSelect = {
  id: true,
  name: true,
  type: true,
  openingBalance: true,
  creditLimit: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.AccountSelect;

type PublicAccount = Prisma.AccountGetPayload<{ select: typeof accountSelect }>;

function presentAccount(account: PublicAccount) {
  return {
    ...account,
    openingBalance: account.openingBalance.toDecimalPlaces(2).toNumber(),
    creditLimit: account.creditLimit?.toDecimalPlaces(2).toNumber() ?? null,
  };
}

function sum(values: Prisma.Decimal[]) {
  return values.reduce((total, value) => total.add(value), new Prisma.Decimal(0));
}

router.get('/', async (request: AuthenticatedRequest, response, next) => {
  try {
    const accounts = await prisma.account.findMany({
      where: { userId: request.user!.id },
      select: {
        ...accountSelect,
        expenses: { select: { amount: true } },
        incomes: { select: { amount: true } },
        outgoingTransfers: { select: { amount: true } },
        incomingTransfers: { select: { amount: true } },
      },
      orderBy: [{ type: 'asc' }, { name: 'asc' }],
    });
    return response.json({ data: accounts.map((account) => {
      const balance = account.openingBalance
        .add(sum(account.incomes.map((income) => income.amount)))
        .sub(sum(account.expenses.map((expense) => expense.amount)))
        .sub(sum(account.outgoingTransfers.map((transfer) => transfer.amount)))
        .add(sum(account.incomingTransfers.map((transfer) => transfer.amount)));
      return { ...presentAccount(account), currentBalance: balance.toDecimalPlaces(2).toNumber() };
    }) });
  } catch (error) { return next(error); }
});

router.post('/', async (request: AuthenticatedRequest, response, next) => {
  try {
    const input = accountCreateSchema.parse(request.body);
    const account = await prisma.account.create({
      data: { ...input, creditLimit: input.creditLimit ?? null, userId: request.user!.id },
      select: accountSelect,
    });
    return response.status(201).json({ data: { ...presentAccount(account), currentBalance: presentAccount(account).openingBalance } });
  } catch (error) { return next(error); }
});

router.patch('/:id', async (request: AuthenticatedRequest, response, next) => {
  try {
    const input = accountUpdateSchema.parse(request.body);
    const existing = await prisma.account.findFirst({ where: { id: request.params.id, userId: request.user!.id }, select: { id: true } });
    if (!existing) return sendError(response, 404, 'ACCOUNT_NOT_FOUND', 'Conta não encontrada.');
    const account = await prisma.account.update({
      where: { id: existing.id },
      data: { ...input, ...(input.creditLimit === undefined ? {} : { creditLimit: input.creditLimit ?? null }) },
      select: accountSelect,
    });
    return response.json({ data: presentAccount(account) });
  } catch (error) { return next(error); }
});

router.delete('/:id', async (request: AuthenticatedRequest, response, next) => {
  try {
    const existing = await prisma.account.findFirst({ where: { id: request.params.id, userId: request.user!.id }, select: { id: true } });
    if (!existing) return sendError(response, 404, 'ACCOUNT_NOT_FOUND', 'Conta não encontrada.');
    const transfers = await prisma.transfer.count({ where: { userId: request.user!.id, OR: [{ fromAccountId: existing.id }, { toAccountId: existing.id }] } });
    if (transfers) return sendError(response, 409, 'ACCOUNT_HAS_TRANSFERS', 'Não é possível remover uma conta com transferências.');
    await prisma.account.delete({ where: { id: existing.id } });
    return response.status(204).end();
  } catch (error) { return next(error); }
});

router.get('/transfers', async (request: AuthenticatedRequest, response, next) => {
  try {
    const transfers = await prisma.transfer.findMany({
      where: { userId: request.user!.id },
      select: {
        id: true, amount: true, description: true, date: true, createdAt: true,
        fromAccount: { select: { id: true, name: true } },
        toAccount: { select: { id: true, name: true } },
      },
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
      take: 50,
    });
    return response.json({ data: transfers.map((transfer) => ({ ...transfer, amount: transfer.amount.toDecimalPlaces(2).toNumber() })) });
  } catch (error) { return next(error); }
});

router.post('/transfers', async (request: AuthenticatedRequest, response, next) => {
  try {
    const input = transferCreateSchema.parse(request.body);
    const accounts = await prisma.account.findMany({
      where: { userId: request.user!.id, id: { in: [input.fromAccountId, input.toAccountId] } },
      select: { id: true },
    });
    if (accounts.length !== 2) return sendError(response, 404, 'ACCOUNT_NOT_FOUND', 'Uma das contas não foi encontrada.');
    const transfer = await prisma.transfer.create({
      data: { ...input, description: input.description || null, userId: request.user!.id },
      include: { fromAccount: { select: { id: true, name: true } }, toAccount: { select: { id: true, name: true } } },
    });
    return response.status(201).json({ data: { ...transfer, amount: transfer.amount.toDecimalPlaces(2).toNumber() } });
  } catch (error) { return next(error); }
});

export default router;
