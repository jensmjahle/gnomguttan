import { create } from 'zustand';
import type { AppNotification, NotificationPage, NotificationSettings } from '@/types';

const MAX_TOASTS = 3;

/** Mirrors DEFAULT_NOTIFICATION_SETTINGS in server/notifications.js. */
export const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings = {
  mentions: true,
  replies: true,
  ownPosts: true,
  threads: false,
  reactions: true,
  newEvents: true,
  toast: true,
  tabTitle: true,
  push: true,
};

interface NotificationStore {
  items: AppNotification[];
  unreadCount: number;
  hasMore: boolean;
  loaded: boolean;
  settings: NotificationSettings;
  panelOpen: boolean;
  toasts: AppNotification[];
  setPage: (page: NotificationPage) => void;
  appendPage: (page: NotificationPage) => void;
  /** A notification arrived (or a grouped one was updated) over the live stream. */
  receive: (notification: AppNotification) => void;
  markRead: (id: string) => void;
  /** The notification's target was deleted on the server. */
  remove: (id: string, wasUnread: boolean) => void;
  markAllRead: () => void;
  setUnreadCount: (count: number) => void;
  setSettings: (settings: NotificationSettings) => void;
  setPanelOpen: (open: boolean) => void;
  dismissToast: (id: string) => void;
}

export const useNotificationStore = create<NotificationStore>()((set) => ({
  items: [],
  unreadCount: 0,
  hasMore: false,
  loaded: false,
  settings: DEFAULT_NOTIFICATION_SETTINGS,
  panelOpen: false,
  toasts: [],
  setPage: ({ items, unreadCount, hasMore }) => set({ items, unreadCount, hasMore, loaded: true }),
  appendPage: ({ items, unreadCount, hasMore }) =>
    set((state) => ({
      items: [...state.items, ...items.filter((item) => !state.items.some((existing) => existing.id === item.id))],
      unreadCount,
      hasMore,
    })),
  receive: (notification) =>
    set((state) => {
      const previous = state.items.find((item) => item.id === notification.id);
      const wasUnread = previous ? previous.readAt === null : false;
      const showToast = state.settings.toast && !state.panelOpen;
      return {
        items: [notification, ...state.items.filter((item) => item.id !== notification.id)],
        unreadCount: state.unreadCount + (notification.readAt === null && !wasUnread ? 1 : 0),
        toasts: showToast
          ? [notification, ...state.toasts.filter((toast) => toast.id !== notification.id)].slice(0, MAX_TOASTS)
          : state.toasts,
      };
    }),
  markRead: (id) =>
    set((state) => {
      const target = state.items.find((item) => item.id === id);
      if (!target || target.readAt !== null) return {};
      return {
        items: state.items.map((item) => (item.id === id ? { ...item, readAt: Date.now() } : item)),
        unreadCount: Math.max(0, state.unreadCount - 1),
      };
    }),
  remove: (id, wasUnread) =>
    set((state) => ({
      items: state.items.filter((item) => item.id !== id),
      toasts: state.toasts.filter((toast) => toast.id !== id),
      unreadCount: wasUnread ? Math.max(0, state.unreadCount - 1) : state.unreadCount,
    })),
  markAllRead: () =>
    set((state) => ({
      items: state.items.map((item) => (item.readAt === null ? { ...item, readAt: Date.now() } : item)),
      unreadCount: 0,
    })),
  setUnreadCount: (unreadCount) => set({ unreadCount }),
  setSettings: (settings) => set({ settings }),
  // Opening drops what was read last time; anything read while open stays (dimmed) until next time.
  setPanelOpen: (panelOpen) =>
    set((state) => (panelOpen
      ? { panelOpen, toasts: [], items: state.items.filter((item) => item.readAt === null) }
      : { panelOpen })),
  dismissToast: (id) => set((state) => ({ toasts: state.toasts.filter((toast) => toast.id !== id) })),
}));
