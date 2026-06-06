import { FeedCardShell } from '@/components/feed/FeedCardShell';
import type { PigsRoundScoreFeedItem } from '@/types';
import styles from './PigsRoundScoreCard.module.css';

interface Props {
  item: PigsRoundScoreFeedItem;
}

export function PigsRoundScoreCard({ item }: Props) {
  const { score } = item.payload;
  const actor = item.actorName ?? 'Noen';

  return (
    <FeedCardShell
      badge="Grisekast"
      badgeVariant="pigs"
      actor={item.actorName}
      timestamp={item.createdAt}
    >
      <p className={styles.text}>{actor} fikk {score} poeng på grisekast!</p>
    </FeedCardShell>
  );
}
