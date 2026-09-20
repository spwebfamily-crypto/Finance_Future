import {
  AlertTriangle,
  Building2,
  CalendarClock,
  FolderOpen,
  Landmark,
  LayoutDashboard,
  LogOut,
  MoreHorizontal,
  Plus,
  ReceiptText,
  Shield,
  TrendingUp,
  WifiOff,
  X,
} from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { NavLink, useLocation, useOutlet } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { Brand } from "../components/Brand";
import { ThemeToggle } from "../components/ThemeToggle";
import { CommandPaletteProvider, CommandPaletteTrigger } from "../components/CommandPalette";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { EmailVerificationBanner } from "../components/EmailVerificationBanner";
import { DailyBankReviewModal } from "../components/DailyBankReviewModal";
import { NotificationCenter } from "../components/NotificationCenter";
import { openBankingApi } from "../api/resources";
import { notifyBankSyncCompleted } from "../api/bank-sync-events";
import { errorMessage } from "../api/client";
import { LanguageSwitcher, useI18n } from "../i18n/I18nContext";
import type { BankSyncJob } from "../types";
import { bankSyncResultMessage, isBankSyncPending, isBankSyncSuccessful } from "../utils/bankSync";
import {
  preloadAccountsPage,
  preloadBankConnectionsPage,
  preloadDashboardPage,
  preloadCategoriesPage,
  preloadExpenseFormPage,
  preloadExpensesPage,
  preloadInvestmentsPage,
  preloadPlanningPage,
  preloadPrivacyPage,
} from "../routePreloads";
import { routes } from "../routes";

const navItems = [
  { to: routes.dashboard, label: "Hoje", icon: LayoutDashboard, preload: preloadDashboardPage },
  { to: routes.expenses, label: "Movimentos", icon: ReceiptText, preload: preloadExpensesPage },
  { to: routes.accounts, label: "Contas", icon: Landmark, preload: preloadAccountsPage },
  { to: routes.planning, label: "Plano", icon: CalendarClock, preload: preloadPlanningPage },
  { to: routes.investments, label: "Investir", icon: TrendingUp, preload: preloadInvestmentsPage },
];

const moreItems = [
  { to: routes.planning, label: "Plano", icon: CalendarClock, preload: preloadPlanningPage },
  { to: routes.investments, label: "Investir", icon: TrendingUp, preload: preloadInvestmentsPage },
  {
    to: routes.bankConnections,
    label: "Bancos",
    icon: Building2,
    preload: preloadBankConnectionsPage,
  },
  { to: routes.privacy, label: "Privacidade", icon: Shield, preload: preloadPrivacyPage },
  { to: routes.categories, label: "Categorias", icon: FolderOpen, preload: preloadCategoriesPage },
];

const morePaths = moreItems.map((item) => item.to);

const secondaryLinks = [
  { to: routes.bankConnections, label: "Bancos", preload: preloadBankConnectionsPage },
  { to: routes.privacy, label: "Privacidade", preload: preloadPrivacyPage },
];

async function waitForBankSync(jobId: string, connectionId: string): Promise<BankSyncJob | null> {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const job = await openBankingApi.syncJob(jobId);
    if (!isBankSyncPending(job)) {
      if (isBankSyncSuccessful(job)) notifyBankSyncCompleted(connectionId);
      return job;
    }
    await new Promise((resolve) => window.setTimeout(resolve, 1500));
  }
  return null;
}

function DesktopNavigation() {
  const { t } = useI18n();
  return (
    <nav className="side-nav" aria-label={t("Navegação principal")}>
      {navItems.map(({ to, label, icon: Icon, preload }) => (
        <NavLink
          key={to}
          to={to}
          end={to === "/expenses"}
          className={({ isActive }) => (isActive ? "nav-link nav-link--active" : "nav-link")}
          onPointerEnter={preload}
          onPointerDown={preload}
          onFocus={preload}
        >
          {({ isActive }) => (
            <>
              <Icon aria-hidden="true" />
              <span>{t(label)}</span>
              {isActive && (
                <motion.span
                  className="nav-link__active-marker"
                  layoutId="desktop-nav-marker"
                  transition={{ type: "spring", stiffness: 420, damping: 32 }}
                  aria-hidden="true"
                />
              )}
            </>
          )}
        </NavLink>
      ))}
    </nav>
  );
}

function MobileNavigation({
  moreOpen,
  onToggleMore,
  onNavigate,
}: {
  moreOpen: boolean;
  onToggleMore: () => void;
  onNavigate: () => void;
}) {
  const { t } = useI18n();
  const location = useLocation();
  const moreActive = morePaths.some(
    (path) => location.pathname === path || location.pathname.startsWith(`${path}/`),
  );
  const tabs = [navItems[0], navItems[1], "new" as const, navItems[2], "more" as const];

  return (
    <nav className="mobile-nav" aria-label={t("Navegação principal")}>
      {tabs.map((item) => {
        if (item === "new") {
          return (
            <NavLink
              key="new-expense"
              to={routes.newExpense}
              className={({ isActive }) =>
                isActive ? "mobile-nav__add mobile-nav__add--active" : "mobile-nav__add"
              }
              aria-label={t("Nova despesa")}
              onClick={onNavigate}
              onPointerDown={preloadExpenseFormPage}
              onFocus={preloadExpenseFormPage}
            >
              <Plus aria-hidden="true" />
              <span>{t("Novo")}</span>
            </NavLink>
          );
        }
        if (item === "more") {
          return (
            <button
              key="more"
              type="button"
              className={moreOpen || moreActive ? "nav-link nav-link--active" : "nav-link"}
              aria-expanded={moreOpen}
              aria-controls="more-sheet"
              onClick={onToggleMore}
            >
              <MoreHorizontal aria-hidden="true" />
              <span>{t("Mais")}</span>
              {(moreOpen || moreActive) && (
                <motion.span
                  className="nav-link__active-marker"
                  layoutId="mobile-nav-marker"
                  transition={{ type: "spring", stiffness: 420, damping: 32 }}
                  aria-hidden="true"
                />
              )}
            </button>
          );
        }
        const { to, label, icon: Icon, preload } = item;
        return (
          <NavLink
            key={to}
            to={to}
            end={to === routes.expenses || to === routes.accounts}
            className={({ isActive }) => (isActive ? "nav-link nav-link--active" : "nav-link")}
            onClick={onNavigate}
            onPointerEnter={preload}
            onPointerDown={preload}
            onFocus={preload}
          >
            {({ isActive }) => (
              <>
                <Icon aria-hidden="true" />
                <span>{t(label)}</span>
                {isActive && (
                  <motion.span
                    className="nav-link__active-marker"
                    layoutId="mobile-nav-marker"
                    transition={{ type: "spring", stiffness: 420, damping: 32 }}
                    aria-hidden="true"
                  />
                )}
              </>
            )}
          </NavLink>
        );
      })}
    </nav>
  );
}

function MoreSheet({
  open,
  onClose,
  onLogout,
}: {
  open: boolean;
  onClose: () => void;
  onLogout: () => void;
}) {
  const { t } = useI18n();
  const dialogRef = useRef<HTMLElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    if (!open) return;
    const previouslyFocused =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const frame = window.requestAnimationFrame(() => closeRef.current?.focus());
    return () => {
      window.cancelAnimationFrame(frame);
      if (previouslyFocused?.isConnected) previouslyFocused.focus();
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = Array.from(
        dialogRef.current?.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ) ?? [],
      );
      if (!focusable.length) {
        event.preventDefault();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      if (event.shiftKey && (active === first || !dialogRef.current?.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="more-sheet-backdrop"
          role="presentation"
          initial={reduceMotion ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={reduceMotion ? undefined : { opacity: 0 }}
          transition={{ duration: reduceMotion ? 0 : 0.16 }}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) onClose();
          }}
        >
          <motion.section
            id="more-sheet"
            ref={dialogRef}
            className="more-sheet"
            role="dialog"
            aria-modal="true"
            aria-labelledby="more-sheet-title"
            initial={reduceMotion ? false : { opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduceMotion ? undefined : { opacity: 0, y: 16 }}
            transition={{ duration: reduceMotion ? 0 : 0.2, ease: [0.16, 1, 0.3, 1] }}
          >
            <div className="more-sheet__header">
              <h2 id="more-sheet-title">{t("Mais")}</h2>
              <button ref={closeRef} className="text-button" type="button" onClick={onClose}>
                {t("Fechar")}
              </button>
            </div>
            <nav className="more-sheet__nav" aria-label={t("Mais páginas")}>
              {moreItems.map(({ to, label, icon: Icon, preload }) => (
                <NavLink
                  key={to}
                  to={to}
                  className={({ isActive }) =>
                    isActive ? "more-sheet__link is-active" : "more-sheet__link"
                  }
                  onClick={onClose}
                  onPointerEnter={preload}
                  onFocus={preload}
                >
                  <Icon aria-hidden="true" />
                  {t(label)}
                </NavLink>
              ))}
            </nav>
            <div className="more-sheet__preferences" aria-label={t("Preferências")}>
              <ThemeToggle />
              <LanguageSwitcher />
            </div>
            <button className="more-sheet__logout" type="button" onClick={onLogout}>
              <LogOut aria-hidden="true" /> {t("Terminar sessão")}
            </button>
          </motion.section>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function AppShell() {
  const { t } = useI18n();
  const { user, logout } = useAuth();
  const location = useLocation();
  const outlet = useOutlet();
  const reduceMotion = useReducedMotion();
  const logoutTimerRef = useRef<number | null>(null);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [logoutConfirmOpen, setLogoutConfirmOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [isOffline, setIsOffline] = useState(
    () => typeof navigator !== "undefined" && !navigator.onLine,
  );
  const [bankSyncError, setBankSyncError] = useState("");
  const autoSyncUserRef = useRef<string | null>(null);

  useEffect(() => {
    if (!user?.id || isOffline || autoSyncUserRef.current === user.id) return;
    autoSyncUserRef.current = user.id;
    let active = true;
    void (async () => {
      try {
        const connections = await openBankingApi.connections();
        if (!active) return;
        const results = await Promise.allSettled(
          connections
            .filter((connection) => connection.status === "active" && connection.accountCount > 0)
            .map(async (connection) => {
              const job = await openBankingApi.sync(connection.id);
              return waitForBankSync(job.jobId, connection.id);
            }),
        );
        if (!active) return;
        const failed = results
          .filter(
            (result): result is PromiseFulfilledResult<BankSyncJob | null> =>
              result.status === "fulfilled",
          )
          .map((result) => result.value)
          .find((job): job is BankSyncJob => job?.status === "failed");
        const rejected = results.find(
          (result): result is PromiseRejectedResult => result.status === "rejected",
        );
        if (failed) setBankSyncError(bankSyncResultMessage(failed, t));
        else if (rejected) setBankSyncError(errorMessage(rejected.reason));
      } catch (requestError) {
        if (active) setBankSyncError(errorMessage(requestError));
      }
    })();
    return () => {
      active = false;
    };
  }, [isOffline, t, user?.id]);

  useEffect(() => {
    const online = () => setIsOffline(false);
    const offline = () => setIsOffline(true);
    window.addEventListener("online", online);
    window.addEventListener("offline", offline);
    return () => {
      window.removeEventListener("online", online);
      window.removeEventListener("offline", offline);
    };
  }, []);
  useEffect(
    () => () => {
      if (logoutTimerRef.current !== null) window.clearTimeout(logoutTimerRef.current);
    },
    [],
  );

  function requestLogout() {
    setMoreOpen(false);
    setLogoutConfirmOpen(true);
  }

  function confirmLogout() {
    if (isLoggingOut) return;
    setLogoutConfirmOpen(false);
    setIsLoggingOut(true);
    if (reduceMotion) {
      logout();
      return;
    }
    logoutTimerRef.current = window.setTimeout(logout, 90);
  }

  const initials = user?.name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0))
    .join("")
    .toUpperCase();

  return (
    <CommandPaletteProvider>
      <div className="app-shell">
        <a className="skip-link" href="#main-content">
          {t("Saltar para o conteúdo")}
        </a>
        <aside className="sidebar">
          <Brand phase={isLoggingOut ? "exit" : "idle"} />
          <p className="sidebar__eyebrow">{t("O seu espaço financeiro")}</p>
          <DesktopNavigation />
          <NavLink
            className="button button--accent sidebar__add"
            to={routes.newExpense}
            onPointerEnter={preloadExpenseFormPage}
            onPointerDown={preloadExpenseFormPage}
            onFocus={preloadExpenseFormPage}
          >
            <Plus aria-hidden="true" /> {t("Registar despesa")}
          </NavLink>
          <div className="sidebar__tools">
            <NotificationCenter />
            <CommandPaletteTrigger compact />
            <ThemeToggle compact />
            <LanguageSwitcher />
          </div>
          <nav className="sidebar__secondary" aria-label={t("Ferramentas e ligações")}>
            <p className="sidebar__section-label">{t("Ferramentas")}</p>
            {secondaryLinks.map(({ to, label, preload }) => (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) =>
                  isActive ? "sidebar__secondary-link is-active" : "sidebar__secondary-link"
                }
                onPointerEnter={preload}
                onFocus={preload}
              >
                {t(label)}
              </NavLink>
            ))}
          </nav>
          <div className="account-card">
            <span className="account-card__avatar" aria-hidden="true">
              {initials}
            </span>
            <span className="account-card__identity">
              <strong>{user?.name}</strong>
              <small>{user?.email}</small>
            </span>
            <motion.button
              className="icon-button"
              type="button"
              onClick={requestLogout}
              disabled={isLoggingOut}
              aria-busy={isLoggingOut}
              aria-label={isLoggingOut ? t("A terminar sessão") : t("Terminar sessão")}
              title={t("Terminar sessão")}
            >
              <LogOut aria-hidden="true" />
            </motion.button>
          </div>
        </aside>

        <header className="mobile-header">
          <Brand compact phase={isLoggingOut ? "exit" : "idle"} />
          <div className="mobile-header__actions">
            <NotificationCenter compact />
            <CommandPaletteTrigger compact />
            <ThemeToggle compact />
            <LanguageSwitcher compact />
            <motion.button
              className="mobile-account"
              type="button"
              onClick={requestLogout}
              disabled={isLoggingOut}
              aria-busy={isLoggingOut}
              aria-label={isLoggingOut ? t("A terminar sessão") : t("Terminar sessão")}
              whileTap={reduceMotion ? undefined : { scale: 0.96 }}
            >
              <span aria-hidden="true">{initials}</span>
              <LogOut aria-hidden="true" />
            </motion.button>
          </div>
        </header>

        <main id="main-content" className="main-content" tabIndex={-1}>
          {isOffline && (
            <div className="offline-banner" role="status">
              <WifiOff aria-hidden="true" />{" "}
              {t("Sem ligação. A mostrar os últimos dados guardados.")}
            </div>
          )}
          {bankSyncError && !isOffline && (
            <div className="bank-sync-banner" role="alert">
              <AlertTriangle aria-hidden="true" />
              <span>{bankSyncError}</span>
              <NavLink to={routes.bankConnections}>{t("Ver bancos")}</NavLink>
              <button
                type="button"
                className="icon-button"
                onClick={() => setBankSyncError("")}
                aria-label={t("Fechar aviso")}
              >
                <X aria-hidden="true" />
              </button>
            </div>
          )}
          <EmailVerificationBanner />
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.div
              className="route-stage"
              key={location.pathname}
              initial={reduceMotion ? false : { opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={
                reduceMotion
                  ? undefined
                  : { opacity: 0, y: -3, transition: { duration: 0.09, ease: "easeOut" } }
              }
              transition={{ duration: reduceMotion ? 0 : 0.16, ease: [0.22, 1, 0.36, 1] }}
            >
              {outlet}
            </motion.div>
          </AnimatePresence>
        </main>
        <MobileNavigation
          moreOpen={moreOpen}
          onToggleMore={() => setMoreOpen((open) => !open)}
          onNavigate={() => setMoreOpen(false)}
        />
        <MoreSheet open={moreOpen} onClose={() => setMoreOpen(false)} onLogout={requestLogout} />
        <ConfirmDialog
          open={logoutConfirmOpen}
          title={t("Terminar sessão?")}
          description={t("Vai sair desta conta neste dispositivo.")}
          confirmLabel={t("Terminar sessão")}
          onCancel={() => setLogoutConfirmOpen(false)}
          onConfirm={confirmLogout}
        />
        <DailyBankReviewModal />
      </div>
    </CommandPaletteProvider>
  );
}
