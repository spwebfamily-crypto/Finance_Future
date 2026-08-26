import type {
  FinancialExperience,
  FinancialGoal,
  FinancialHorizon,
  RiskTolerance,
} from "@prisma/client";
import type { Request } from "express";

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email: string;
  };
}

export interface FinancialProfileResponse {
  id: string;
  monthlyNetIncome: number;
  monthlyEssentialCosts: number;
  monthlyHousingCosts: number;
  monthlyDebtPayments: number;
  currentSavings: number;
  goal: FinancialGoal;
  horizon: FinancialHorizon;
  experience: FinancialExperience;
  riskTolerance: RiskTolerance;
  createdAt: string;
  updatedAt: string;
}
