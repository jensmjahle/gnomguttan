import { useEffect, useRef, useState } from 'react';
import { useAuthStore } from '@/store/authStore';
import { useFeedStore } from '@/store/feedStore';
import { applyThreadCommentEvent } from '@/services/comments';
import { emitMeow } from '@/services/meow';
import { refreshNotificationsIfStale } from '@/services/notifications';
import { useNotificationStore } from '@/store/notificationStore';
import { useTypingStore } from '@/store/typingStore';
import { isCommentEvent } from '@/utils/comments';
import type { AnyFeedItem, AppNotification, CommentThreadRef, FeedReaction } from '@/types';

const RECONNECT_DELAY_MS = 3000;

export function useFeedStream() {
  const esRef = useRef<EventSource | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Increments on token change or after onerror, causing the effect to
  // close the stale EventSource and reopen with the current token.
  const [connectionKey, setConnectionKey] = useState(0);
  useEffect(() => {
    return useAuthStore.subscribe((state, prev) => {
      if (state.token !== prev.token) setConnectionKey((k) => k + 1);
    });
  }, []);

  useEffect(() => {
    if (reconnectTimerRef.current !== null) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }

    const token = useAuthStore.getState().token;
    if (!token) return;

    esRef.current?.close();
    const es = new EventSource(`/app-api/feed/events?token=${encodeURIComponent(token)}`);
    esRef.current = es;

    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as {
          __type?: string;
          feedItemId?: string;
          reactions?: FeedReaction[];
          item?: AnyFeedItem;
          thread?: CommentThreadRef;
          uid?: number;
          name?: string;
          notification?: AppNotification;
          wasUnread?: boolean;
        } & AnyFeedItem;
        if (data.__type === 'reaction_update' && data.feedItemId) {
          useFeedStore.getState().updateItemReactions(data.feedItemId, data.reactions ?? []);
        } else if (data.__type === 'feed_bump' && data.item) {
          // Sent only to users related to the post; prependItem moves it to the top.
          useFeedStore.getState().prependItem(data.item);
        } else if (data.__type === 'meow') {
          emitMeow();
        } else if (data.__type === 'notification' && data.notification) {
          useNotificationStore.getState().receive(data.notification);
        } else if (data.__type === 'notification_removed' && data.id) {
          useNotificationStore.getState().remove(data.id, Boolean(data.wasUnread));
        } else if (data.__type === 'feed_item_removed' && data.feedItemId) {
          useFeedStore.getState().removeItem(data.feedItemId);
        } else if (data.__type === 'typing' && data.thread && data.uid !== undefined) {
          if (data.uid !== useAuthStore.getState().user?.uid) {
            useTypingStore.getState().markTyping(data.thread, data.uid, data.name ?? 'Noen');
          }
        } else if (isCommentEvent(data)) {
          applyThreadCommentEvent(data);
          // A posted comment ends that person's "skriver…".
          if (data.__type === 'comment_added') useTypingStore.getState().clearTyping(data.thread, data.comment.author.uid);
          if (data.__type === 'reply_added') useTypingStore.getState().clearTyping(data.thread, data.reply.author.uid);
        } else if (!data.__type) {
          useFeedStore.getState().prependItem(data as AnyFeedItem);
        }
        // unknown __type values are silently dropped
      } catch {
        // malformed event, ignore
      }
    };

    // Catch up on notifications sent while the stream was down.
    es.onopen = () => refreshNotificationsIfStale();

    es.onerror = () => {
      es.close();
      esRef.current = null;
      reconnectTimerRef.current = setTimeout(
        () => setConnectionKey((k) => k + 1),
        RECONNECT_DELAY_MS,
      );
    };

    return () => {
      if (reconnectTimerRef.current !== null) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      es.close();
      esRef.current = null;
    };
  }, [connectionKey]);
}
