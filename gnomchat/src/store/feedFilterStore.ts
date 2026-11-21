import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Mirrors the website's src/store/feedFilterStore.ts.
export type FeedCategory = 'events' | 'overheard' | 'github_issues' | 'github_prs' | 'github_releases' | 'games' | 'wheel' | 'lamp' | 'statusrapport';

export const CATEGORY_TYPES: Record<FeedCategory, string[]> = {
  events: ['community_event_created'],
  overheard: ['overheard_added'],
  github_issues: ['github_issue_opened', 'github_issue_closed', 'github_issue_reopened'],
  github_prs: ['github_pr_opened', 'github_pr_merged', 'github_pr_closed', 'github_pr_reopened'],
  github_releases: ['github_release_published'],
  games: ['pigs_round_score', 'krokodil_result'],
  wheel: ['wheel_spin_result'],
  lamp: ['lamp_toggled'],
  statusrapport: ['statusrapport_created'],
};

export const CATEGORY_LABELS: Record<FeedCategory, string> = {
  events: 'Arrangementer',
  overheard: 'Overhørt',
  github_issues: 'GitHub Issues',
  github_prs: 'GitHub PRs',
  github_releases: 'GitHub Releases',
  games: 'Spill',
  wheel: 'Hjulet',
  lamp: 'Lampa til Jens',
  statusrapport: 'Statusrapport',
};

export const ALL_CATEGORIES = Object.keys(CATEGORY_TYPES) as FeedCategory[];
const allOn = () => Object.fromEntries(ALL_CATEGORIES.map((c) => [c, true])) as Record<FeedCategory, boolean>;

interface FeedFilterStore {
  enabled: Record<FeedCategory, boolean>;
  toggle: (category: FeedCategory) => void;
  enableAll: () => void;
}

export const useFeedFilterStore = create<FeedFilterStore>()(
  persist(
    (set) => ({
      enabled: allOn(),
      toggle: (category) => set((state) => ({ enabled: { ...state.enabled, [category]: !state.enabled[category] } })),
      enableAll: () => set({ enabled: allOn() }),
    }),
    {
      name: 'gnomchat-feed-filter',
      storage: createJSONStorage(() => AsyncStorage),
      merge: (persisted, current) => ({ ...current, enabled: { ...current.enabled, ...((persisted as Partial<FeedFilterStore>)?.enabled ?? {}) } }),
    },
  ),
);

export function visibleTypesParam(enabled: Record<FeedCategory, boolean>): string {
  return ALL_CATEGORIES.filter((c) => enabled[c]).flatMap((c) => CATEGORY_TYPES[c]).sort().join(',');
}
