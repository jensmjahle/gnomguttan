import { useRef, useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { useMinuteTick } from '@/hooks/useMinuteTick';
import { toggleReaction } from '@/services/feed';
import { ReactionBar } from './ReactionBar';
import { EmojiPicker } from './EmojiPicker';
import type { FeedReaction } from '@/types';
import styles from './FeedCardShell.module.css';

interface Props {
  badge: string;
  badgeVariant?: 'default' | 'event' | 'overheard' | 'github' | 'pigs' | 'wheel' | 'lamp' | 'statusrapport';
  actor?: string;
  timestamp: number;
  feedItemId?: string;
  reactions?: FeedReaction[];
  children: React.ReactNode;
}

export function FeedCardShell({ badge, badgeVariant = 'default', actor, timestamp, feedItemId, reactions, children }: Props) {
  useMinuteTick();
  const [pickerAnchor, setPickerAnchor] = useState<DOMRect | null>(null);
  const addBtnRef = useRef<HTMLButtonElement>(null);

  const timeAgo = formatDistanceToNow(new Date(timestamp), { addSuffix: true });

  const pendingRef = useRef(false);
  async function handleToggle(emoji: string) {
    if (!feedItemId || pendingRef.current) return;
    pendingRef.current = true;
    await toggleReaction(feedItemId, emoji).catch(() => null);
    pendingRef.current = false;
    // reactions are updated for all clients (including this one) via SSE broadcast
  }

  return (
    <article className={styles.card} data-feed-card data-picker-open={pickerAnchor ? '' : undefined}>
      <div className={styles.header}>
        <span className={`${styles.badge} ${styles[`badge_${badgeVariant}`]}`}>{badge}</span>
        {actor && <span className={styles.actor}>{actor}</span>}
        <span className={styles.time}>{timeAgo}</span>
      </div>

      <div className={styles.body}>{children}</div>

      {feedItemId && (
        <div className={[
          styles.reactionZone,
          (reactions?.length ?? 0) === 0 ? styles.reactionZoneEmpty : '',
          (reactions?.length ?? 0) === 0 && pickerAnchor ? styles.reactionZoneOpen : '',
        ].filter(Boolean).join(' ')}>
          <ReactionBar
            reactions={reactions ?? []}
            onToggle={handleToggle}
            addBtnRef={addBtnRef}
            onOpenPicker={() => setPickerAnchor(addBtnRef.current?.getBoundingClientRect() ?? null)}
          />
        </div>
      )}

      {pickerAnchor && (
        <EmojiPicker
          anchorRect={pickerAnchor}
          onPick={handleToggle}
          onClose={() => setPickerAnchor(null)}
        />
      )}
    </article>
  );
}
