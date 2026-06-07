import { useEffect, useRef, useState } from 'react';
import { useAuthStore } from '@/store/authStore';
import { useFeedStore } from '@/store/feedStore';
import type { AnyFeedItem, FeedReaction } from '@/types';

const RECONNECT_DELAY_MS = 3000;

export function useFeedStream() {
  const esRef = useRef<EventSource | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
        const data = JSON.parse(event.data) as { __type?: string; feedItemId?: string; reactions?: FeedReaction[] } & AnyFeedItem;
        if (data.__type === 'reaction_update' && data.feedItemId) {
          useFeedStore.getState().updateItemReactions(data.feedItemId, data.reactions ?? []);
        } else {
          useFeedStore.getState().prependItem(data as AnyFeedItem);
        }
      } catch {
        // malformed event, ignore
      }
    };

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
