import { create } from 'zustand';
import type { AnyFeedItem, FeedPage, FeedReaction } from '@/types';

interface FeedStore {
  items: AnyFeedItem[];
  hasMore: boolean;
  setPage: (page: FeedPage) => void;
  appendPage: (page: FeedPage) => void;
  prependItem: (item: AnyFeedItem) => void;
  updateItemReactions: (feedItemId: string, reactions: FeedReaction[]) => void;
}

function dedupeById(items: AnyFeedItem[]): AnyFeedItem[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

export const useFeedStore = create<FeedStore>()((set) => ({
  items: [],
  hasMore: false,
  setPage: ({ items, hasMore }) => set({ items, hasMore }),
  appendPage: ({ items, hasMore }) =>
    set((state) => ({
      items: dedupeById([...state.items, ...items]),
      hasMore,
    })),
  prependItem: (item) =>
    set((state) => ({
      items: dedupeById([item, ...state.items]),
    })),
  updateItemReactions: (feedItemId, reactions) =>
    set((state) => ({
      items: state.items.map((item) =>
        item.id === feedItemId ? { ...item, reactions } : item
      ),
    })),
}));
