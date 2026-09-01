import { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { GuestRoute, ProtectedRoute } from "./auth/ProtectedRoute";
import { AppShell } from "./layout/AppShell";
import { CategoriesPage } from "./pages/CategoriesPage";
import { ExpensesPage } from "./pages/ExpensesPage";
import { LoginPage } from "./pages/LoginPage";
import { NotFoundPage } from "./pages/NotFoundPage";
import { RegisterPage } from "./pages/RegisterPage";
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

export default function App() {
  return (
    <Routes>
      <Route element={<GuestRoute />}>
        <Route element={<RouteTransitionOutlet className="guest-route-stage" />}>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
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

      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
