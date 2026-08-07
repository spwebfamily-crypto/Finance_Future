import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from './AuthContext';
import { FullPageLoader } from '../components/States';

export function ProtectedRoute() {
  const { isAuthenticated, isInitializing } = useAuth();
  const location = useLocation();

  if (isInitializing) return <FullPageLoader label="A recuperar a sua sessão" />;
  if (!isAuthenticated) return <Navigate to="/login" replace state={{ from: location }} />;
  return <Outlet />;
}

export function GuestRoute() {
  const { isAuthenticated, isInitializing } = useAuth();

  if (isInitializing) return <FullPageLoader label="A recuperar a sua sessão" />;
  if (isAuthenticated) return <Navigate to="/expenses" replace />;
  return <Outlet />;
}
