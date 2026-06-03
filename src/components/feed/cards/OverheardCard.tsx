import { FeedCardShell } from '@/components/feed/FeedCardShell';
import type { OverheardAddedFeedItem } from '@/types';
import styles from './OverheardCard.module.css';

interface Props {
  item: OverheardAddedFeedItem;
}

export function OverheardCard({ item }: Props) {
  const { text, author } = item.payload;

  return (
    <FeedCardShell
      badge="Overhørt"
      badgeVariant="overheard"
      actor={item.actorName}
      timestamp={item.createdAt}
    >
      <blockquote className={styles.quote}>
        <p className={styles.text}>{text}</p>
        <footer className={styles.attribution}>— {author}</footer>
      </blockquote>
    </FeedCardShell>
  );
}
