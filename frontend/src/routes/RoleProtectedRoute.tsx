import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../stores/auth-store';
import type { AppRole } from '../types';
import { roleHome } from '../utils/format';

export function RoleProtectedRoute({ role }: { role: AppRole | AppRole[] }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  const allowed = Array.isArray(role) ? role.includes(user.role) : user.role === role;
  if (!allowed) return <Navigate to={roleHome(user.role)} replace />;
  return <Outlet />;
}
