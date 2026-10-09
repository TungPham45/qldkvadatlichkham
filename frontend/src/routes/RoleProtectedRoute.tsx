import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../stores/auth-store';
import type { AppRole } from '../types';
import { roleHome } from '../utils/format';

export function RoleProtectedRoute({ role }: { role: AppRole }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (user.role !== role) return <Navigate to={roleHome(user.role)} replace />;
  return <Outlet />;
}
