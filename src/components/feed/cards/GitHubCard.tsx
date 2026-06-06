import { FeedCardShell } from '@/components/feed/FeedCardShell';
import type { GitHubIssueFeedItem, GitHubPRFeedItem } from '@/types';
import styles from './GitHubCard.module.css';

type GitHubFeedItem = GitHubIssueFeedItem | GitHubPRFeedItem;

interface Props {
  item: GitHubFeedItem;
}

const TYPE_LABELS: Record<string, string> = {
  github_issue_opened: 'Issue åpnet',
  github_issue_closed: 'Issue lukket',
  github_issue_reopened: 'Issue gjenåpnet',
  github_pr_opened: 'PR åpnet',
  github_pr_merged: 'PR merget',
  github_pr_closed: 'PR lukket',
  github_pr_reopened: 'PR gjenåpnet',
};

const TYPE_ICON: Record<string, string> = {
  github_issue_opened: '◎',
  github_issue_closed: '✓',
  github_issue_reopened: '◎',
  github_pr_opened: '⑂',
  github_pr_merged: '⑂',
  github_pr_closed: '⑂',
  github_pr_reopened: '⑂',
};

export function GitHubCard({ item }: Props) {
  const { payload } = item;
  const label = TYPE_LABELS[item.type] ?? 'GitHub';
  const icon = TYPE_ICON[item.type] ?? '·';

  return (
    <FeedCardShell
      badge="GitHub"
      badgeVariant="github"
      actor={payload.user}
      timestamp={item.createdAt}
      feedItemId={item.id}
      reactions={item.reactions}
    >
      <div className={styles.content}>
        <div className={styles.typeRow}>
          <span className={styles.icon} aria-hidden="true">{icon}</span>
          <span className={styles.typeLabel}>{label}</span>
          <span className={styles.repo}>{payload.repo}</span>
        </div>

        <a
          href={payload.url}
          target="_blank"
          rel="noopener noreferrer"
          className={styles.titleLink}
        >
          <span className={styles.number}>#{payload.number}</span>
          {payload.title}
        </a>

        {payload.body && (
          <p className={styles.body}>{payload.body}</p>
        )}
      </div>
    </FeedCardShell>
  );
}
