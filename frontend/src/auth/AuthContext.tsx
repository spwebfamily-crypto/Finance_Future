import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { authApi } from "../api/resources";
import { refreshAccessToken } from "../api/client";
import {
  clearSession,
  getAccessToken,
  getRefreshToken,
  getStoredUser,
  saveSession,
} from "../api/token-store";
import { clearOfflineCache } from "../api/offline-cache";
import type { User } from "../types";

interface AuthContextValue {
  user: User | null;
  isAuthenticated: boolean;
  isInitializing: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(() => getStoredUser());
  const [isInitializing, setIsInitializing] = useState(() =>
    Boolean(getRefreshToken() && !getAccessToken()),
  );

  const logout = useCallback(() => {
    // Revoga a sessão no servidor antes de limpar o estado local. O token é
    // lido antes de clearSession; falhas de rede não impedem o logout local.
    const refreshToken = getRefreshToken();
    if (refreshToken) {
      void authApi.logout(refreshToken).catch(() => undefined);
    }
    clearOfflineCache(user);
    clearSession();
    setUser(null);
  }, [user]);

  useEffect(() => {
    const handleExpiredSession = () => logout();
    window.addEventListener("expensesnap:session-expired", handleExpiredSession);
    return () => window.removeEventListener("expensesnap:session-expired", handleExpiredSession);
  }, [logout]);

  useEffect(() => {
    if (!isInitializing) return;
    let active = true;

    refreshAccessToken()
      .catch(() => {
        if (active) logout();
      })
      .finally(() => {
        if (active) setIsInitializing(false);
      });

    return () => {
      active = false;
    };
  }, [isInitializing, logout]);

  const login = useCallback(async (email: string, password: string) => {
    const session = await authApi.login(email, password);
    saveSession(session.accessToken, session.refreshToken, session.user);
    setUser(session.user);
  }, []);

  const register = useCallback(async (name: string, email: string, password: string) => {
    const session = await authApi.register(name, email, password);
    saveSession(session.accessToken, session.refreshToken, session.user);
    setUser(session.user);
  }, []);

  const value = useMemo(
    () => ({ user, isAuthenticated: Boolean(user), isInitializing, login, register, logout }),
    [user, isInitializing, login, register, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth deve ser usado dentro de AuthProvider.");
  return context;
}
