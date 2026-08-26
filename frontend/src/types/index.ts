export interface User {
  id: string;
  name: string;
  email: string;
  currency: string;
  timeZone?: string;
}

// Type alias (e não interface) para ser atribuível a Record<string, unknown>.
export type UserProfileInput = {
  name?: string;
  currency?: string;
  timeZone?: string;
};

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
  accountId?: string | null;
  category: Category;
  account?: FinancialAccount | null;
  description: string;
  location: string;
  amount: string | number;
  date: string;
  receiptImageUrl?: string | null;
  receiptMimeType?: "application/pdf" | "image/*" | null;
  createdAt?: string;
}

export interface ExpenseFilters {
  category?: string;
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
}

export interface PaginatedMeta {
  page: number;
  pageSize: number;
  total: number;
  pageCount: number;
}

export interface PaginatedResult<T> {
  data: T[];
  meta: PaginatedMeta;
}

export interface ExpenseInput {
  description: string;
  location: string;
  amount: string;
  date: string;
  categoryId: string;
  accountId?: string | null;
  receipt?: File | null;
  removeReceipt?: boolean;
}

export interface Income {
  id: string;
  description: string;
  source?: string | null;
  accountId?: string | null;
  account?: FinancialAccount | null;
  amount: number;
  date: string;
  createdAt: string;
  updatedAt: string;
}

export interface IncomeInput {
  description: string;
  source?: string;
  amount: number;
  date: string;
  accountId?: string | null;
}

export interface SavingsGoal {
  id: string;
  name: string;
  icon?: string | null;
  targetAmount: number;
  currentAmount: number;
  targetDate?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SavingsGoalInput {
  name: string;
  icon?: string;
  targetAmount: number;
  currentAmount?: number;
  targetDate?: string | null;
}

export interface RecurringExpense {
  id: string;
  categoryId: string;
  accountId?: string | null;
  category: Category;
  account?: FinancialAccount | null;
  description: string;
  location: string;
  amount: number;
  dayOfMonth: number;
  nextDueDate: string;
  isActive: boolean;
  lastPaidAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface RecurringExpenseInput {
  description: string;
  location: string;
  amount: number;
  categoryId: string;
  accountId?: string | null;
  dayOfMonth: number;
}

export type AccountType = "current" | "savings" | "cash" | "credit_card" | "other";

export interface FinancialAccount {
  id: string;
  name: string;
  type: AccountType;
  openingBalance: number;
  creditLimit?: number | null;
  currentBalance?: number;
  createdAt: string;
  updatedAt: string;
}

export interface FinancialAccountInput {
  name: string;
  type: AccountType;
  openingBalance?: number;
  creditLimit?: number;
}

export interface FinancialAccountBalanceCorrectionInput {
  currentBalance: number;
}

export interface AccountTransfer {
  id: string;
  amount: number;
  description?: string | null;
  date: string;
  createdAt: string;
  fromAccount: Pick<FinancialAccount, "id" | "name">;
  toAccount: Pick<FinancialAccount, "id" | "name">;
}

export interface AccountTransferInput {
  fromAccountId: string;
  toAccountId: string;
  amount: number;
  description?: string;
  date: string;
}

export interface RecurringIncome {
  id: string;
  accountId?: string | null;
  account?: FinancialAccount | null;
  description: string;
  source?: string | null;
  amount: number;
  dayOfMonth: number;
  nextDueDate: string;
  isActive: boolean;
  lastReceivedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface RecurringIncomeInput {
  description: string;
  source?: string;
  amount: number;
  accountId?: string | null;
  dayOfMonth: number;
}

export interface Debt {
  id: string;
  name: string;
  lender: string;
  currentBalance: number;
  annualInterestRate: number;
  monthlyPayment: number;
  nextPaymentDate?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DebtInput {
  name: string;
  lender: string;
  currentBalance: number;
  annualInterestRate: number;
  monthlyPayment: number;
  nextPaymentDate?: string | null;
}

export interface ExpenseImportResult {
  imported: number;
  skipped: number;
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
  byDay?: DailyTotal[];
  byCategory: CategorySummary[];
}

export interface DailyTotal {
  day: string;
  total: number;
}

export type SpendingLevel = "normal" | "high" | "critical" | "insufficient_data";

export interface SpendingLevelItem {
  category: Category;
  level: SpendingLevel;
  basis: "budget" | "history" | "none";
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
  | "emergency_fund"
  | "debt_repayment"
  | "home_purchase"
  | "major_purchase"
  | "education"
  | "retirement"
  | "wealth_growth"
  | "other";

export type FinancialHorizon = "short_term" | "medium_term" | "long_term";
export type FinancialExperience = "none" | "beginner" | "intermediate" | "advanced";
export type RiskTolerance = "conservative" | "moderate" | "aggressive";

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
