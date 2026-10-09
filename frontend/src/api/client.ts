import axios from 'axios';
import { tokenStore } from './token';

export const api = axios.create({ baseURL: '/api' });

api.interceptors.request.use((config) => {
  const token = tokenStore.getAccess();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

let refreshing: Promise<string | null> | null = null;

async function refreshAccess() {
  const refreshToken = tokenStore.getRefresh();
  if (!refreshToken) return null;
  const { data } = await axios.post('/api/auth/refresh', { refreshToken });
  tokenStore.set(data.accessToken, data.refreshToken);
  return data.accessToken as string;
}

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config;
    const url = String(original?.url || '');
    if (error.response?.status === 401 && original && !original._retry && !url.includes('/auth/login') && !url.includes('/auth/refresh') && !url.includes('/auth/register')) {
      original._retry = true;
      try {
        refreshing ??= refreshAccess().finally(() => {
          refreshing = null;
        });
        const accessToken = await refreshing;
        if (!accessToken) throw error;
        original.headers.Authorization = `Bearer ${accessToken}`;
        return api(original);
      } catch {
        tokenStore.clear();
        if (!window.location.pathname.startsWith('/login')) window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  },
);

export function errorMessage(error: unknown, fallback = 'Không thực hiện được yêu cầu.') {
  if (axios.isAxiosError(error)) {
    return error.response?.data?.message || fallback;
  }
  return fallback;
}
