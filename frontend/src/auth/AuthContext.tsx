import {
  createContext,
  startTransition,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useNavigate } from "react-router-dom";
import { authApi } from "../api/resources";
import { refreshAccessToken } from "../api/client";
import {
  clearSession,
  getAccessToken,
  getRefreshToken,
  getStoredUser,
  saveSession,
  saveStoredUser,
} from "../api/token-store";
import { clearOfflineCache } from "../api/offline-cache";
import type { User } from "../types";

interface AuthContextValue {
  user: User | null;
  isAuthenticated: boolean;
  isInitializing: boolean;
  login: (email: string, password: string, destination?: string) => Promise<void>;
  register: (name: string, email: string, password: string, destination?: string) => Promise<void>;
  logout: () => void;
  /** Sincroniza o utilizador em memória e em armazenamento (ex.: após verificar o email). */
  applyUser: (user: User) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
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

  // Localização e estado de autenticação têm de se tornar visíveis NO MESMO
  // commit: o React Router v7 trata navigate() como transição concorrente;
  // se setUser fosse síncrono, existiria um commit intermédio com a página de
  // guest (ex.: /register) já autenticada e o GuestRoute redirecionava para
  // /expenses antes da transição do destino se concretizar.
  const applySession = useCallback(
    (session: { accessToken: string; refreshToken: string; user: User }, destination: string) => {
      saveSession(session.accessToken, session.refreshToken, session.user);
      navigate(destination, { replace: true });
      startTransition(() => {
        setUser(session.user);
      });
    },
    [navigate],
  );

  const login = useCallback(
    async (email: string, password: string, destination = "/expenses") => {
      const session = await authApi.login(email, password);
      applySession(session, destination);
    },
    [applySession],
  );

  const register = useCallback(
    async (name: string, email: string, password: string, destination = "/onboarding") => {
      const session = await authApi.register(name, email, password);
      applySession(session, destination);
    },
    [applySession],
  );

  const applyUser = useCallback((nextUser: User) => {
    saveStoredUser(nextUser);
    setUser(nextUser);
  }, []);

  const value = useMemo(
    () => ({
      user,
      isAuthenticated: Boolean(user),
      isInitializing,
      login,
      register,
      logout,
      applyUser,
    }),
    [user, isInitializing, login, register, logout, applyUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth deve ser usado dentro de AuthProvider.");
  return context;
}
