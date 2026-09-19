export const loadDashboardPage = () => import("./pages/DashboardPage");
export const loadLoginPage = () => import("./pages/LoginPage");
export const loadRegisterPage = () => import("./pages/RegisterPage");
export const loadExpensesPage = () => import("./pages/ExpensesPage");
export const loadCategoriesPage = () => import("./pages/CategoriesPage");
export const loadExpenseFormPage = () => import("./pages/ExpenseFormPage");
export const loadFinancialOnboardingPage = () => import("./pages/FinancialOnboardingPage");
export const loadInvestmentsPage = () => import("./pages/InvestmentsPage");
export const loadPlanningPage = () => import("./pages/PlanningPage");
export const loadAccountsPage = () => import("./pages/AccountsPage");
export const loadAccountsConnectPage = () => import("./pages/AccountsConnectPage");
export const loadBankConnectionsPage = () => import("./pages/BankConnectionsPage");
export const loadAccountDetailPage = () => import("./pages/AccountDetailPage");
export const loadPrivacyPage = () => import("./pages/PrivacyPage");

export function preloadDashboardPage() {
  void loadDashboardPage();
}

export function preloadLoginPage() {
  void loadLoginPage();
}

export function preloadRegisterPage() {
  void loadRegisterPage();
}

export function preloadExpensesPage() {
  void loadExpensesPage();
}

export function preloadCategoriesPage() {
  void loadCategoriesPage();
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

export function preloadPlanningPage() {
  void loadPlanningPage();
}

export function preloadAccountsPage() {
  void loadAccountsPage();
}

export function preloadAccountsConnectPage() {
  void loadAccountsConnectPage();
}

export function preloadBankConnectionsPage() {
  void loadBankConnectionsPage();
}

export function preloadAccountDetailPage() {
  void loadAccountDetailPage();
}

export function preloadPrivacyPage() {
  void loadPrivacyPage();
}
