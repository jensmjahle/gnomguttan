import { useEffect } from 'react';
import { AppState } from 'react-native';
import EventSource from 'react-native-sse';
import { appUrl } from '@/services/appApi';
import { useAuthStore } from '@/store/authStore';
import { useTypingStore } from '@/store/typingStore';
import { queryClient, qk } from '@/data/queryClient';
import {
  applyThreadCommentEvent, prependFeedItem, receiveNotification, removeFeedItem, removeNotification, setFeedReactions,
} from '@/data/feedCache';
import { isCommentEvent } from '@/utils/comments.generated';
import { emitMeow } from '@/services/meow';
import type { AnyFeedItem, AppNotification, CommentThreadRef, FeedReaction } from '@/types';

const RECONNECT_DELAY_MS = 3000;

type StreamMessage = {
  __type?: string;
  feedItemId?: string;
  reactions?: FeedReaction[];
  item?: AnyFeedItem;
  thread?: CommentThreadRef;
  uid?: number;
  name?: string;
  notification?: AppNotification;
  id?: string;
  wasUnread?: boolean;
} & Partial<AnyFeedItem>;

function handle(data: StreamMessage) {
  if (data.__type === 'reaction_update' && data.feedItemId) setFeedReactions(data.feedItemId, data.reactions ?? []);
  else if (data.__type === 'feed_bump' && data.item) prependFeedItem(data.item);
  else if (data.__type === 'meow') emitMeow();
  else if (data.__type === 'notification' && data.notification) receiveNotification(data.notification);
  else if (data.__type === 'notification_removed' && data.id) removeNotification(data.id, Boolean(data.wasUnread));
  else if (data.__type === 'feed_item_removed' && data.feedItemId) removeFeedItem(data.feedItemId);
  else if (data.__type === 'typing' && data.thread && data.uid !== undefined) {
    if (data.uid !== useAuthStore.getState().user?.uid) useTypingStore.getState().markTyping(data.thread, data.uid, data.name ?? 'Noen');
  } else if (isCommentEvent(data as { __type?: string })) {
    const event = data as unknown as Parameters<typeof applyThreadCommentEvent>[0];
    applyThreadCommentEvent(event);
    if (event.__type === 'comment_added') useTypingStore.getState().clearTyping(event.thread, event.comment.author.uid);
    if (event.__type === 'reply_added') useTypingStore.getState().clearTyping(event.thread, event.reply.author.uid);
  } else if (!data.__type && data.id && data.type) {
    prependFeedItem(data as AnyFeedItem);
    if (data.type === 'community_event_created') void queryClient.invalidateQueries({ queryKey: qk.events });
  }
}

/**
 * The website's live feed stream (/app-api/feed/events), kept open while the app
 * is in the foreground. New posts, reactions, comments, typing and notifications
 * land in the query cache directly; when it reconnects, stale data is refetched.
 */
export function useLiveUpdates() {
  const token = useAuthStore((state) => state.token);

  useEffect(() => {
    if (!token) return;
    let source: EventSource | null = null;
    let reconnect: ReturnType<typeof setTimeout> | null = null;
    let stopped = false;
    let opened = false;

    const close = () => {
      if (reconnect) clearTimeout(reconnect);
      reconnect = null;
      source?.removeAllEventListeners();
      source?.close();
      source = null;
    };

    const open = () => {
      close();
      if (stopped || AppState.currentState !== 'active') return;
      source = new EventSource(appUrl(`/feed/events?token=${encodeURIComponent(token)}`), { pollingInterval: 0 });
      source.addEventListener('open', () => {
        // Catch up on whatever happened while we were away.
        if (opened) void queryClient.invalidateQueries({ predicate: (query) => ['feed', 'notifications', 'communityEvents'].includes(String(query.queryKey[0])) });
        opened = true;
      });
      source.addEventListener('message', (event) => {
        if (!event.data) return;
        try { handle(JSON.parse(event.data) as StreamMessage); } catch { /* malformed event */ }
      });
      source.addEventListener('error', () => {
        close();
        if (!stopped) reconnect = setTimeout(open, RECONNECT_DELAY_MS);
      });
    };

    open();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') open();
      else close();
    });
    return () => { stopped = true; subscription.remove(); close(); };
  }, [token]);
}
