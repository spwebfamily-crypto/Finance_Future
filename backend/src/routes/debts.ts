import { Prisma } from "@prisma/client";
import { Router } from "express";
import { requireAuth, sendError } from "../middleware.js";
import { prisma } from "../prisma.js";
import type { AuthenticatedRequest } from "../types.js";
import { debtCreateSchema, debtUpdateSchema } from "../validation.js";

const router = Router();
router.use(requireAuth);

const debtSelect = {
  id: true,
  name: true,
  lender: true,
  currentBalance: true,
  annualInterestRate: true,
  monthlyPayment: true,
  nextPaymentDate: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.DebtSelect;

type PublicDebt = Prisma.DebtGetPayload<{ select: typeof debtSelect }>;

function presentDebt(debt: PublicDebt) {
  return {
    ...debt,
    currentBalance: debt.currentBalance.toDecimalPlaces(2).toNumber(),
    annualInterestRate: debt.annualInterestRate.toDecimalPlaces(2).toNumber(),
    monthlyPayment: debt.monthlyPayment.toDecimalPlaces(2).toNumber(),
  };
}

router.get("/", async (request: AuthenticatedRequest, response, next) => {
  try {
    const debts = await prisma.debt.findMany({
      where: { userId: request.user!.id },
      select: debtSelect,
      orderBy: [{ nextPaymentDate: "asc" }, { createdAt: "desc" }],
    });
    return response.json({ data: debts.map(presentDebt) });
  } catch (error) {
    return next(error);
  }
});

router.post("/", async (request: AuthenticatedRequest, response, next) => {
  try {
    const input = debtCreateSchema.parse(request.body);
    const debt = await prisma.debt.create({
      data: { ...input, userId: request.user!.id },
      select: debtSelect,
    });
    return response.status(201).json({ data: presentDebt(debt) });
  } catch (error) {
    return next(error);
  }
});

router.patch("/:id", async (request: AuthenticatedRequest, response, next) => {
  try {
    const input = debtUpdateSchema.parse(request.body);
    const existing = await prisma.debt.findFirst({
      where: { id: request.params.id, userId: request.user!.id },
      select: { id: true },
    });
    if (!existing) return sendError(response, 404, "DEBT_NOT_FOUND", "Dívida não encontrada.");
    const debt = await prisma.debt.update({
      where: { id: existing.id },
      data: input,
      select: debtSelect,
    });
    return response.json({ data: presentDebt(debt) });
  } catch (error) {
    return next(error);
  }
});

router.delete("/:id", async (request: AuthenticatedRequest, response, next) => {
  try {
    const existing = await prisma.debt.findFirst({
      where: { id: request.params.id, userId: request.user!.id },
      select: { id: true },
    });
    if (!existing) return sendError(response, 404, "DEBT_NOT_FOUND", "Dívida não encontrada.");
    await prisma.debt.delete({ where: { id: existing.id } });
    return response.status(204).end();
  } catch (error) {
    return next(error);
  }
});

export default router;
