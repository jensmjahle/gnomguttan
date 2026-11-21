import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { setThreadMute } from '@/services/comments';
import type { AnyFeedItem, FeedMuteLevel } from '@/types';
import styles from './FeedCardMenu.module.css';

const MENU_WIDTH = 248;

const NOTIFY_OPTIONS: Array<{ level: FeedMuteLevel | null; label: string; hint: string }> = [
  { level: null, label: 'Alle', hint: 'Løftes opp ved ny aktivitet' },
  { level: 'mentions', label: 'Bare når jeg blir nevnt', hint: 'Kun @omtaler varsler deg' },
  { level: 'all', label: 'Av', hint: 'Ingen varsler fra innlegget' },
];

interface Props {
  item: AnyFeedItem;
  anchorRect: DOMRect;
  onClose: () => void;
}

export function postLink(feedItemId: string) {
  return `/innlegg/${encodeURIComponent(feedItemId)}`;
}

/** The ⋯ menu on a feed card: notification level for the post, and its link. */
export function FeedCardMenu({ item, anchorRect, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');
  const current = item.mute ?? null;

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    document.addEventListener('scroll', onClose, { capture: true, passive: true });
    window.addEventListener('resize', onClose);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
      document.removeEventListener('scroll', onClose, { capture: true });
      window.removeEventListener('resize', onClose);
    };
  }, [onClose]);

  async function chooseLevel(level: FeedMuteLevel | null) {
    if (busy || level === current) return;
    setBusy(true);
    setError('');
    try {
      await setThreadMute(item, level);
    } catch {
      setError('Kunne ikke lagre innstillingen.');
    } finally {
      setBusy(false);
    }
  }

  async function copyLink() {
    setError('');
    try {
      await navigator.clipboard.writeText(`${window.location.origin}${postLink(item.id)}`);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setError('Kunne ikke kopiere lenken.');
    }
  }

  const left = Math.max(8, Math.min(anchorRect.right - MENU_WIDTH, window.innerWidth - MENU_WIDTH - 8));

  return createPortal(
    <div
      ref={ref}
      className={styles.menu}
      style={{ left, top: anchorRect.bottom + 6, width: MENU_WIDTH }}
      role="menu"
      aria-label="Innleggsvalg"
    >
      <p className={styles.heading}>Varsler for dette innlegget</p>
      {NOTIFY_OPTIONS.map((option) => (
        <button
          key={option.label}
          type="button"
          role="menuitemradio"
          aria-checked={current === option.level}
          className={`${styles.option} ${current === option.level ? styles.optionActive : ''}`}
          onClick={() => void chooseLevel(option.level)}
          disabled={busy}
        >
          <span className={styles.radio} aria-hidden="true" />
          <span className={styles.optionText}>
            <span>{option.label}</span>
            <span className={styles.hint}>{option.hint}</span>
          </span>
        </button>
      ))}
      <div className={styles.divider} />
      <button type="button" role="menuitem" className={styles.item} onClick={() => void copyLink()}>
        {copied ? '✓ Lenke kopiert' : '🔗 Kopier lenke'}
      </button>
      <Link to={postLink(item.id)} role="menuitem" className={styles.item} onClick={onClose}>
        ↗ Åpne innlegget
      </Link>
      {error && <p className={styles.error}>{error}</p>}
    </div>,
    document.body,
  );
}
