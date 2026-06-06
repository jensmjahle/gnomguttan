import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import styles from './EmojiPicker.module.css';

const EMOJIS = [
  '👍', '👎', '❤️', '😂', '😮', '😢',
  '🎉', '🔥', '👀', '💯', '🙏', '😍',
  '🤔', '😎', '💀', '🤣', '😅', '👏',
  '🫡', '💪', '🤡', '🥳', '😤', '🫠',
];

interface Props {
  anchorRect: DOMRect;
  onPick: (emoji: string) => void;
  onClose: () => void;
}

export function EmojiPicker({ anchorRect, onPick, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [onClose]);

  // Position above the anchor, aligned to its left edge; clamp to viewport
  const pickerWidth = 216;
  const pickerHeight = 130; // approximate
  const gap = 6;
  const left = Math.min(anchorRect.left, window.innerWidth - pickerWidth - 8);
  const top = anchorRect.top - pickerHeight - gap < 8
    ? anchorRect.bottom + gap
    : anchorRect.top - pickerHeight - gap;

  return createPortal(
    <div
      ref={ref}
      className={styles.picker}
      style={{ left, top }}
      role="dialog"
      aria-label="Velg emoji"
    >
      {EMOJIS.map((emoji) => (
        <button
          key={emoji}
          type="button"
          className={styles.emoji}
          onClick={() => { onPick(emoji); onClose(); }}
          aria-label={emoji}
        >
          {emoji}
        </button>
      ))}
    </div>,
    document.body,
  );
}
