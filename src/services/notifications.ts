import { appApi } from '@/services/appApi';
import { useNotificationStore } from '@/store/notificationStore';
import type { AppNotification, NotificationPage, NotificationSettings } from '@/types';

const PAGE_SIZE = 30;
let lastRefreshAt = 0;

export async function loadNotifications(before?: number): Promise<NotificationPage> {
  // The bell only lists unread notifications; read ones drop out the next time it opens.
  const params = new URLSearchParams({ limit: String(PAGE_SIZE), unread: '1' });
  if (before !== undefined) params.set('before', String(before));
  const page = await appApi.get<NotificationPage>(`/notifications?${params}`);
  const store = useNotificationStore.getState();
  if (before === undefined) {
    lastRefreshAt = Date.now();
    store.setPage(page);
  } else {
    store.appendPage(page);
  }
  return page;
}

/** Reload the first page unless it was loaded recently (e.g. after a live-stream reconnect). */
export function refreshNotificationsIfStale(maxAgeMs = 30_000) {
  if (Date.now() - lastRefreshAt < maxAgeMs) return;
  void loadNotifications().catch(() => {});
}

export async function markNotificationRead(id: string): Promise<void> {
  const store = useNotificationStore.getState();
  store.markRead(id);
  const { unreadCount } = await appApi.post<{ unreadCount: number }>(`/notifications/${encodeURIComponent(id)}/read`);
  useNotificationStore.getState().setUnreadCount(unreadCount);
}

export async function markAllNotificationsRead(): Promise<void> {
  useNotificationStore.getState().markAllRead();
  await appApi.post('/notifications/read-all');
}

/** Mark it read and return where to go. */
export function openNotification(notification: AppNotification): string {
  if (notification.readAt === null) void markNotificationRead(notification.id).catch(() => {});
  useNotificationStore.getState().dismissToast(notification.id);
  return notification.link;
}

export async function loadNotificationSettings(): Promise<NotificationSettings> {
  const settings = await appApi.get<NotificationSettings>('/notifications/settings');
  useNotificationStore.getState().setSettings(settings);
  return settings;
}

/** Optimistic: the switch flips at once and is rolled back if saving fails. */
export async function saveNotificationSettings(patch: Partial<NotificationSettings>): Promise<void> {
  const store = useNotificationStore.getState();
  const previous = store.settings;
  store.setSettings({ ...previous, ...patch });
  try {
    useNotificationStore.getState().setSettings(await appApi.put<NotificationSettings>('/notifications/settings', patch));
  } catch (error) {
    useNotificationStore.getState().setSettings(previous);
    throw error;
  }
}
