import { FolderKanban, LayoutDashboard, LogOut, Plus, ReceiptText, WifiOff } from 'lucide-react';
import { useEffect, useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { Brand } from '../components/Brand';

const navItems = [
  { to: '/dashboard', label: 'Visão geral', icon: LayoutDashboard },
  { to: '/expenses', label: 'Despesas', icon: ReceiptText },
  { to: '/categories', label: 'Categorias', icon: FolderKanban },
];

function Navigation({ mobile = false }: { mobile?: boolean }) {
  return (
    <nav className={mobile ? 'mobile-nav' : 'side-nav'} aria-label="Navegação principal">
      {navItems.map(({ to, label, icon: Icon }) => (
        <NavLink
          key={to}
          to={to}
          end={to === '/expenses'}
          className={({ isActive }) => isActive ? 'nav-link nav-link--active' : 'nav-link'}
        >
          <Icon aria-hidden="true" />
          <span>{label}</span>
        </NavLink>
      ))}
      {mobile && (
        <NavLink to="/expenses/new" className="mobile-nav__add" aria-label="Nova despesa">
          <Plus aria-hidden="true" />
        </NavLink>
      )}
    </nav>
  );
}

export function AppShell() {
  const { user, logout } = useAuth();
  const [isOffline, setIsOffline] = useState(() => typeof navigator !== 'undefined' && !navigator.onLine);
  useEffect(() => {
    const online = () => setIsOffline(false);
    const offline = () => setIsOffline(true);
    window.addEventListener('online', online);
    window.addEventListener('offline', offline);
    return () => { window.removeEventListener('online', online); window.removeEventListener('offline', offline); };
  }, []);
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
        <Brand />
        <div className="sidebar__rule"><span>01—</span></div>
        <Navigation />
        <NavLink className="button button--accent sidebar__add" to="/expenses/new">
          <Plus aria-hidden="true" /> Nova despesa
        </NavLink>
        <div className="account-card">
          <span className="account-card__avatar" aria-hidden="true">{initials}</span>
          <span className="account-card__identity">
            <strong>{user?.name}</strong>
            <small>{user?.email}</small>
          </span>
          <button className="icon-button" type="button" onClick={logout} aria-label="Terminar sessão" title="Terminar sessão">
            <LogOut aria-hidden="true" />
          </button>
        </div>
      </aside>

      <header className="mobile-header">
        <Brand compact />
        <button className="mobile-account" type="button" onClick={logout} aria-label="Terminar sessão">
          <span aria-hidden="true">{initials}</span>
          <LogOut aria-hidden="true" />
        </button>
      </header>

      <main id="main-content" className="main-content" tabIndex={-1}>
        {isOffline && <div className="offline-banner" role="status"><WifiOff aria-hidden="true" /> Sem ligação. A mostrar os últimos dados guardados.</div>}
        <Outlet />
      </main>
      <Navigation mobile />
    </div>
  );
}
