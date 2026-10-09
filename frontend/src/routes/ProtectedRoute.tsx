import { Navigate, Outlet } from 'react-router-dom';
import { LoadingState } from '../components/LoadingState';
import { useAuth } from '../stores/auth-store';

export function ProtectedRoute() {
  const { user, ready } = useAuth();
  if (!ready) return <LoadingState />;
  if (!user) return <Navigate to="/login" replace />;
  return <Outlet />;
}
