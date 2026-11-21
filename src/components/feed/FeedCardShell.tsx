import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { format } from 'date-fns';
import { nb } from 'date-fns/locale/nb';
import { useMinuteTick } from '@/hooks/useMinuteTick';
import { toggleReaction } from '@/services/feed';
import { useFeedItem } from '@/store/feedStore';
import { formatRelativeTime } from '@/utils/relativeTime';
import { ReactionBar } from './ReactionBar';
import { EmojiPicker } from './EmojiPicker';
import { FeedCardMenu, postLink } from './FeedCardMenu';
import { FeedComments } from './FeedComments';
import { UserLink } from '@/components/profile/UserLink';
import type { FeedBump, FeedReaction } from '@/types';
import styles from './FeedCardShell.module.css';

const BUMP_LABELS: Record<FeedBump['reason'], { icon: string; text: (name: string) => string }> = {
  mention: { icon: '@', text: (name) => `${name} nevnte deg` },
  reply: { icon: '↩️', text: (name) => `${name} svarte deg` },
  own_post: { icon: '💬', text: (name) => `${name} kommenterte innlegget ditt` },
  post_mention: { icon: '💬', text: (name) => `${name} kommenterte et innlegg du er nevnt i` },
  participant: { icon: '💬', text: (name) => `${name} kommenterte også` },
};

interface Props {
  badge: string;
  badgeVariant?: 'default' | 'event' | 'overheard' | 'github' | 'pigs' | 'krokodil' | 'wheel' | 'lamp' | 'statusrapport';
  actor?: string;
  timestamp: number;
  feedItemId?: string;
  reactions?: FeedReaction[];
  children: React.ReactNode;
}

export function FeedCardShell({ badge, badgeVariant = 'default', actor, timestamp, feedItemId, reactions, children }: Props) {
  useMinuteTick();
  const [pickerAnchor, setPickerAnchor] = useState<DOMRect | null>(null);
  const [menuAnchor, setMenuAnchor] = useState<DOMRect | null>(null);
  const addBtnRef = useRef<HTMLButtonElement>(null);
  const menuBtnRef = useRef<HTMLButtonElement>(null);

  const timeAgo = formatRelativeTime(timestamp);
  const fullDate = format(new Date(timestamp), "d. MMMM yyyy 'kl.' HH:mm", { locale: nb });
  const item = useFeedItem(feedItemId);
  const bump = item?.bump;
  const bumpLabel = bump ? BUMP_LABELS[bump.reason] ?? BUMP_LABELS.participant : null;

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
      {item && bump && bumpLabel && (
        <Link className={styles.bump} to={`${postLink(item.id)}${bump.commentId ? `#c-${bump.commentId}` : ''}`}>
          <span className={styles.bumpIcon} aria-hidden="true">{bumpLabel.icon}</span>
          <span className={styles.bumpText}>{bumpLabel.text(bump.byName)}</span>
          <span className={styles.bumpTime}>· {formatRelativeTime(bump.at)}</span>
        </Link>
      )}
      <div className={styles.header}>
        <span className={`${styles.badge} ${styles[`badge_${badgeVariant}`]}`}>{badge}</span>
        {actor && <UserLink uid={item?.actorUid} name={actor} className={styles.actor} />}
        {item?.mute && (
          <span
            className={styles.muteIcon}
            title={item.mute === 'all' ? 'Varsler er slått av' : 'Varsler bare når du blir nevnt'}
            aria-label={item.mute === 'all' ? 'Varsler er slått av' : 'Varsler bare når du blir nevnt'}
          >
            {item.mute === 'all' ? '🔕' : '@'}
          </span>
        )}
        {feedItemId ? (
          <Link to={postLink(feedItemId)} className={`${styles.time} ${styles.timeLink}`} title={fullDate}>
            {timeAgo}
          </Link>
        ) : (
          <span className={styles.time} title={fullDate}>{timeAgo}</span>
        )}
        {item && (
          <button
            ref={menuBtnRef}
            type="button"
            className={styles.menuBtn}
            onClick={() => setMenuAnchor(menuAnchor ? null : menuBtnRef.current?.getBoundingClientRect() ?? null)}
            aria-label="Innleggsvalg"
            aria-haspopup="menu"
            aria-expanded={Boolean(menuAnchor)}
          >
            ⋯
          </button>
        )}
      </div>

      <div className={styles.body}>{children}</div>

      {feedItemId && (
        <div className={styles.reactionZone}>
          <ReactionBar
            reactions={reactions ?? []}
            onToggle={handleToggle}
            addBtnRef={addBtnRef}
            onOpenPicker={() => setPickerAnchor(addBtnRef.current?.getBoundingClientRect() ?? null)}
          />
        </div>
      )}

      {item && <FeedComments item={item} />}

      {pickerAnchor && (
        <EmojiPicker
          anchorRect={pickerAnchor}
          onPick={handleToggle}
          onClose={() => setPickerAnchor(null)}
        />
      )}

      {item && menuAnchor && (
        <FeedCardMenu item={item} anchorRect={menuAnchor} onClose={() => setMenuAnchor(null)} />
      )}
    </article>
  );
}
