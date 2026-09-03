import type {
  ApiEnvelope,
  AuthResponse,
  BankAuthorization,
  BankConnectionDetail,
  BankConnectionSummary,
  BankDisconnectResult,
  BankInstitution,
  BankSyncJob,
  BankTransaction,
  BankTransactionFilters,
  BankTransactionReviewInput,
  BankRetention,
  PsuType,
  Category,
  Expense,
  ExpenseFilters,
  ExpenseInput,
  Budget,
  BudgetInput,
  AnalyticsSummary,
  TodaySummary,
  SpendingLevelItem,
  AnalyticsTrend,
  FinancialProfile,
  FinancialProfileInput,
  Income,
  IncomeInput,
  RecurringExpense,
  RecurringExpenseInput,
  SavingsGoal,
  SavingsGoalInput,
  AccountTransfer,
  AccountTransferInput,
  Debt,
  DebtInput,
  ExpenseImportResult,
  FinancialAccount,
  FinancialAccountBalanceCorrectionInput,
  FinancialAccountInput,
  RecurringIncome,
  RecurringIncomeInput,
  PaginatedMeta,
  UserProfileInput,
  User,
} from "../types";
import { apiRequest } from "./client";

function unwrap<T>(payload: ApiEnvelope<T> | T): T {
  if (payload && typeof payload === "object" && "data" in payload) {
    return (payload as ApiEnvelope<T>).data;
  }
  return payload as T;
}

function expenseRequestBody(input: ExpenseInput) {
  const fields = {
    description: input.description.trim(),
    location: input.location.trim(),
    amount: input.amount,
    date: input.date,
    categoryId: input.categoryId,
    ...(input.accountId === undefined ? {} : { accountId: input.accountId || "" }),
    ...(input.removeReceipt ? { removeReceipt: true } : {}),
  };
  if (!input.receipt) return fields;

  const data = new FormData();
  Object.entries(fields).forEach(([key, value]) => data.set(key, String(value)));
  data.set("receipt", input.receipt);
  return data;
}

export const authApi = {
  login: (email: string, password: string) =>
    apiRequest<AuthResponse>("/auth/login", {
      method: "POST",
      auth: false,
      body: { email: email.trim().toLowerCase(), password },
    }),
  register: (name: string, email: string, password: string) =>
    apiRequest<AuthResponse>("/auth/register", {
      method: "POST",
      auth: false,
      body: { name: name.trim(), email: email.trim().toLowerCase(), password },
    }),
  logout: async (refreshToken: string) =>
    unwrap(
      await apiRequest<ApiEnvelope<{ ok: true }>>("/auth/logout", {
        method: "POST",
        auth: false,
        body: { refreshToken },
      }),
    ),
  verifyEmail: async (token: string) => {
    const payload = await apiRequest<ApiEnvelope<{ user: User }> | { user: User }>(
      "/auth/verify-email",
      { method: "POST", auth: false, body: { token } },
    );
    return unwrap(payload).user;
  },
  resendVerification: async () =>
    unwrap(
      await apiRequest<ApiEnvelope<{ ok: true }>>("/auth/resend-verification", {
        method: "POST",
      }),
    ),
  me: async () => unwrap(await apiRequest<ApiEnvelope<User> | User>("/auth/me")),
  forgotPassword: async (email: string) =>
    unwrap(
      await apiRequest<ApiEnvelope<{ ok: true }>>("/auth/forgot-password", {
        method: "POST",
        auth: false,
        body: { email: email.trim().toLowerCase() },
      }),
    ),
  resetPassword: async (token: string, password: string) =>
    unwrap(
      await apiRequest<ApiEnvelope<{ ok: true }>>("/auth/reset-password", {
        method: "POST",
        auth: false,
        body: { token, password },
      }),
    ),
  updateProfile: (input: UserProfileInput) =>
    unwrap(
      apiRequest<ApiEnvelope<User> | User>("/auth/me", {
        method: "PATCH",
        body: input,
      }),
    ),
};

export const expenseApi = {
  list: async (filters: ExpenseFilters = {}) => {
    const params = new URLSearchParams();
    if (filters.category) params.set("category", filters.category);
    if (filters.from) params.set("from", filters.from);
    if (filters.to) params.set("to", filters.to);
    if (filters.page) params.set("page", String(filters.page));
    if (filters.pageSize) params.set("pageSize", String(filters.pageSize));
    const query = params.size ? `?${params.toString()}` : "";
    const envelope = await apiRequest<ApiEnvelope<Expense[]> & { meta?: PaginatedMeta }>(
      `/expenses${query}`,
    );
    const data = unwrap(envelope);
    const meta =
      envelope && typeof envelope === "object" && "meta" in envelope && envelope.meta
        ? envelope.meta
        : { page: 1, pageSize: filters.pageSize ?? 100, total: data.length, pageCount: 1 };
    return { data, meta };
  },
  get: async (id: string) =>
    unwrap(await apiRequest<ApiEnvelope<Expense> | Expense>(`/expenses/${id}`)),
  create: async (input: ExpenseInput) =>
    unwrap(
      await apiRequest<ApiEnvelope<Expense> | Expense>("/expenses", {
        method: "POST",
        body: expenseRequestBody(input),
      }),
    ),
  update: async (id: string, input: ExpenseInput) =>
    unwrap(
      await apiRequest<ApiEnvelope<Expense> | Expense>(`/expenses/${id}`, {
        method: "PATCH",
        body: expenseRequestBody(input),
      }),
    ),
  remove: (id: string) => apiRequest<void>(`/expenses/${id}`, { method: "DELETE" }),
  import: async (items: ExpenseInput[]) =>
    unwrap(
      await apiRequest<ApiEnvelope<ExpenseImportResult> | ExpenseImportResult>("/expenses/import", {
        method: "POST",
        body: { items },
      }),
    ),
};

export const categoryApi = {
  list: async () => unwrap(await apiRequest<ApiEnvelope<Category[]> | Category[]>("/categories")),
  create: async (name: string, icon?: string) =>
    unwrap(
      await apiRequest<ApiEnvelope<Category> | Category>("/categories", {
        method: "POST",
        body: { name: name.trim(), icon: icon?.trim() || undefined },
      }),
    ),
  update: async (id: string, name: string, icon?: string) =>
    unwrap(
      await apiRequest<ApiEnvelope<Category> | Category>(`/categories/${id}`, {
        method: "PATCH",
        body: { name: name.trim(), icon: icon?.trim() || undefined },
      }),
    ),
  remove: (id: string) => apiRequest<void>(`/categories/${id}`, { method: "DELETE" }),
};

export const budgetApi = {
  list: async () => unwrap(await apiRequest<ApiEnvelope<Budget[]> | Budget[]>("/budgets")),
  create: async (input: BudgetInput) =>
    unwrap(
      await apiRequest<ApiEnvelope<Budget> | Budget>("/budgets", {
        method: "POST",
        body: { ...input },
      }),
    ),
  update: async (id: string, monthlyLimit: number) =>
    unwrap(
      await apiRequest<ApiEnvelope<Budget> | Budget>(`/budgets/${id}`, {
        method: "PATCH",
        body: { monthlyLimit },
      }),
    ),
  remove: (id: string) => apiRequest<void>(`/budgets/${id}`, { method: "DELETE" }),
};

export const analyticsApi = {
  today: async () =>
    unwrap(await apiRequest<ApiEnvelope<TodaySummary> | TodaySummary>("/analytics/today")),
  summary: async (month: string) =>
    unwrap(
      await apiRequest<ApiEnvelope<AnalyticsSummary> | AnalyticsSummary>(
        `/analytics/summary?month=${encodeURIComponent(month)}`,
      ),
    ),
  levels: async (month: string) => {
    const payload = unwrap(
      await apiRequest<
        ApiEnvelope<SpendingLevelItem[] | { items: SpendingLevelItem[] }> | SpendingLevelItem[]
      >(`/analytics/levels?month=${encodeURIComponent(month)}`),
    );
    return Array.isArray(payload) ? payload : payload.items;
  },
  trend: async (months = 6, month?: string) => {
    const params = new URLSearchParams({ months: String(months) });
    if (month) params.set("month", month);
    return unwrap(
      await apiRequest<ApiEnvelope<AnalyticsTrend> | AnalyticsTrend>(
        `/analytics/trend?${params.toString()}`,
      ),
    );
  },
};

export const financialProfileApi = {
  get: async () =>
    unwrap(
      await apiRequest<ApiEnvelope<FinancialProfile | null> | FinancialProfile | null>(
        "/financial-profile",
        { cacheResponse: false },
      ),
    ),
  save: async (input: FinancialProfileInput) =>
    unwrap(
      await apiRequest<ApiEnvelope<FinancialProfile> | FinancialProfile>("/financial-profile", {
        method: "PUT",
        body: { ...input },
      }),
    ),
  remove: () => apiRequest<void>("/financial-profile", { method: "DELETE", cacheResponse: false }),
};

export const incomeApi = {
  list: async () => unwrap(await apiRequest<ApiEnvelope<Income[]> | Income[]>("/incomes")),
  create: async (input: IncomeInput) =>
    unwrap(
      await apiRequest<ApiEnvelope<Income> | Income>("/incomes", {
        method: "POST",
        body: { ...input },
      }),
    ),
  update: async (id: string, input: Partial<IncomeInput>) =>
    unwrap(
      await apiRequest<ApiEnvelope<Income> | Income>(`/incomes/${id}`, {
        method: "PATCH",
        body: { ...input },
      }),
    ),
  remove: (id: string) => apiRequest<void>(`/incomes/${id}`, { method: "DELETE" }),
};

export const savingsGoalApi = {
  list: async () =>
    unwrap(await apiRequest<ApiEnvelope<SavingsGoal[]> | SavingsGoal[]>("/savings-goals")),
  create: async (input: SavingsGoalInput) =>
    unwrap(
      await apiRequest<ApiEnvelope<SavingsGoal> | SavingsGoal>("/savings-goals", {
        method: "POST",
        body: { ...input },
      }),
    ),
  update: async (id: string, input: Partial<SavingsGoalInput>) =>
    unwrap(
      await apiRequest<ApiEnvelope<SavingsGoal> | SavingsGoal>(`/savings-goals/${id}`, {
        method: "PATCH",
        body: { ...input },
      }),
    ),
  remove: (id: string) => apiRequest<void>(`/savings-goals/${id}`, { method: "DELETE" }),
};

export const recurringExpenseApi = {
  list: async () =>
    unwrap(
      await apiRequest<ApiEnvelope<RecurringExpense[]> | RecurringExpense[]>("/recurring-expenses"),
    ),
  create: async (input: RecurringExpenseInput) =>
    unwrap(
      await apiRequest<ApiEnvelope<RecurringExpense> | RecurringExpense>("/recurring-expenses", {
        method: "POST",
        body: { ...input },
      }),
    ),
  update: async (id: string, input: Partial<RecurringExpenseInput & { isActive: boolean }>) =>
    unwrap(
      await apiRequest<ApiEnvelope<RecurringExpense> | RecurringExpense>(
        `/recurring-expenses/${id}`,
        { method: "PATCH", body: { ...input } },
      ),
    ),
  record: async (id: string) =>
    unwrap(
      await apiRequest<ApiEnvelope<RecurringExpense> | RecurringExpense>(
        `/recurring-expenses/${id}/record`,
        { method: "POST" },
      ),
    ),
  remove: (id: string) => apiRequest<void>(`/recurring-expenses/${id}`, { method: "DELETE" }),
};

export const accountApi = {
  list: async () =>
    unwrap(await apiRequest<ApiEnvelope<FinancialAccount[]> | FinancialAccount[]>("/accounts")),
  create: async (input: FinancialAccountInput) =>
    unwrap(
      await apiRequest<ApiEnvelope<FinancialAccount> | FinancialAccount>("/accounts", {
        method: "POST",
        body: { ...input },
      }),
    ),
  update: async (id: string, input: Partial<FinancialAccountInput>) =>
    unwrap(
      await apiRequest<ApiEnvelope<FinancialAccount> | FinancialAccount>(`/accounts/${id}`, {
        method: "PATCH",
        body: { ...input },
      }),
    ),
  correctBalance: async (id: string, input: FinancialAccountBalanceCorrectionInput) =>
    unwrap(
      await apiRequest<ApiEnvelope<FinancialAccount> | FinancialAccount>(
        `/accounts/${id}/balance`,
        { method: "PATCH", body: { ...input } },
      ),
    ),
  remove: (id: string) => apiRequest<void>(`/accounts/${id}`, { method: "DELETE" }),
  transfers: async () =>
    unwrap(
      await apiRequest<ApiEnvelope<AccountTransfer[]> | AccountTransfer[]>("/accounts/transfers"),
    ),
  transfer: async (input: AccountTransferInput) =>
    unwrap(
      await apiRequest<ApiEnvelope<AccountTransfer> | AccountTransfer>("/accounts/transfers", {
        method: "POST",
        body: { ...input },
      }),
    ),
};

export const recurringIncomeApi = {
  list: async () =>
    unwrap(
      await apiRequest<ApiEnvelope<RecurringIncome[]> | RecurringIncome[]>("/recurring-incomes"),
    ),
  create: async (input: RecurringIncomeInput) =>
    unwrap(
      await apiRequest<ApiEnvelope<RecurringIncome> | RecurringIncome>("/recurring-incomes", {
        method: "POST",
        body: { ...input },
      }),
    ),
  update: async (id: string, input: Partial<RecurringIncomeInput & { isActive: boolean }>) =>
    unwrap(
      await apiRequest<ApiEnvelope<RecurringIncome> | RecurringIncome>(`/recurring-incomes/${id}`, {
        method: "PATCH",
        body: { ...input },
      }),
    ),
  record: async (id: string) =>
    unwrap(
      await apiRequest<ApiEnvelope<RecurringIncome> | RecurringIncome>(
        `/recurring-incomes/${id}/record`,
        { method: "POST" },
      ),
    ),
  remove: (id: string) => apiRequest<void>(`/recurring-incomes/${id}`, { method: "DELETE" }),
};

export const debtApi = {
  list: async () => unwrap(await apiRequest<ApiEnvelope<Debt[]> | Debt[]>("/debts")),
  create: async (input: DebtInput) =>
    unwrap(
      await apiRequest<ApiEnvelope<Debt> | Debt>("/debts", { method: "POST", body: { ...input } }),
    ),
  update: async (id: string, input: Partial<DebtInput>) =>
    unwrap(
      await apiRequest<ApiEnvelope<Debt> | Debt>(`/debts/${id}`, {
        method: "PATCH",
        body: { ...input },
      }),
    ),
  remove: (id: string) => apiRequest<void>(`/debts/${id}`, { method: "DELETE" }),
};

/**
 * Open Banking. Nenhum destes pedidos é guardado no cache offline: saldos,
 * ligações e movimentos bancários não ficam em localStorage.
 */
export const openBankingApi = {
  institutions: async (country = "PT", psuType: PsuType = "personal") => {
    const params = new URLSearchParams({ country, psuType });
    return unwrap(
      await apiRequest<ApiEnvelope<BankInstitution[]> | BankInstitution[]>(
        `/open-banking/institutions?${params.toString()}`,
        { cacheResponse: false },
      ),
    );
  },
  authorize: async (input: {
    institutionId: string;
    country: string;
    psuType: PsuType;
    returnPath: string;
  }) =>
    unwrap(
      await apiRequest<ApiEnvelope<BankAuthorization> | BankAuthorization>(
        "/open-banking/authorizations",
        { method: "POST", body: { ...input }, cacheResponse: false },
      ),
    ),
  connections: async () =>
    unwrap(
      await apiRequest<ApiEnvelope<BankConnectionSummary[]> | BankConnectionSummary[]>(
        "/open-banking/connections",
        { cacheResponse: false },
      ),
    ),
  connection: async (connectionId: string) =>
    unwrap(
      await apiRequest<ApiEnvelope<BankConnectionDetail> | BankConnectionDetail>(
        `/open-banking/connections/${connectionId}`,
        { cacheResponse: false },
      ),
    ),
  sync: async (connectionId: string) =>
    unwrap(
      await apiRequest<
        ApiEnvelope<{ jobId: string; status: string }> | { jobId: string; status: string }
      >(`/open-banking/connections/${connectionId}/sync`, { method: "POST", cacheResponse: false }),
    ),
  reauthorize: async (connectionId: string, psuType: PsuType = "personal", country = "PT") =>
    unwrap(
      await apiRequest<ApiEnvelope<BankAuthorization> | BankAuthorization>(
        `/open-banking/connections/${connectionId}/reauthorize`,
        {
          method: "POST",
          body: { country, psuType, returnPath: "/accounts/connections" },
          cacheResponse: false,
        },
      ),
    ),
  disconnect: async (connectionId: string, retention: BankRetention) =>
    unwrap(
      await apiRequest<ApiEnvelope<BankDisconnectResult> | BankDisconnectResult>(
        `/open-banking/connections/${connectionId}/disconnect`,
        { method: "POST", body: { retention }, cacheResponse: false },
      ),
    ),
  syncJob: async (jobId: string) =>
    unwrap(
      await apiRequest<ApiEnvelope<BankSyncJob> | BankSyncJob>(`/open-banking/sync-jobs/${jobId}`, {
        cacheResponse: false,
      }),
    ),
  transactions: async (filters: BankTransactionFilters = {}) => {
    const params = new URLSearchParams();
    if (filters.accountId) params.set("accountId", filters.accountId);
    if (filters.connectionId) params.set("connectionId", filters.connectionId);
    if (filters.status) params.set("status", filters.status);
    if (filters.classification) params.set("classification", filters.classification);
    if (filters.from) params.set("from", filters.from);
    if (filters.to) params.set("to", filters.to);
    if (filters.page) params.set("page", String(filters.page));
    if (filters.pageSize) params.set("pageSize", String(filters.pageSize));
    const query = params.size ? `?${params.toString()}` : "";
    const envelope = await apiRequest<ApiEnvelope<BankTransaction[]> & { meta?: PaginatedMeta }>(
      `/open-banking/transactions${query}`,
      { cacheResponse: false },
    );
    const data = unwrap(envelope);
    const meta =
      envelope && typeof envelope === "object" && "meta" in envelope && envelope.meta
        ? envelope.meta
        : { page: 1, pageSize: filters.pageSize ?? 50, total: data.length, pageCount: 1 };
    return { data, meta };
  },
  reviewTransaction: async (transactionId: string, input: BankTransactionReviewInput) =>
    unwrap(
      await apiRequest<ApiEnvelope<BankTransaction> | BankTransaction>(
        `/open-banking/transactions/${transactionId}`,
        { method: "PATCH", body: { ...input }, cacheResponse: false },
      ),
    ),
};
