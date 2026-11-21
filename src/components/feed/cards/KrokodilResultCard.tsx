import { FeedCardShell } from '@/components/feed/FeedCardShell';
import type { KrokodilResultFeedItem } from '@/types';
import styles from './KrokodilResultCard.module.css';

interface Props {
  item: KrokodilResultFeedItem;
}

export function KrokodilResultCard({ item }: Props) {
  const { loser, players, presses } = item.payload;
  const actor = item.actorName ?? 'Noen';

  return (
    <FeedCardShell
      badge="Krokodil"
      badgeVariant="krokodil"
      actor={item.actorName}
      timestamp={item.createdAt}
      feedItemId={item.id}
      reactions={item.reactions}
    >
      <p className={styles.text}>
        {actor} spilte Krokodil med {players} spillere. Krokodillen bet {loser.toUpperCase()} på trykk nr. {presses}!
      </p>
    </FeedCardShell>
  );
}
