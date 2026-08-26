import type { FinancialProfile } from "@prisma/client";
import { Router } from "express";
import { requireAuth } from "../middleware.js";
import { prisma } from "../prisma.js";
import type { AuthenticatedRequest, FinancialProfileResponse } from "../types.js";
import { financialProfileUpsertSchema } from "../validation.js";

const router = Router();
router.use((_request, response, next) => {
  response.set({
    "Cache-Control": "private, no-store",
    Pragma: "no-cache",
    Expires: "0",
  });
  next();
});
router.use(requireAuth);

function presentFinancialProfile(profile: FinancialProfile): FinancialProfileResponse {
  return {
    id: profile.id,
    monthlyNetIncome: profile.monthlyNetIncome.toDecimalPlaces(2).toNumber(),
    monthlyEssentialCosts: profile.monthlyEssentialCosts.toDecimalPlaces(2).toNumber(),
    monthlyHousingCosts: profile.monthlyHousingCosts.toDecimalPlaces(2).toNumber(),
    monthlyDebtPayments: profile.monthlyDebtPayments.toDecimalPlaces(2).toNumber(),
    currentSavings: profile.currentSavings.toDecimalPlaces(2).toNumber(),
    goal: profile.goal,
    horizon: profile.horizon,
    experience: profile.experience,
    riskTolerance: profile.riskTolerance,
    createdAt: profile.createdAt.toISOString(),
    updatedAt: profile.updatedAt.toISOString(),
  };
}

router.get("/", async (request: AuthenticatedRequest, response, next) => {
  try {
    const profile = await prisma.financialProfile.findUnique({
      where: { userId: request.user!.id },
    });

    return response.json({ data: profile ? presentFinancialProfile(profile) : null });
  } catch (error) {
    return next(error);
  }
});

router.put("/", async (request: AuthenticatedRequest, response, next) => {
  try {
    const input = financialProfileUpsertSchema.parse(request.body);
    const profile = await prisma.financialProfile.upsert({
      where: { userId: request.user!.id },
      create: {
        userId: request.user!.id,
        ...input,
      },
      update: input,
    });

    return response.json({ data: presentFinancialProfile(profile) });
  } catch (error) {
    return next(error);
  }
});

router.delete("/", async (request: AuthenticatedRequest, response, next) => {
  try {
    // Idempotente: apagar novamente continua a produzir o mesmo estado final.
    await prisma.financialProfile.deleteMany({ where: { userId: request.user!.id } });
    return response.status(204).end();
  } catch (error) {
    return next(error);
  }
});

export default router;
