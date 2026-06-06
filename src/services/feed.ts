import { appApi } from '@/services/appApi';
import type { AnyFeedItem, FeedPage } from '@/types';
import { useFeedStore } from '@/store/feedStore';

export async function postPigsRoundScore(score: number): Promise<void> {
  await appApi.post('/pigs/round-score', { score });
}

export async function postWheelSpinResult(winner: string, totalOptions: number): Promise<void> {
  await appApi.post('/wheel/spin-result', { winner, totalOptions });
}

export async function postStatusrapport(text: string, imageDataUrl?: string): Promise<void> {
  await appApi.post('/statusrapport', { text, imageDataUrl });
}

export async function toggleReaction(feedItemId: string, emoji: string): Promise<import('@/types').FeedReaction[]> {
  const result = await appApi.post<{ reactions: import('@/types').FeedReaction[] }>(`/feed/${feedItemId}/reactions`, { emoji });
  return result.reactions;
}

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
