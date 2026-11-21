import { useCallback } from 'react';
import { useAuthStore } from '@/store/authStore';
import { logout as logoutRequest } from '@/services/auth';
import { unregisterPush, clearDelivered } from '@/services/notifications';
import { queryClient } from '@/data/queryClient';
import { matrixLogout } from '@/matrix/engine';
import { removeMatrixPusher } from '@/matrix/push';
import { useMatrixSession } from '@/matrix/store';
import { clearMatrixMedia } from '@/matrix/media';

export function useAuth() {
  const user = useAuthStore((s) => s.user);
  const token = useAuthStore((s) => s.token);
  const hydrated = useAuthStore((s) => s.hydrated);

  /** Signs out of Gnomguttan and the chat on this phone, and forgets everything cached. */
  const logout = useCallback(async () => {
    if (useMatrixSession.getState().session) {
      await removeMatrixPusher();
      await matrixLogout().catch(() => {});
    }
    await unregisterPush();
    await logoutRequest();
    queryClient.clear();
    await clearMatrixMedia();
    await clearDelivered();
  }, []);

  return { user, token, hydrated, isAuthenticated: Boolean(token && user?.uid), logout };
}
