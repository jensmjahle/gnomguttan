import { create } from 'zustand';
import type { AnyFeedItem, FeedPage, FeedReaction } from '@/types';
import { applyCommentEvent, type CommentEvent } from '@/utils/comments';

interface FeedStore {
  items: AnyFeedItem[];
  hasMore: boolean;
  /** Posts opened directly (/innlegg/:id) that may not be in the loaded feed pages. */
  standalone: Record<string, AnyFeedItem>;
  setPage: (page: FeedPage) => void;
  appendPage: (page: FeedPage) => void;
  prependItem: (item: AnyFeedItem) => void;
  setStandaloneItem: (item: AnyFeedItem) => void;
  /** The post was deleted (e.g. its event was deleted). */
  removeItem: (feedItemId: string) => void;
  updateItemReactions: (feedItemId: string, reactions: FeedReaction[]) => void;
  applyCommentEvent: (feedItemId: string, event: CommentEvent) => void;
  /** Patch every loaded copy of the posts matching `match` (feed list and standalone). */
  patchItems: (match: (item: AnyFeedItem) => boolean, patch: (item: AnyFeedItem) => AnyFeedItem) => void;
}

function dedupeById(items: AnyFeedItem[]): AnyFeedItem[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

function patchAll(
  state: Pick<FeedStore, 'items' | 'standalone'>,
  match: (item: AnyFeedItem) => boolean,
  patch: (item: AnyFeedItem) => AnyFeedItem
) {
  return {
    items: state.items.map((item) => (match(item) ? patch(item) : item)),
    standalone: Object.fromEntries(
      Object.entries(state.standalone).map(([id, item]) => [id, match(item) ? patch(item) : item])
    ),
  };
}

export const useFeedStore = create<FeedStore>()((set) => ({
  items: [],
  hasMore: false,
  standalone: {},
  setPage: ({ items, hasMore }) => set({ items, hasMore }),
  appendPage: ({ items, hasMore }) =>
    set((state) => ({
      items: dedupeById([...state.items, ...items]),
      hasMore,
    })),
  prependItem: (item) =>
    set((state) => ({
      items: dedupeById([item, ...state.items]),
      ...(state.standalone[item.id] ? { standalone: { ...state.standalone, [item.id]: item } } : {}),
    })),
  setStandaloneItem: (item) =>
    set((state) => ({ standalone: { ...state.standalone, [item.id]: item } })),
  removeItem: (feedItemId) =>
    set((state) => {
      const { [feedItemId]: _removed, ...standalone } = state.standalone;
      return { items: state.items.filter((item) => item.id !== feedItemId), standalone };
    }),
  updateItemReactions: (feedItemId, reactions) =>
    set((state) => patchAll(state, (item) => item.id === feedItemId, (item) => ({ ...item, reactions }))),
  applyCommentEvent: (feedItemId, event) =>
    set((state) => patchAll(
      state,
      (item) => item.id === feedItemId,
      (item) => ({ ...item, comments: applyCommentEvent(item.comments ?? [], event) })
    )),
  patchItems: (match, patch) => set((state) => patchAll(state, match, patch)),
}));

/** A post from the feed list, or one opened directly via its link. */
export function useFeedItem(feedItemId: string | undefined): AnyFeedItem | undefined {
  return useFeedStore((state) =>
    feedItemId ? state.items.find((item) => item.id === feedItemId) ?? state.standalone[feedItemId] : undefined
  );
}
