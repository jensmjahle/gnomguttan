import type { RefObject } from 'react';
import { useAuthStore } from '@/store/authStore';
import type { FeedReaction } from '@/types';
import styles from './ReactionBar.module.css';

interface ReactionGroup {
  emoji: string;
  count: number;
  names: string[];
  selfReacted: boolean;
}

function groupReactions(reactions: FeedReaction[], myUid: number | null): ReactionGroup[] {
  const map = new Map<string, ReactionGroup>();
  for (const r of reactions) {
    const group = map.get(r.emoji) ?? { emoji: r.emoji, count: 0, names: [], selfReacted: false };
    group.count += 1;
    group.names.push(r.actorName);
    if (myUid !== null && r.uid === myUid) group.selfReacted = true;
    map.set(r.emoji, group);
  }
  return [...map.values()];
}

interface Props {
  reactions: FeedReaction[];
  onToggle: (emoji: string) => void;
  addBtnRef: RefObject<HTMLButtonElement>;
  onOpenPicker: () => void;
}

export function ReactionBar({ reactions, onToggle, addBtnRef, onOpenPicker }: Props) {
  const myUid = useAuthStore((s) => s.user?.uid ?? null);
  const groups = groupReactions(reactions, myUid);

  return (
    <div className={styles.bar}>
      {groups.map((group) => (
        <button
          key={group.emoji}
          type="button"
          className={`${styles.chip} ${group.selfReacted ? styles.chipActive : ''}`}
          onClick={() => onToggle(group.emoji)}
          title={group.names.join(', ')}
        >
          <span className={styles.chipEmoji}>{group.emoji}</span>
          <span className={styles.chipCount}>{group.count}</span>
        </button>
      ))}

      <button
        ref={addBtnRef}
        type="button"
        className={styles.addBtn}
        onClick={onOpenPicker}
        aria-label="Legg til reaksjon"
      >
        <span className={styles.addIcon}>＋</span>
        <span className={styles.addEmoji}>😀</span>
      </button>
    </div>
  );
}
