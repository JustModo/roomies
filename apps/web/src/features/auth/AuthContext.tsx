import { createContext, useContext, useState, useEffect, useCallback, useMemo, useSyncExternalStore, ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { UserProfile } from '@roomies/contracts';
import { useServices } from '../../app/ServicesProvider';

export type SessionEndReason = 'disconnected' | 'kicked' | 'account_deleted';

interface AuthContextType {
  user: UserProfile | null;
  token: string | null;
  isLoading: boolean;
  logout: () => void;
  endSession: (reason?: SessionEndReason) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const REFRESH_LEAD_MS = 5 * 60 * 1000;
const FALLBACK_REFRESH_MS = 50 * 60 * 1000;
const RETRY_REFRESH_MS = 30 * 1000;

function refreshDelay(token: string): number {
  try {
    const { exp } = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    if (typeof exp === 'number') return Math.max(0, exp * 1000 - Date.now() - REFRESH_LEAD_MS);
  } catch {
    return FALLBACK_REFRESH_MS;
  }
  return FALLBACK_REFRESH_MS;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const { api } = useServices();
  const navigate = useNavigate();
  const session = useSyncExternalStore(api.subscribe, api.getSession);
  const [isLoading, setIsLoading] = useState(true);
  const token = session?.token ?? null;

  const endSession = useCallback(
    (reason: SessionEndReason = 'disconnected') => {
      api.setSession(null);
      navigate(`/login?reason=${reason}`, { replace: true });
    },
    [api, navigate],
  );

  useEffect(() => {
    api
      .refresh()
      .catch((err) => console.error('[auth] Failed to restore session:', err))
      .finally(() => setIsLoading(false));
  }, [api]);

  useEffect(() => {
    if (!token) return;
    let timer: ReturnType<typeof setTimeout>;
    const schedule = (delay: number) => {
      timer = setTimeout(() => {
        api
          .refresh()
          .then((next) => {
            if (!next) endSession();
          })
          .catch(() => schedule(RETRY_REFRESH_MS));
      }, delay);
    };
    schedule(refreshDelay(token));
    return () => clearTimeout(timer);
  }, [api, token, endSession]);

  useEffect(() => api.onUnauthorized(() => endSession()), [api, endSession]);

  const value = useMemo(
    () => ({ user: session?.user ?? null, token, isLoading, logout: api.logout, endSession }),
    [session, token, isLoading, api, endSession],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
