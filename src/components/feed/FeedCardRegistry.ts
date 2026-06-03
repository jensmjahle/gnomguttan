import type { ComponentType } from 'react';
import type { AnyFeedItem } from '@/types';
import { EventCard } from './cards/EventCard';
import { OverheardCard } from './cards/OverheardCard';
import { GitHubCard } from './cards/GitHubCard';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyCardComponent = ComponentType<{ item: any }>;

/**
 * Maps feed item `type` → the React component that renders it.
 * To support a new feed type, add an entry here and create the card component.
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
};

export function getCardComponent(type: string): AnyCardComponent | null {
  return REGISTRY[type] ?? null;
}

export function isRegisteredType(type: string): type is keyof typeof REGISTRY {
  return type in REGISTRY;
}

export function registerCardType(type: string, component: AnyCardComponent) {
  REGISTRY[type] = component;
}

export function getFeedItemTypes(): string[] {
  return Object.keys(REGISTRY);
}

export type { AnyFeedItem };
