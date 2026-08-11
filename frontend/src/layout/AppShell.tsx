import { CalendarClock, FolderKanban, LayoutDashboard, LogOut, Plus, ReceiptText, TrendingUp, WifiOff } from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import { NavLink, useLocation, useOutlet } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { Brand } from '../components/Brand';
import { ThemeToggle } from '../components/ThemeToggle';
import { preloadDashboardPage, preloadExpenseFormPage, preloadInvestmentsPage, preloadPlanningPage } from '../routePreloads';

const navItems = [
  { to: '/dashboard', label: 'Visão geral', icon: LayoutDashboard, preload: preloadDashboardPage },
  { to: '/expenses', label: 'Despesas', icon: ReceiptText },
  { to: '/planning', label: 'Plano', icon: CalendarClock, preload: preloadPlanningPage },
  { to: '/investments', label: 'Investir', icon: TrendingUp, preload: preloadInvestmentsPage },
  { to: '/categories', label: 'Categorias', icon: FolderKanban },
];

function Navigation({ mobile = false }: { mobile?: boolean }) {
  const items = mobile
    ? [navItems[0], navItems[1], null, navItems[2], navItems[3], navItems[4]]
    : navItems;
  return (
    <nav className={mobile ? 'mobile-nav' : 'side-nav'} aria-label="Navegação principal">
      {items.map((item) => {
        if (!item) {
          return (
            <NavLink
              key="new-expense"
              to="/expenses/new"
              className={({ isActive }) => isActive ? 'mobile-nav__add mobile-nav__add--active' : 'mobile-nav__add'}
              aria-label="Nova despesa"
              onPointerDown={preloadExpenseFormPage}
              onFocus={preloadExpenseFormPage}
            >
              <Plus aria-hidden="true" />
              <span>Novo</span>
            </NavLink>
          );
        }
        const { to, label, icon: Icon, preload } = item;
        return (
          <NavLink
            key={to}
            to={to}
            end={to === '/expenses'}
            className={({ isActive }) => isActive ? 'nav-link nav-link--active' : 'nav-link'}
            onPointerEnter={preload}
            onPointerDown={preload}
            onFocus={preload}
          >
            {({ isActive }) => (
              <>
                <Icon aria-hidden="true" />
                <span>{label}</span>
                {isActive && <motion.span className="nav-link__active-marker" layoutId={mobile ? 'mobile-nav-marker' : 'desktop-nav-marker'} transition={{ type: 'spring', stiffness: 420, damping: 32 }} aria-hidden="true" />}
              </>
            )}
          </NavLink>
        );
      })}
    </nav>
  );
}

export function AppShell() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const outlet = useOutlet();
  const reduceMotion = useReducedMotion();
  const logoutTimerRef = useRef<number | null>(null);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [isOffline, setIsOffline] = useState(() => typeof navigator !== 'undefined' && !navigator.onLine);
  useEffect(() => {
    const online = () => setIsOffline(false);
    const offline = () => setIsOffline(true);
    window.addEventListener('online', online);
    window.addEventListener('offline', offline);
    return () => { window.removeEventListener('online', online); window.removeEventListener('offline', offline); };
  }, []);
  useEffect(() => () => {
    if (logoutTimerRef.current !== null) window.clearTimeout(logoutTimerRef.current);
  }, []);

  function handleLogout() {
    if (isLoggingOut) return;
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
    .join('')
    .toUpperCase();

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">Saltar para o conteúdo</a>
      <aside className="sidebar">
        <Brand phase={isLoggingOut ? 'exit' : 'idle'} />
        <Navigation />
        <NavLink
          className="button button--accent sidebar__add"
          to="/expenses/new"
          onPointerEnter={preloadExpenseFormPage}
          onPointerDown={preloadExpenseFormPage}
          onFocus={preloadExpenseFormPage}
        >
          <Plus aria-hidden="true" /> Nova despesa
        </NavLink>
        <ThemeToggle />
        <div className="account-card">
          <span className="account-card__avatar" aria-hidden="true">{initials}</span>
          <span className="account-card__identity">
            <strong>{user?.name}</strong>
            <small>{user?.email}</small>
          </span>
          <motion.button
            className="icon-button"
            type="button"
            onClick={handleLogout}
            disabled={isLoggingOut}
            aria-busy={isLoggingOut}
            aria-label={isLoggingOut ? 'A terminar sessão' : 'Terminar sessão'}
            title="Terminar sessão"
          >
            <LogOut aria-hidden="true" />
          </motion.button>
        </div>
      </aside>

      <header className="mobile-header">
        <Brand compact phase={isLoggingOut ? 'exit' : 'idle'} />
        <div className="mobile-header__actions">
          <ThemeToggle compact />
          <motion.button
            className="mobile-account"
            type="button"
            onClick={handleLogout}
            disabled={isLoggingOut}
            aria-busy={isLoggingOut}
            aria-label={isLoggingOut ? 'A terminar sessão' : 'Terminar sessão'}
            whileTap={reduceMotion ? undefined : { scale: 0.96 }}
          >
            <span aria-hidden="true">{initials}</span>
            <LogOut aria-hidden="true" />
          </motion.button>
        </div>
      </header>

      <main id="main-content" className="main-content" tabIndex={-1}>
        {isOffline && <div className="offline-banner" role="status"><WifiOff aria-hidden="true" /> Sem ligação. A mostrar os últimos dados guardados.</div>}
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.div
            className="route-stage"
            key={location.pathname}
            initial={reduceMotion ? false : { opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduceMotion ? undefined : { opacity: 0, y: -3, transition: { duration: 0.09, ease: 'easeOut' } }}
            transition={{ duration: reduceMotion ? 0 : 0.16, ease: [0.22, 1, 0.36, 1] }}
          >
            {outlet}
          </motion.div>
        </AnimatePresence>
      </main>
      <Navigation mobile />
    </div>
  );
}
