import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// HOW TO ADD A NEW FILTER CATEGORY
// ──────────────────────────────────
// 1. Add the key to FeedCategory.
// 2. Add its type strings to CATEGORY_TYPES.
// 3. Add its display label to CATEGORY_LABELS.
// 4. Add a default `true` entry in the `enabled` initializer inside useFeedFilterStore.
// That's it — the filter UI and getVisibleTypes() pick it up automatically.

export type FeedCategory = 'events' | 'overheard' | 'github_issues' | 'github_prs' | 'pigs' | 'wheel' | 'lamp' | 'statusrapport';

export const CATEGORY_TYPES: Record<FeedCategory, string[]> = {
  events: ['community_event_created'],
  overheard: ['overheard_added'],
  github_issues: ['github_issue_opened', 'github_issue_closed', 'github_issue_reopened'],
  github_prs: ['github_pr_opened', 'github_pr_merged', 'github_pr_closed', 'github_pr_reopened'],
  pigs: ['pigs_round_score'],
  wheel: ['wheel_spin_result'],
  lamp: ['lamp_toggled'],
  statusrapport: ['statusrapport_created'],
};

export const CATEGORY_LABELS: Record<FeedCategory, string> = {
  events: 'Arrangementer',
  overheard: 'Overhørt',
  github_issues: 'GitHub Issues',
  github_prs: 'GitHub PRs',
  pigs: 'Grisekast',
  wheel: 'Hjulet',
  lamp: 'Lampa til Jens',
  statusrapport: 'Statusrapport',
};

const ALL_CATEGORIES = Object.keys(CATEGORY_TYPES) as FeedCategory[];

interface FeedFilterStore {
  enabled: Record<FeedCategory, boolean>;
  toggle: (category: FeedCategory) => void;
  enableAll: () => void;
}

export const useFeedFilterStore = create<FeedFilterStore>()(
  persist(
    (set) => ({
      enabled: { events: true, overheard: true, github_issues: true, github_prs: true, pigs: true, wheel: true, lamp: true, statusrapport: true },
      toggle: (category) =>
        set((state) => ({
          enabled: { ...state.enabled, [category]: !state.enabled[category] },
        })),
      enableAll: () =>
        set({ enabled: Object.fromEntries(ALL_CATEGORIES.map((c) => [c, true])) as Record<FeedCategory, boolean> }),
    }),
    {
      name: 'gnomguttan-feed-filter',
      merge: (persistedState, currentState) => {
        const persisted = persistedState as Partial<FeedFilterStore>;
        return {
          ...currentState,
          ...persisted,
          // Deep-merge enabled so newly added categories get their default (true)
          // while existing user preferences are preserved.
          enabled: { ...currentState.enabled, ...(persisted.enabled ?? {}) },
        };
      },
    }
  )
);

/** Returns a Set of type strings that should be visible given current filter state. */
export function getVisibleTypes(enabled: Record<FeedCategory, boolean>): Set<string> {
  const types = new Set<string>();
  for (const category of ALL_CATEGORIES) {
    if (enabled[category]) {
      for (const type of CATEGORY_TYPES[category]) {
        types.add(type);
      }
    }
  }
  return types;
}
