import type {
  ApiEnvelope,
  AuthResponse,
  Category,
  Expense,
  ExpenseFilters,
  ExpenseInput,
  Budget,
  BudgetInput,
  AnalyticsSummary,
  SpendingLevelItem,
  AnalyticsTrend,
  FinancialNote,
  OcrExtraction,
} from '../types';
import { apiRequest } from './client';

function unwrap<T>(payload: ApiEnvelope<T> | T): T {
  if (payload && typeof payload === 'object' && 'data' in payload) {
    return (payload as ApiEnvelope<T>).data;
  }
  return payload as T;
}

function expenseFormData(input: ExpenseInput) {
  const data = new FormData();
  data.set('description', input.description.trim());
  data.set('location', input.location.trim());
  data.set('amount', input.amount);
  data.set('date', input.date);
  data.set('categoryId', input.categoryId);
  if (input.receipt) data.set('receipt', input.receipt);
  if (input.removeReceipt) data.set('removeReceipt', 'true');
  return data;
}

export const authApi = {
  login: (email: string, password: string) =>
    apiRequest<AuthResponse>('/auth/login', {
      method: 'POST',
      auth: false,
      body: { email: email.trim().toLowerCase(), password },
    }),
  register: (name: string, email: string, password: string) =>
    apiRequest<AuthResponse>('/auth/register', {
      method: 'POST',
      auth: false,
      body: { name: name.trim(), email: email.trim().toLowerCase(), password },
    }),
};

export const expenseApi = {
  list: async (filters: ExpenseFilters = {}) => {
    const params = new URLSearchParams();
    if (filters.category) params.set('category', filters.category);
    if (filters.from) params.set('from', filters.from);
    if (filters.to) params.set('to', filters.to);
    const query = params.size ? `?${params.toString()}` : '';
    return unwrap(await apiRequest<ApiEnvelope<Expense[]> | Expense[]>(`/expenses${query}`));
  },
  get: async (id: string) =>
    unwrap(await apiRequest<ApiEnvelope<Expense> | Expense>(`/expenses/${id}`)),
  create: async (input: ExpenseInput) =>
    unwrap(
      await apiRequest<ApiEnvelope<Expense> | Expense>('/expenses', {
        method: 'POST',
        body: expenseFormData(input),
      }),
    ),
  update: async (id: string, input: ExpenseInput) =>
    unwrap(
      await apiRequest<ApiEnvelope<Expense> | Expense>(`/expenses/${id}`, {
        method: 'PATCH',
        body: expenseFormData(input),
      }),
    ),
  remove: (id: string) => apiRequest<void>(`/expenses/${id}`, { method: 'DELETE' }),
};

export const categoryApi = {
  list: async () =>
    unwrap(await apiRequest<ApiEnvelope<Category[]> | Category[]>('/categories')),
  create: async (name: string, icon?: string) =>
    unwrap(
      await apiRequest<ApiEnvelope<Category> | Category>('/categories', {
        method: 'POST',
        body: { name: name.trim(), icon: icon?.trim() || undefined },
      }),
    ),
  update: async (id: string, name: string, icon?: string) =>
    unwrap(
      await apiRequest<ApiEnvelope<Category> | Category>(`/categories/${id}`, {
        method: 'PATCH',
        body: { name: name.trim(), icon: icon?.trim() || undefined },
      }),
    ),
  remove: (id: string) => apiRequest<void>(`/categories/${id}`, { method: 'DELETE' }),
};

export const budgetApi = {
  list: async () => unwrap(await apiRequest<ApiEnvelope<Budget[]> | Budget[]>('/budgets')),
  create: async (input: BudgetInput) =>
    unwrap(await apiRequest<ApiEnvelope<Budget> | Budget>('/budgets', { method: 'POST', body: { ...input } })),
  update: async (id: string, monthlyLimit: number) =>
    unwrap(await apiRequest<ApiEnvelope<Budget> | Budget>(`/budgets/${id}`, { method: 'PATCH', body: { monthlyLimit } })),
  remove: (id: string) => apiRequest<void>(`/budgets/${id}`, { method: 'DELETE' }),
};

export const analyticsApi = {
  summary: async (month: string) =>
    unwrap(await apiRequest<ApiEnvelope<AnalyticsSummary> | AnalyticsSummary>(`/analytics/summary?month=${encodeURIComponent(month)}`)),
  levels: async (month: string) => {
    const payload = unwrap(await apiRequest<ApiEnvelope<SpendingLevelItem[] | { items: SpendingLevelItem[] }> | SpendingLevelItem[]>(`/analytics/levels?month=${encodeURIComponent(month)}`));
    return Array.isArray(payload) ? payload : payload.items;
  },
  trend: async (months = 6, month?: string) => {
    const params = new URLSearchParams({ months: String(months) });
    if (month) params.set('month', month);
    return unwrap(await apiRequest<ApiEnvelope<AnalyticsTrend> | AnalyticsTrend>(`/analytics/trend?${params.toString()}`));
  },
};

export const ocrApi = {
  extract: async (receipt: File) => {
    const formData = new FormData();
    formData.set('receipt', receipt);
    return unwrap(await apiRequest<ApiEnvelope<OcrExtraction> | OcrExtraction>('/ocr/extract', { method: 'POST', body: formData }));
  },
};

export const notesApi = {
  list: async () => unwrap(await apiRequest<ApiEnvelope<FinancialNote[]> | FinancialNote[]>('/notes')),
  generate: async () => unwrap(await apiRequest<ApiEnvelope<FinancialNote> | FinancialNote>('/notes/generate', { method: 'POST' })),
};
