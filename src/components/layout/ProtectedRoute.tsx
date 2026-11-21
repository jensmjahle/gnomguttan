import { Navigate, Outlet } from 'react-router-dom';
import { NotificationToasts } from '@/components/notifications/NotificationToasts';
import { useFeedStream } from '@/hooks/useFeedStream';
import { useNotifications } from '@/hooks/useNotifications';
import { useAuthStore } from '@/store/authStore';

/**
 * Live updates for the logged-in session. Mounted here (once) rather than in
 * AppLayout, which every page renders itself — that remounted the stream on each
 * navigation and could drop events in between.
 */
function LiveSession() {
  useFeedStream();
  useNotifications();
  return <NotificationToasts />;
}

export function ProtectedRoute() {
  const { token, user } = useAuthStore();
  if (!token || !user?.uid || !user?.name) return <Navigate to="/login" replace />;
  return (
    <>
      <LiveSession />
      <Outlet />
    </>
  );
}
