import { useEffect, useRef, useState } from 'react';
import { useAuthStore } from '@/store/authStore';
import { useFeedStore } from '@/store/feedStore';
import type { AnyFeedItem } from '@/types';

export function useFeedStream() {
  const esRef = useRef<EventSource | null>(null);

  // Increments whenever the auth token is refreshed, triggering the effect
  // to close the stale connection and reopen with the fresh token.
  const [connectionKey, setConnectionKey] = useState(0);
  useEffect(() => {
    return useAuthStore.subscribe((state, prev) => {
      if (state.token !== prev.token) setConnectionKey((k) => k + 1);
    });
  }, []);

  useEffect(() => {
    const token = useAuthStore.getState().token;
    if (!token) return;

    esRef.current?.close();
    const es = new EventSource(`/app-api/feed/events?token=${encodeURIComponent(token)}`);
    esRef.current = es;

    es.onmessage = (event) => {
      try {
        const item = JSON.parse(event.data) as AnyFeedItem;
        useFeedStore.getState().prependItem(item);
      } catch {
        // malformed event, ignore
      }
    };

    return () => {
      es.close();
      esRef.current = null;
    };
  }, [connectionKey]);
}
