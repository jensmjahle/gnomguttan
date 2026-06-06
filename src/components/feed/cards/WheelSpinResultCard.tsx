import { FeedCardShell } from '@/components/feed/FeedCardShell';
import type { WheelSpinResultFeedItem } from '@/types';
import styles from './WheelSpinResultCard.module.css';

interface Props {
  item: WheelSpinResultFeedItem;
}

export function WheelSpinResultCard({ item }: Props) {
  const { winner, totalOptions } = item.payload;
  const actor = item.actorName ?? 'Noen';

  return (
    <FeedCardShell
      badge="Hjulet"
      badgeVariant="wheel"
      actor={item.actorName}
      timestamp={item.createdAt}
    >
      <p className={styles.text}>
        {actor} spant hjulet! Med 1/{totalOptions} odds, vinneren ble {winner.toUpperCase()}!
      </p>
    </FeedCardShell>
  );
}
