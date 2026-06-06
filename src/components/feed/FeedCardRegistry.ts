import type { ComponentType } from 'react';
import { EventCard } from './cards/EventCard';
import { OverheardCard } from './cards/OverheardCard';
import { GitHubCard } from './cards/GitHubCard';
import { PigsRoundScoreCard } from './cards/PigsRoundScoreCard';
import { WheelSpinResultCard } from './cards/WheelSpinResultCard';
import { LampToggleCard } from './cards/LampToggleCard';
import { StatusrapportCard } from './cards/StatusrapportCard';

type AnyCardComponent = ComponentType<{ item: any }>;

/**
 * Maps feed item `type` strings → the React component that renders them.
 *
 * HOW TO ADD A NEW FEED TYPE
 * ──────────────────────────
 * 1. SERVER — call writeFeedItem() wherever the event originates:
 *      import { writeFeedItem } from './feed.js';
 *      await writeFeedItem({ type: 'my_type', source: 'internal', payload: { ... }, actorUid, actorName });
 *    Then call broadcastFeedItem() on the result so connected clients see it instantly.
 *
 * 2. TYPES — add an interface + union member in src/types/index.ts:
 *      export interface MyTypeFeedItem extends FeedItemBase {
 *        type: 'my_type';
 *        source: 'internal';
 *        payload: { ... };
 *      }
 *    Add MyTypeFeedItem to the KnownFeedItem union at the bottom of that block.
 *
 * 3. CARD — create src/components/feed/cards/MyTypeCard.tsx (and .module.css).
 *    Use FeedCardShell as the outer wrapper — it handles the header, badge, and timestamp.
 *
 * 4. REGISTRY — add one line below:
 *      my_type: MyTypeCard,
 *
 * 5. FILTER — open src/store/feedFilterStore.ts and either:
 *    a) Add 'my_type' to an existing category's array in CATEGORY_TYPES, or
 *    b) Add a new category (follow the comments in that file).
 */
const REGISTRY: Record<string, AnyCardComponent> = {
  community_event_created: EventCard,
  overheard_added: OverheardCard,
  github_issue_opened: GitHubCard,
  github_issue_closed: GitHubCard,
  github_issue_reopened: GitHubCard,
  github_pr_opened: GitHubCard,
  github_pr_merged: GitHubCard,
  github_pr_closed: GitHubCard,
  github_pr_reopened: GitHubCard,
  pigs_round_score: PigsRoundScoreCard,
  wheel_spin_result: WheelSpinResultCard,
  lamp_toggled: LampToggleCard,
  statusrapport_created: StatusrapportCard,
};

export function getCardComponent(type: string): AnyCardComponent | null {
  return REGISTRY[type] ?? null;
}
