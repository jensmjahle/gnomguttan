import { appApi } from '@/services/appApi';
import type { AnyFeedItem, FeedPage } from '@/types';
import { useFeedStore } from '@/store/feedStore';

export async function loadFeedPage(before?: number): Promise<FeedPage> {
  const params = new URLSearchParams({ limit: '20' });
  if (before !== undefined) params.set('before', String(before));
  const page = await appApi.get<FeedPage>(`/feed?${params}`);

  if (before === undefined) {
    useFeedStore.getState().setPage(page);
  } else {
    useFeedStore.getState().appendPage(page);
  }

  return page;
}

export function prependFeedItem(item: AnyFeedItem) {
  useFeedStore.getState().prependItem(item);
}
