import { lazy, Suspense, useEffect } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { GuestRoute, ProtectedRoute } from "./auth/ProtectedRoute";
import { AppShell } from "./layout/AppShell";
import { CategoriesPage } from "./pages/CategoriesPage";
import { ExpensesPage } from "./pages/ExpensesPage";
import { ForgotPasswordPage } from "./pages/ForgotPasswordPage";
import { LoginPage } from "./pages/LoginPage";
import { NotFoundPage } from "./pages/NotFoundPage";
import { RegisterPage } from "./pages/RegisterPage";
import { ResetPasswordPage } from "./pages/ResetPasswordPage";
import { VerifyEmailPage } from "./pages/VerifyEmailPage";
import { LoadingState } from "./components/States";
import { RouteTransitionOutlet } from "./components/RouteTransitionOutlet";
import {
  loadAccountDetailPage,
  loadAccountsConnectPage,
  loadAccountsPage,
  loadBankConnectionsPage,
  loadDashboardPage,
  loadExpenseFormPage,
  loadFinancialOnboardingPage,
  loadInvestmentsPage,
  loadPlanningPage,
  loadPrivacyPage,
} from "./routePreloads";

const DashboardPage = lazy(() =>
  loadDashboardPage().then((module) => ({
    default: module.DashboardPage,
  })),
);

const ExpenseFormPage = lazy(() =>
  loadExpenseFormPage().then((module) => ({
    default: module.ExpenseFormPage,
  })),
);

const FinancialOnboardingPage = lazy(() =>
  loadFinancialOnboardingPage().then((module) => ({
    default: module.FinancialOnboardingPage,
  })),
);

const InvestmentsPage = lazy(() =>
  loadInvestmentsPage().then((module) => ({
    default: module.InvestmentsPage,
  })),
);

const PlanningPage = lazy(() =>
  loadPlanningPage().then((module) => ({
    default: module.PlanningPage,
  })),
);

const AccountsPage = lazy(() =>
  loadAccountsPage().then((module) => ({
    default: module.AccountsPage,
  })),
);

const AccountsConnectPage = lazy(() =>
  loadAccountsConnectPage().then((module) => ({
    default: module.AccountsConnectPage,
  })),
);

const BankConnectionsPage = lazy(() =>
  loadBankConnectionsPage().then((module) => ({
    default: module.BankConnectionsPage,
  })),
);

const AccountDetailPage = lazy(() =>
  loadAccountDetailPage().then((module) => ({
    default: module.AccountDetailPage,
  })),
);

const PrivacyPage = lazy(() =>
  loadPrivacyPage().then((module) => ({
    default: module.PrivacyPage,
  })),
);

const routeFallback = (
  <div className="page">
    <LoadingState label="A abrir esta página" />
  </div>
);

const routeTitles: Record<string, string> = {
  "/login": "Entrar",
  "/register": "Criar conta",
  "/forgot-password": "Recuperar palavra-passe",
  "/reset-password": "Nova palavra-passe",
  "/verify-email": "Verificar email",
  "/onboarding": "Começar",
  "/dashboard": "Hoje",
  "/expenses": "Movimentos",
  "/expenses/new": "Nova despesa",
  "/categories": "Categorias",
  "/planning": "Plano",
  "/accounts": "Contas",
  "/accounts/connect": "Ligar banco",
  "/accounts/connections": "Bancos",
  "/privacy": "Privacidade",
  "/investments": "Investir",
};

function titleForPath(pathname: string) {
  if (routeTitles[pathname]) return `${routeTitles[pathname]} · ExpenseSnap`;
  if (/^\/expenses\/[^/]+\/edit$/.test(pathname)) return "Editar despesa · ExpenseSnap";
  if (/^\/accounts\/[^/]+$/.test(pathname)) return "Conta · ExpenseSnap";
  if (pathname === "/") return "ExpenseSnap";
  return "Página não encontrada · ExpenseSnap";
}

function RouteDocumentTitle() {
  const { pathname } = useLocation();
  useEffect(() => {
    document.title = titleForPath(pathname);
  }, [pathname]);
  return null;
}

export default function App() {
  return (
    <>
      <RouteDocumentTitle />
      <Routes>
      <Route element={<GuestRoute />}>
        <Route element={<RouteTransitionOutlet className="guest-route-stage" />}>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        </Route>
      </Route>

      <Route element={<ProtectedRoute />}>
        <Route
          path="/onboarding"
          element={
            <Suspense fallback={routeFallback}>
              <FinancialOnboardingPage />
            </Suspense>
          }
        />
        <Route element={<AppShell />}>
          <Route
            path="/dashboard"
            element={
              <Suspense fallback={routeFallback}>
                <DashboardPage />
              </Suspense>
            }
          />
          <Route path="/expenses" element={<ExpensesPage />} />
          <Route
            path="/expenses/new"
            element={
              <Suspense fallback={routeFallback}>
                <ExpenseFormPage />
              </Suspense>
            }
          />
          <Route
            path="/expenses/:expenseId/edit"
            element={
              <Suspense fallback={routeFallback}>
                <ExpenseFormPage />
              </Suspense>
            }
          />
          <Route path="/categories" element={<CategoriesPage />} />
          <Route
            path="/planning"
            element={
              <Suspense fallback={routeFallback}>
                <PlanningPage />
              </Suspense>
            }
          />
          <Route
            path="/accounts"
            element={
              <Suspense fallback={routeFallback}>
                <AccountsPage />
              </Suspense>
            }
          />
          <Route
            path="/accounts/connect"
            element={
              <Suspense fallback={routeFallback}>
                <AccountsConnectPage />
              </Suspense>
            }
          />
          <Route
            path="/accounts/connections"
            element={
              <Suspense fallback={routeFallback}>
                <BankConnectionsPage />
              </Suspense>
            }
          />
          <Route
            path="/accounts/:accountId"
            element={
              <Suspense fallback={routeFallback}>
                <AccountDetailPage />
              </Suspense>
            }
          />
          <Route
            path="/privacy"
            element={
              <Suspense fallback={routeFallback}>
                <PrivacyPage />
              </Suspense>
            }
          />
          <Route
            path="/investments"
            element={
              <Suspense fallback={routeFallback}>
                <InvestmentsPage />
              </Suspense>
            }
          />
        </Route>
      </Route>

      {/* Público: o link do email é aberto com ou sem sessão ativa no dispositivo. */}
      <Route path="/verify-email" element={<VerifyEmailPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />

      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
    </>
  );
}
