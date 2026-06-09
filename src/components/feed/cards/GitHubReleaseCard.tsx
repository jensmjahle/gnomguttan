import { FeedCardShell } from '@/components/feed/FeedCardShell';
import type { GitHubReleaseFeedItem } from '@/types';
import styles from './GitHubReleaseCard.module.css';

interface Props {
  item: GitHubReleaseFeedItem;
}

export function GitHubReleaseCard({ item }: Props) {
  const { payload } = item;

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
          <span className={styles.icon} aria-hidden="true">🏷</span>
          <span className={styles.typeLabel}>Release publisert</span>
          <span className={styles.repo}>{payload.repo}</span>
        </div>

        <a href={payload.url} target="_blank" rel="noreferrer" className={styles.titleLink}>
          <span className={styles.tag}>{payload.tagName}</span>
          {payload.name !== payload.tagName && (
            <span className={styles.name}>{payload.name}</span>
          )}
          {payload.prerelease && <span className={styles.preBadge}>Pre-release</span>}
        </a>

        {payload.body && (
          <p className={styles.body}>{payload.body}</p>
        )}
      </div>
    </FeedCardShell>
  );
}
