import { appApi } from '@/services/appApi';
import type { AnyFeedItem, CommentMention, FeedPage } from '@/types';
import { useFeedStore } from '@/store/feedStore';
import { useFeedFilterStore, visibleTypesParam } from '@/store/feedFilterStore';

export function statusrapportImageUrl(imageId: string, token: string | null | undefined): string {
  const qs = token ? `?token=${encodeURIComponent(token)}` : '';
  return `/app-api/statusrapport/image/${imageId}${qs}`;
}

export async function postPigsRoundScore(score: number): Promise<void> {
  await appApi.post('/pigs/round-score', { score });
}

export async function postWheelSpinResult(winner: string, totalOptions: number): Promise<void> {
  await appApi.post('/wheel/spin-result', { winner, totalOptions });
}

export async function postKrokodilResult(loser: string, players: number, presses: number): Promise<void> {
  await appApi.post('/krokodil/result', { loser, players, presses });
}

export async function postStatusrapport(text: string, imageDataUrl?: string, mentions: CommentMention[] = []): Promise<void> {
  await appApi.post('/statusrapport', { text, imageDataUrl, mentions });
}

export async function toggleReaction(feedItemId: string, emoji: string): Promise<import('@/types').FeedReaction[]> {
  const result = await appApi.post<{ reactions: import('@/types').FeedReaction[] }>(`/feed/${feedItemId}/reactions`, { emoji });
  return result.reactions;
}

/** Load a single post for its own page (/innlegg/:id); it's kept live via the store. */
export async function loadFeedItem(feedItemId: string): Promise<AnyFeedItem> {
  const item = await appApi.get<AnyFeedItem>(`/feed/${encodeURIComponent(feedItemId)}`);
  useFeedStore.getState().setStandaloneItem(item);
  return item;
}

/** The server filters by the visible types, so every page is 20 posts the user can actually see. */
export async function loadFeedPage(before?: number): Promise<FeedPage> {
  const types = visibleTypesParam(useFeedFilterStore.getState().enabled);
  const params = new URLSearchParams({ limit: '20', types });
  if (before !== undefined) params.set('before', String(before));
  const page = await appApi.get<FeedPage>(`/feed?${params}`);

  // The filter changed while this was loading; the newer request owns the list.
  if (visibleTypesParam(useFeedFilterStore.getState().enabled) !== types) return page;

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
