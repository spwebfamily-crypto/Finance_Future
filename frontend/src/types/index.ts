export interface User {
  id: string;
  name: string;
  email: string;
  currency: string;
}

export interface AuthResponse {
  user: User;
  accessToken: string;
  refreshToken: string;
}

export interface RefreshResponse {
  accessToken: string;
  refreshToken: string;
}

export interface Category {
  id: string;
  name: string;
  icon?: string | null;
  isDefault: boolean;
}

export interface Expense {
  id: string;
  categoryId: string;
  category: Category;
  description: string;
  location: string;
  amount: string | number;
  date: string;
  receiptImageUrl?: string | null;
  receiptMimeType?: 'application/pdf' | 'image/*' | null;
  createdAt?: string;
}

export interface ExpenseFilters {
  category?: string;
  from?: string;
  to?: string;
}

export interface ExpenseInput {
  description: string;
  location: string;
  amount: string;
  date: string;
  categoryId: string;
  receipt?: File | null;
  removeReceipt?: boolean;
}

export interface ApiEnvelope<T> {
  data: T;
}

export interface ApiErrorPayload {
  error?: {
    code?: string;
    message?: string;
    details?: unknown;
  };
  message?: string;
}

export interface Budget {
  id: string;
  categoryId: string;
  category: Category;
  monthlyLimit: number;
}

export interface BudgetInput {
  categoryId: string;
  monthlyLimit: number;
}

export interface CategorySummary {
  category: Category;
  amount: number;
  previousAmount: number;
  changeAmount: number;
  changePercent: number | null;
  sharePercent: number;
}

export interface AnalyticsSummary {
  month: string;
  timeZone: string;
  currency: string;
  total: number;
  previousMonthTotal: number;
  changeAmount: number;
  changePercent: number | null;
  byCategory: CategorySummary[];
}

export type SpendingLevel = 'normal' | 'high' | 'critical' | 'insufficient_data';

export interface SpendingLevelItem {
  category: Category;
  level: SpendingLevel;
  basis: 'budget' | 'history' | 'none';
  currentAmount: number;
  projectedAmount: number;
  baselineAmount: number | null;
  comparisonRatio: number | null;
  budget: Budget | null;
  history: LevelHistoryPoint[];
}

export interface LevelHistoryPoint {
  month: string;
  amount: number;
}

export interface TrendPoint {
  month: string;
  total: number;
}

export interface AnalyticsTrend {
  timeZone: string;
  currency: string;
  series: TrendPoint[];
}

export type FinancialGoal =
  | 'emergency_fund'
  | 'debt_repayment'
  | 'home_purchase'
  | 'major_purchase'
  | 'education'
  | 'retirement'
  | 'wealth_growth'
  | 'other';

export type FinancialHorizon = 'short_term' | 'medium_term' | 'long_term';
export type FinancialExperience = 'none' | 'beginner' | 'intermediate' | 'advanced';
export type RiskTolerance = 'conservative' | 'moderate' | 'aggressive';

export interface FinancialProfileInput {
  monthlyNetIncome: number;
  monthlyEssentialCosts: number;
  monthlyHousingCosts: number;
  monthlyDebtPayments: number;
  currentSavings: number;
  goal: FinancialGoal;
  horizon: FinancialHorizon;
  experience: FinancialExperience;
  riskTolerance: RiskTolerance;
}

export interface FinancialProfile extends FinancialProfileInput {
  id: string;
  createdAt: string;
  updatedAt: string;
}
