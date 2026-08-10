export const loadDashboardPage = () => import('./pages/DashboardPage');
export const loadExpenseFormPage = () => import('./pages/ExpenseFormPage');
export const loadFinancialOnboardingPage = () => import('./pages/FinancialOnboardingPage');
export const loadInvestmentsPage = () => import('./pages/InvestmentsPage');

export function preloadDashboardPage() {
  void loadDashboardPage();
}

export function preloadExpenseFormPage() {
  void loadExpenseFormPage();
}

export function preloadFinancialOnboardingPage() {
  void loadFinancialOnboardingPage();
}

export function preloadInvestmentsPage() {
  void loadInvestmentsPage();
}
