import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { authApi, type Role, type User } from '../api/auth';
import { refreshTokens, tokens } from '../api/http';

interface AuthState {
  /** undefined — ещё восстанавливаем сессию после перезагрузки страницы. */
  user: User | null | undefined;
  login(email: string, password: string): Promise<void>;
  logout(): Promise<void>;
  /** Перечитать профиль: роли могли поменяться. */
  reload(): Promise<void>;
  /** Сессия уже завершена на сервере, осталось забыть токены. */
  forget(): void;
  hasRole(...roles: Role[]): boolean;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null | undefined>(undefined);

  const forget = useCallback(() => {
    tokens.clear();
    setUser(null);
  }, []);

  useEffect(() => {
    tokens.onSessionLost(() => setUser(null));
    let cancelled = false;
    (async () => {
      if (!tokens.hasRefreshToken() || !(await refreshTokens())) {
        if (!cancelled) setUser(null);
        return;
      }
      try {
        const me = await authApi.me();
        if (!cancelled) setUser(me);
      } catch {
        if (!cancelled) setUser(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    tokens.store(await authApi.login(email, password));
    setUser(await authApi.me());
  }, []);

  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } finally {
      forget();
    }
  }, [forget]);

  const reload = useCallback(async () => {
    setUser(await authApi.me());
  }, []);

  const value = useMemo<AuthState>(
    () => ({
      user,
      login,
      logout,
      reload,
      forget,
      hasRole: (...roles) => !!user && roles.some((role) => user.roles.includes(role)),
    }),
    [user, login, logout, reload, forget],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth вне AuthProvider');
  return context;
}
