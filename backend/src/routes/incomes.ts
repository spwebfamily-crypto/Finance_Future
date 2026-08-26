import { Prisma } from "@prisma/client";
import { Router } from "express";
import { requireAuth, sendError } from "../middleware.js";
import { prisma } from "../prisma.js";
import type { AuthenticatedRequest } from "../types.js";
import { incomeCreateSchema, incomeUpdateSchema } from "../validation.js";

const router = Router();
router.use(requireAuth);

const incomeSelect = {
  id: true,
  description: true,
  source: true,
  amount: true,
  date: true,
  createdAt: true,
  updatedAt: true,
  account: { select: { id: true, name: true, type: true } },
} satisfies Prisma.IncomeSelect;

type PublicIncome = Prisma.IncomeGetPayload<{ select: typeof incomeSelect }>;

function presentIncome(income: PublicIncome) {
  return { ...income, amount: income.amount.toDecimalPlaces(2).toNumber() };
}

async function accountBelongsToUser(accountId: string, userId: string) {
  return prisma.account.findFirst({ where: { id: accountId, userId }, select: { id: true } });
}

router.get("/", async (request: AuthenticatedRequest, response, next) => {
  try {
    const incomes = await prisma.income.findMany({
      where: { userId: request.user!.id },
      select: incomeSelect,
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    });
    return response.json({ data: incomes.map(presentIncome) });
  } catch (error) {
    return next(error);
  }
});

router.post("/", async (request: AuthenticatedRequest, response, next) => {
  try {
    const input = incomeCreateSchema.parse(request.body);
    if (input.accountId && !(await accountBelongsToUser(input.accountId, request.user!.id))) {
      return sendError(response, 404, "ACCOUNT_NOT_FOUND", "Conta não encontrada.");
    }
    const income = await prisma.income.create({
      data: {
        ...input,
        source: input.source || null,
        accountId: input.accountId ?? null,
        userId: request.user!.id,
      },
      select: incomeSelect,
    });
    return response.status(201).json({ data: presentIncome(income) });
  } catch (error) {
    return next(error);
  }
});

router.patch("/:id", async (request: AuthenticatedRequest, response, next) => {
  try {
    const input = incomeUpdateSchema.parse(request.body);
    const existing = await prisma.income.findFirst({
      where: { id: request.params.id, userId: request.user!.id },
      select: { id: true },
    });
    if (!existing)
      return sendError(response, 404, "INCOME_NOT_FOUND", "Rendimento não encontrado.");
    if (input.accountId && !(await accountBelongsToUser(input.accountId, request.user!.id))) {
      return sendError(response, 404, "ACCOUNT_NOT_FOUND", "Conta não encontrada.");
    }
    const income = await prisma.income.update({
      where: { id: existing.id },
      data: { ...input, ...(input.source === undefined ? {} : { source: input.source || null }) },
      select: incomeSelect,
    });
    return response.json({ data: presentIncome(income) });
  } catch (error) {
    return next(error);
  }
});

router.delete("/:id", async (request: AuthenticatedRequest, response, next) => {
  try {
    const existing = await prisma.income.findFirst({
      where: { id: request.params.id, userId: request.user!.id },
      select: { id: true },
    });
    if (!existing)
      return sendError(response, 404, "INCOME_NOT_FOUND", "Rendimento não encontrado.");
    await prisma.income.delete({ where: { id: existing.id } });
    return response.status(204).end();
  } catch (error) {
    return next(error);
  }
});

export default router;
