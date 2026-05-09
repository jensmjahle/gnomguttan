import { Navigate, Outlet } from 'react-router-dom';
import { useAuthStore } from '@/store/authStore';

export function ProtectedRoute() {
  const { token, user } = useAuthStore();
  if (!token || !user?.uid || !user?.name) return <Navigate to="/login" replace />;
  return <Outlet />;
}
