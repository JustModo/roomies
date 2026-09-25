import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { API_BASE_URL, applySession, refreshSession, setSessionHandler, setUnauthorizedHandler } from '../api/client';
import { AuthResponse, UserProfile } from '@roomies/contracts';

interface AuthContextType {
  user: UserProfile | null;
  token: string | null;
  isLoading: boolean;
  setSession: (session: AuthResponse) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const REFRESH_LEAD_MS = 5 * 60 * 1000;
const FALLBACK_REFRESH_MS = 50 * 60 * 1000;
const RETRY_REFRESH_MS = 30 * 1000;

function refreshDelay(token: string): number {
  try {
    const { exp } = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    if (typeof exp === 'number') return Math.max(0, exp * 1000 - Date.now() - REFRESH_LEAD_MS);
  } catch { }
  return FALLBACK_REFRESH_MS;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const [user, setUser] = useState<UserProfile | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const expire = useCallback(() => {
    applySession(null);
    navigate('/login?reason=disconnected', { replace: true });
  }, [navigate]);

  useEffect(() => {
    setSessionHandler((session) => {
      setToken(session?.token ?? null);
      setUser(session?.user ?? null);
    });
    return () => setSessionHandler(null);
  }, []);

  useEffect(() => {
    refreshSession()
      .catch((err) => console.error('[auth] Failed to restore session:', err))
      .finally(() => setIsLoading(false));
  }, []);

  useEffect(() => {
    if (!token) return;
    let timer: ReturnType<typeof setTimeout>;
    const schedule = (delay: number) => {
      timer = setTimeout(() => {
        refreshSession()
          .then((session) => { if (!session) expire(); })
          .catch(() => schedule(RETRY_REFRESH_MS));
      }, delay);
    };
    schedule(refreshDelay(token));
    return () => clearTimeout(timer);
  }, [token, expire]);

  const setSession = useCallback((session: AuthResponse) => applySession(session), []);

  const logout = useCallback(() => {
    fetch(`${API_BASE_URL}/auth/logout`, { method: 'POST' }).catch(() => { });
    applySession(null);
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(expire);
    return () => setUnauthorizedHandler(null);
  }, [expire]);

  return (
    <AuthContext.Provider value={{ user, token, isLoading, setSession, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
