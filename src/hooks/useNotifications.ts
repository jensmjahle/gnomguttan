import { useEffect } from 'react';
import { loadNotificationSettings, loadNotifications } from '@/services/notifications';
import { useAuthStore } from '@/store/authStore';
import { useNotificationStore } from '@/store/notificationStore';

const TITLE_COUNT = /^\(\d+\+?\) /;
// Bootstrap once per login (also guards React StrictMode's double effects).
let bootstrappedToken: string | null = null;

/** Loads notifications and settings once per session, and keeps "(3) Gnomguttan" in the tab title. */
export function useNotifications() {
  const token = useAuthStore((s) => s.token);
  const unreadCount = useNotificationStore((s) => s.unreadCount);
  const showInTitle = useNotificationStore((s) => s.settings.tabTitle);

  useEffect(() => {
    if (!token || bootstrappedToken === token) return;
    bootstrappedToken = token;
    void loadNotifications().catch(() => {});
    void loadNotificationSettings().catch(() => {});
  }, [token]);

  useEffect(() => {
    const base = document.title.replace(TITLE_COUNT, '');
    document.title = showInTitle && unreadCount > 0 ? `(${unreadCount > 99 ? '99+' : unreadCount}) ${base}` : base;
  }, [unreadCount, showInTitle]);
}
