import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { api } from '../api/client';
import { tokenStore } from '../api/token';
import type { AuthResponse, AuthUser } from '../types';

interface AuthState {
  user: AuthUser | null;
  ready: boolean;
  login: (username: string, password: string) => Promise<AuthUser>;
  register: (payload: Record<string, string>) => Promise<AuthUser>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const token = tokenStore.getAccess();
    if (!token) {
      setReady(true);
      return;
    }
    api.get<AuthUser>('/auth/me')
      .then((response) => setUser(response.data))
      .catch(() => tokenStore.clear())
      .finally(() => setReady(true));
  }, []);

  const value = useMemo<AuthState>(() => ({
    user,
    ready,
    async login(username, password) {
      const { data } = await api.post<AuthResponse>('/auth/login', { username, password });
      tokenStore.set(data.accessToken, data.refreshToken);
      setUser(data.user);
      return data.user;
    },
    async register(payload) {
      const { data } = await api.post<AuthResponse>('/auth/register', payload);
      tokenStore.set(data.accessToken, data.refreshToken);
      setUser(data.user);
      return data.user;
    },
    async logout() {
      try {
        await api.post('/auth/logout');
      } catch {
        /* local session is cleared either way */
      }
      tokenStore.clear();
      setUser(null);
    },
  }), [ready, user]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}
