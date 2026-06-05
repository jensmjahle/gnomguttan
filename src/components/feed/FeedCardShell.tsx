import { formatDistanceToNow } from 'date-fns';
import { useMinuteTick } from '@/hooks/useMinuteTick';
import styles from './FeedCardShell.module.css';

interface Props {
  badge: string;
  badgeVariant?: 'default' | 'event' | 'overheard' | 'github';
  actor?: string;
  timestamp: number;
  children: React.ReactNode;
}

export function FeedCardShell({ badge, badgeVariant = 'default', actor, timestamp, children }: Props) {
  useMinuteTick();

  const timeAgo = formatDistanceToNow(new Date(timestamp), { addSuffix: true });

  return (
    <article className={styles.card}>
      <div className={styles.header}>
        <span className={`${styles.badge} ${styles[`badge_${badgeVariant}`]}`}>{badge}</span>
        {actor && <span className={styles.actor}>{actor}</span>}
        <span className={styles.time}>{timeAgo}</span>
      </div>
      <div className={styles.body}>{children}</div>
    </article>
  );
}
