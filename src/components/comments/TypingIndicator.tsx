import { useMemo } from 'react';
import { threadKey, useTypingStore } from '@/store/typingStore';
import type { CommentThreadRef } from '@/types';
import styles from './TypingIndicator.module.css';

interface Props {
  thread: CommentThreadRef;
  className?: string;
}

function describe(names: string[]) {
  if (names.length === 1) return `${names[0]} skriver`;
  if (names.length === 2) return `${names[0]} og ${names[1]} skriver`;
  return `${names.length} personer skriver`;
}

/** "Kari skriver…" while someone else is writing in this thread. */
export function TypingIndicator({ thread, className }: Props) {
  const typists = useTypingStore((s) => s.byThread[threadKey(thread)]);
  const names = useMemo(() => Object.values(typists ?? {}).map((typist) => typist.name.split(' ')[0]), [typists]);

  if (names.length === 0) return null;

  return (
    <p className={[styles.typing, className].filter(Boolean).join(' ')} aria-live="polite">
      {describe(names)}
      <span className={styles.dots} aria-hidden="true">
        <span />
        <span />
        <span />
      </span>
    </p>
  );
}
