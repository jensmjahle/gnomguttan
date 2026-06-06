import { FeedCardShell } from '@/components/feed/FeedCardShell';
import type { LampToggledFeedItem } from '@/types';
import styles from './LampToggleCard.module.css';

interface Props {
  item: LampToggledFeedItem;
}

export function LampToggleCard({ item }: Props) {
  const { isOn } = item.payload;
  const actor = item.actorName ?? 'Noen';

  return (
    <FeedCardShell
      badge="Lampa til Jens"
      badgeVariant="lamp"
      actor={item.actorName}
      timestamp={item.createdAt}
    >
      <p className={styles.text}>
        {isOn
          ? <>{actor} skrudde på lampa til Jens!</>
          : <>{actor} skrudde av lampa til Jens.</>
        }
      </p>
    </FeedCardShell>
  );
}
