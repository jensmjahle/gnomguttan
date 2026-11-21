import { appApi, authedUrl } from '@/services/appApi';
import type { AnyFeedItem, CommentMention, FeedPage, FeedReaction } from '@/types';

export const statusrapportImageUrl = (imageId: string) => authedUrl(`/statusrapport/image/${imageId}`);
export const commentImageUrl = (imageId: string) => authedUrl(`/comment-images/${encodeURIComponent(imageId)}`);

export function loadFeedPage(types: string, before?: number) {
  const params = new URLSearchParams({ limit: '20', types });
  if (before !== undefined) params.set('before', String(before));
  return appApi.get<FeedPage>(`/feed?${params}`);
}

export const loadFeedItem = (id: string) => appApi.get<AnyFeedItem>(`/feed/${encodeURIComponent(id)}`);

export async function toggleReaction(feedItemId: string, emoji: string): Promise<FeedReaction[]> {
  return (await appApi.post<{ reactions: FeedReaction[] }>(`/feed/${feedItemId}/reactions`, { emoji })).reactions;
}

export const postStatusrapport = (text: string, imageDataUrl?: string, mentions: CommentMention[] = []) =>
  appApi.post('/statusrapport', { text, imageDataUrl, mentions });
export const postPigsRoundScore = (score: number) => appApi.post('/pigs/round-score', { score });
export const postWheelSpinResult = (winner: string, totalOptions: number) => appApi.post('/wheel/spin-result', { winner, totalOptions });
export const postKrokodilResult = (loser: string, players: number, presses: number) => appApi.post('/krokodil/result', { loser, players, presses });
