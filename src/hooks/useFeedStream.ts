import { useEffect } from 'react';
import { useAuthStore } from '@/store/authStore';
import { useFeedStore } from '@/store/feedStore';
import type { AnyFeedItem } from '@/types';

export function useFeedStream() {
  useEffect(() => {
    const token = useAuthStore.getState().token;
    if (!token) return;

    const url = `/app-api/feed/events?token=${encodeURIComponent(token)}`;
    const es = new EventSource(url);

    es.onmessage = (event) => {
      try {
        const item = JSON.parse(event.data) as AnyFeedItem;
        useFeedStore.getState().prependItem(item);
      } catch {
        // malformed event, ignore
      }
    };

    es.onerror = () => {
      // EventSource auto-reconnects on error — nothing to do here
    };

    return () => {
      es.close();
    };
  }, []);
}
