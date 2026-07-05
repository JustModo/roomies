import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { fetchApi } from '../api/client';
import { UserProfile } from '@roomies/contracts';

interface AuthContextType {
  user: UserProfile | null;
  token: string | null;
  isLoading: boolean;
  setToken: (token: string) => void;
  logout: () => void;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [token, setTokenState] = useState<string | null>(localStorage.getItem('token'));
  const [isLoading, setIsLoading] = useState(true);

  const setToken = (newToken: string) => {
    localStorage.setItem('token', newToken);
    setTokenState(newToken);
  };

  const logout = () => {
    localStorage.removeItem('token');
    setTokenState(null);
    setUser(null);
  };

  const refreshUser = async () => {
    if (!token) {
      setUser(null);
      setIsLoading(false);
      return;
    }
    
    try {
      setIsLoading(true);
      const userData = await fetchApi('/users/me');
      setUser(userData);
    } catch (err) {
      console.error('Failed to load user session', err);
      logout();
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    refreshUser();
  }, [token]);

  return (
    <AuthContext.Provider value={{ user, token, isLoading, setToken, logout, refreshUser }}>
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
