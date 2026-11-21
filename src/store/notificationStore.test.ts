import { beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_NOTIFICATION_SETTINGS, useNotificationStore } from './notificationStore';
import type { AppNotification } from '@/types';

const initial = useNotificationStore.getState();
const store = () => useNotificationStore.getState();

function notification(id: string, extra: Partial<AppNotification> = {}): AppNotification {
  return {
    id, type: 'comment', subject: 'post', actors: [{ uid: 1, name: 'Kari' }], actorCount: 1,
    target: { kind: 'feed', id: 'p' }, context: 'Fjelltur', link: '/innlegg/p',
    createdAt: 1, updatedAt: 1, readAt: null, ...extra,
  };
}

beforeEach(() => {
  useNotificationStore.setState({ ...initial, settings: DEFAULT_NOTIFICATION_SETTINGS }, true);
});

describe('receive', () => {
  it('puts new notifications on top, counts them as unread and toasts them', () => {
    store().receive(notification('a'));
    store().receive(notification('b'));
    expect(store().items.map((n) => n.id)).toEqual(['b', 'a']);
    expect(store().unreadCount).toBe(2);
    expect(store().toasts.map((n) => n.id)).toEqual(['b', 'a']);
  });

  it('an updated (grouped) notification replaces itself without counting twice', () => {
    store().receive(notification('a'));
    store().receive(notification('b'));
    store().receive(notification('a', { actorCount: 2, updatedAt: 5 }));
    expect(store().items.map((n) => n.id)).toEqual(['a', 'b']);
    expect(store().items[0].actorCount).toBe(2);
    expect(store().unreadCount).toBe(2);
  });

  it('a grouped notification that was read and comes back unread counts again', () => {
    store().setPage({ items: [notification('a', { readAt: 3 })], unreadCount: 0, hasMore: false });
    store().receive(notification('a', { readAt: null, updatedAt: 9 }));
    expect(store().unreadCount).toBe(1);
  });

  it('keeps at most three toasts, newest first', () => {
    ['a', 'b', 'c', 'd'].forEach((id) => store().receive(notification(id)));
    expect(store().toasts.map((n) => n.id)).toEqual(['d', 'c', 'b']);
  });

  it('does not toast while the panel is open, or when popups are turned off', () => {
    store().setPanelOpen(true);
    store().receive(notification('a'));
    expect(store().toasts).toEqual([]);
    store().setPanelOpen(false);
    store().setSettings({ ...DEFAULT_NOTIFICATION_SETTINGS, toast: false });
    store().receive(notification('b'));
    expect(store().toasts).toEqual([]);
    expect(store().unreadCount).toBe(2);
  });
});

describe('reading and removing', () => {
  beforeEach(() => {
    store().setPage({ items: [notification('a'), notification('b'), notification('c', { readAt: 2 })], unreadCount: 2, hasMore: false });
  });

  it('markRead only counts down for unread notifications', () => {
    store().markRead('a');
    store().markRead('a');
    store().markRead('c');
    expect(store().unreadCount).toBe(1);
    expect(store().items.find((n) => n.id === 'a')?.readAt).not.toBeNull();
  });

  it('markAllRead clears the count but keeps the items (until the panel reopens)', () => {
    store().markAllRead();
    expect(store().unreadCount).toBe(0);
    expect(store().items).toHaveLength(3);
  });

  it('opening the panel drops what was already read; reading while open keeps it visible', () => {
    store().setPanelOpen(true);
    expect(store().items.map((n) => n.id)).toEqual(['a', 'b']);
    store().markRead('a');
    expect(store().items.map((n) => n.id)).toEqual(['a', 'b']);
    store().setPanelOpen(false);
    store().setPanelOpen(true);
    expect(store().items.map((n) => n.id)).toEqual(['b']);
  });

  it('opening the panel clears pending toasts', () => {
    store().receive(notification('d'));
    store().setPanelOpen(true);
    expect(store().toasts).toEqual([]);
  });

  it('remove drops a notification and fixes the count, even if it was not loaded', () => {
    store().receive(notification('d'));
    store().remove('d', true);
    expect(store().items.some((n) => n.id === 'd')).toBe(false);
    expect(store().toasts.some((n) => n.id === 'd')).toBe(false);
    expect(store().unreadCount).toBe(2);
    store().remove('not-loaded', true);
    expect(store().unreadCount).toBe(1);
    store().remove('c', false);
    expect(store().unreadCount).toBe(1);
  });

  it('appendPage skips notifications it already has', () => {
    store().appendPage({ items: [notification('b'), notification('e')], unreadCount: 3, hasMore: true });
    expect(store().items.map((n) => n.id)).toEqual(['a', 'b', 'c', 'e']);
    expect(store().hasMore).toBe(true);
  });
});
