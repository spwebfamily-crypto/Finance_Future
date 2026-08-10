export const loadDashboardPage = () => import('./pages/DashboardPage');
export const loadExpenseFormPage = () => import('./pages/ExpenseFormPage');

export function preloadDashboardPage() {
  void loadDashboardPage();
}

export function preloadExpenseFormPage() {
  void loadExpenseFormPage();
}
