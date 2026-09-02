export interface User {
  id: string;
  name: string;
  email: string;
  currency: string;
  timeZone?: string;
  /** Ausente em sessões guardadas antes da verificação por email existir. */
  emailVerified?: boolean;
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
  source?: "manual" | "bank";
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

export type AccountSource = "manual" | "bank";

export type BalanceSource = "derived" | "provider";

export interface FinancialAccount {
  id: string;
  name: string;
  type: AccountType;
  source?: AccountSource;
  currency?: string;
  openingBalance: number;
  creditLimit?: number | null;
  currentBalance?: number;
  availableBalance?: number | null;
  derivedBalance?: number;
  providerBalance?: number | null;
  balanceDelta?: number | null;
  balanceSource?: BalanceSource;
  balanceAsOf?: string | null;
  connectionStatus?: BankConnectionStatus | null;
  lastSyncedAt?: string | null;
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

export interface TodayActivityItem {
  id: string;
  type: "expense" | "income" | "transfer";
  description: string;
  amount: number;
  date: string;
  accountName: string | null;
  categoryName: string | null;
  categoryIcon: string | null;
  source: "manual" | "bank";
}

export interface TodaySummary {
  date: string;
  timeZone: string;
  currency: string;
  expenseTotal: number;
  incomeTotal: number;
  netTotal: number;
  items: TodayActivityItem[];
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

// ---------------------------------------------------------------------------
// Open Banking (somente leitura)
// ---------------------------------------------------------------------------

export type BankConnectionStatus =
  "pending" | "active" | "reauth_required" | "expired" | "revoked" | "disconnected" | "error";

export type BankTransactionStatus = "pending" | "booked" | "rejected" | "removed";

export type BankTransactionClassification =
  "unreviewed" | "expense" | "income" | "internal_transfer" | "ignored" | "refund";

export type BankSyncJobStatus = "queued" | "running" | "completed" | "partial" | "failed";

export type PsuType = "personal" | "business";

export type BankRetention = "keep_imported" | "delete_imported";

export interface BankInstitution {
  id: string;
  name: string;
  country: string;
  logoUrl: string | null;
  supportsPersonal: boolean;
  supportsBusiness: boolean;
}

export interface BankAuthorization {
  authorizationUrl: string;
  expiresAt: string;
  institutionName: string;
}

export interface BankConnectionAccount {
  id: string;
  accountId: string;
  displayName: string;
  maskedIban: string | null;
  currency: string;
}

export interface BankConnectionSummary {
  id: string;
  institutionId: string;
  institutionName: string;
  institutionCountry: string;
  status: BankConnectionStatus;
  consentExpiresAt: string | null;
  lastSyncedAt: string | null;
  nextSyncAt: string | null;
  error: { code: string; at: string | null } | null;
  accountCount: number;
  accounts: BankConnectionAccount[];
  createdAt: string;
}

export interface BankSyncJob {
  id: string;
  connectionId: string;
  status: BankSyncJobStatus;
  trigger: "initial" | "manual" | "scheduled" | "reauthorization";
  attemptCount: number;
  startedAt: string | null;
  finishedAt: string | null;
  accountsProcessed: number;
  transactionsCreated: number;
  transactionsUpdated: number;
  transactionsSkipped: number;
  errorCode: string | null;
  createdAt: string;
}

export interface BankConnectionDetail extends Omit<BankConnectionSummary, "accounts"> {
  accounts: Array<
    BankConnectionAccount & {
      lastTransactionSyncAt: string | null;
      account: { id: string; name: string; type: AccountType; source: AccountSource };
    }
  >;
  lastSyncJob: BankSyncJob | null;
}

export interface BankTransaction {
  id: string;
  status: BankTransactionStatus;
  direction: "debit" | "credit";
  amount: number;
  currency: string;
  bookingDate: string | null;
  valueDate: string | null;
  transactionDate: string | null;
  description: string;
  counterpartyName: string | null;
  classification: BankTransactionClassification;
  excludedFromAnalytics: boolean;
  expenseId: string | null;
  incomeId: string | null;
  transferId: string | null;
  bankAccountLinkId: string;
  bankAccountLink: {
    id: string;
    displayName: string;
    maskedIban: string | null;
    accountId: string;
    connectionId: string;
  };
  expense: {
    id: string;
    categoryId: string;
    category: Pick<Category, "id" | "name" | "icon">;
  } | null;
}

export interface BankTransactionFilters {
  accountId?: string;
  connectionId?: string;
  status?: BankTransactionStatus;
  classification?: BankTransactionClassification;
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
}

export interface BankTransactionReviewInput {
  categoryId?: string;
  classification?: BankTransactionClassification;
  excludedFromAnalytics?: boolean;
  confirmInternalTransfer?: boolean;
}

export interface BankDisconnectResult {
  connectionId: string;
  retention: BankRetention;
  accountsKept: number;
  accountsDeleted: number;
  expensesDeleted: number;
  incomesDeleted: number;
  transfersDeleted: number;
  transactionsDeleted: number;
  sessionRevoked: boolean;
}
