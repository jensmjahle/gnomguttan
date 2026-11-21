import type { InfiniteData } from '@tanstack/react-query';
import { queryClient, qk } from '@/data/queryClient';
import { applyCommentEvent, type CommentEvent } from '@/utils/comments.generated';
import type { AnyFeedItem, AppNotification, CommunityEvent, FeedPage, FeedReaction, NotificationPage } from '@/types';

// Live updates (SSE) and writes patch the cached data in place, so every screen
// that shows the same post, event or notification stays in step.

type FeedData = InfiniteData<FeedPage, number | undefined>;

function dedupe(items: AnyFeedItem[]) {
  const seen = new Set<string>();
  return items.filter((item) => (seen.has(item.id) ? false : (seen.add(item.id), true)));
}

export function patchFeedItems(match: (item: AnyFeedItem) => boolean, patch: (item: AnyFeedItem) => AnyFeedItem) {
  queryClient.setQueriesData<FeedData>({ predicate: (query) => ['feed', 'profileFeed'].includes(String(query.queryKey[0])) }, (data) => data && {
    ...data,
    pages: data.pages.map((page) => ({ ...page, items: page.items.map((item) => (match(item) ? patch(item) : item)) })),
  });
  queryClient.setQueriesData<AnyFeedItem>({ queryKey: ['feedItem'] }, (item) => (item && match(item) ? patch(item) : item));
}

export function prependFeedItem(item: AnyFeedItem) {
  // Feed queries are keyed by the visible types; only add the post where its type is shown.
  queryClient.setQueriesData<FeedData>({ queryKey: qk.feedAll, predicate: (query) => String(query.queryKey[1] ?? '').split(',').includes(item.type) }, (data) => {
    if (!data || data.pages.length === 0) return data;
    const [first, ...rest] = data.pages;
    return { ...data, pages: [{ ...first, items: dedupe([item, ...first.items.filter((other) => other.id !== item.id)]) }, ...rest.map((page) => ({ ...page, items: page.items.filter((other) => other.id !== item.id) }))] };
  });
  queryClient.setQueryData<AnyFeedItem>(qk.feedItem(item.id), (existing) => (existing ? item : existing));
}

export function removeFeedItem(id: string) {
  queryClient.setQueriesData<FeedData>({ queryKey: qk.feedAll }, (data) => data && {
    ...data,
    pages: data.pages.map((page) => ({ ...page, items: page.items.filter((item) => item.id !== id) })),
  });
  queryClient.removeQueries({ queryKey: qk.feedItem(id) });
}

export function setFeedReactions(feedItemId: string, reactions: FeedReaction[]) {
  patchFeedItems((item) => item.id === feedItemId, (item) => ({ ...item, reactions }));
}

/** Route a comment change to whichever cache owns the thread (a post or an event). */
export function applyThreadCommentEvent(event: CommentEvent) {
  if (event.thread.kind === 'event') {
    const patch = (value: CommunityEvent | undefined) => value && { ...value, comments: applyCommentEvent(value.comments ?? [], event) };
    queryClient.setQueryData<CommunityEvent>(qk.event(event.thread.id), patch);
    queryClient.setQueryData<CommunityEvent[]>(qk.events, (list) => list?.map((item) => (item.id === event.thread.id ? patch(item)! : item)));
  } else {
    patchFeedItems((item) => item.id === event.thread.id, (item) => ({ ...item, comments: applyCommentEvent(item.comments ?? [], event) }));
  }
}

// ── Notifications ────────────────────────────────────────────────────────────

export function receiveNotification(notification: AppNotification) {
  queryClient.setQueryData<NotificationPage>(qk.notifications, (page) => {
    if (!page) return page;
    const existing = page.items.find((item) => item.id === notification.id);
    const wasUnread = existing ? existing.readAt === null : false;
    return {
      ...page,
      items: [notification, ...page.items.filter((item) => item.id !== notification.id)],
      unreadCount: page.unreadCount + (notification.readAt === null && !wasUnread ? 1 : 0),
    };
  });
}

export function removeNotification(id: string, wasUnread: boolean) {
  queryClient.setQueryData<NotificationPage>(qk.notifications, (page) => page && {
    ...page,
    items: page.items.filter((item) => item.id !== id),
    unreadCount: Math.max(0, page.unreadCount - (wasUnread ? 1 : 0)),
  });
}

export function markNotificationReadLocally(id: string) {
  queryClient.setQueryData<NotificationPage>(qk.notifications, (page) => {
    if (!page) return page;
    const target = page.items.find((item) => item.id === id);
    if (!target || target.readAt !== null) return page;
    return { ...page, items: page.items.map((item) => (item.id === id ? { ...item, readAt: Date.now() } : item)), unreadCount: Math.max(0, page.unreadCount - 1) };
  });
}
