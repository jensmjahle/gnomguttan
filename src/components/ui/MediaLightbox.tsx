import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import styles from './MediaLightbox.module.css';

export interface MediaLightboxItem {
  key: string;
  type: 'image' | 'video';
  src: string;
  alt: string;
  downloadUrl?: string;
  canDelete?: boolean;
}

interface Props {
  items: MediaLightboxItem[];
  index: number;
  onIndexChange: (index: number) => void;
  onClose: () => void;
  onDelete?: (item: MediaLightboxItem, index: number) => void;
  startSlideshow?: boolean;
}

const SLIDESHOW_INTERVAL_MS = 4000;

function DownloadIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
  );
}

export function MediaLightbox({ items, index, onIndexChange, onClose, onDelete, startSlideshow = false }: Props) {
  const [playing, setPlaying] = useState(startSlideshow);
  const timerRef = useRef<number | null>(null);
  const item = items[index];

  const goPrev = useCallback(() => {
    if (index > 0) onIndexChange(index - 1);
  }, [index, onIndexChange]);

  const goNext = useCallback(() => {
    onIndexChange(index < items.length - 1 ? index + 1 : 0);
  }, [index, items.length, onIndexChange]);

  const handleKey = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') onClose();
    else if (e.key === 'ArrowLeft') goPrev();
    else if (e.key === 'ArrowRight') goNext();
    else if (e.key === ' ') { e.preventDefault(); setPlaying((p) => !p); }
  }, [onClose, goPrev, goNext]);

  useEffect(() => {
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [handleKey]);

  // Slideshow auto-advance. Video slides don't auto-advance on a timer; they
  // advance when playback ends (see onEnded below).
  useEffect(() => {
    if (timerRef.current) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (!playing || !item || item.type === 'video') return;
    timerRef.current = window.setTimeout(() => {
      onIndexChange(index < items.length - 1 ? index + 1 : 0);
    }, SLIDESHOW_INTERVAL_MS);
    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
    };
  }, [playing, item, index, items.length, onIndexChange]);

  if (!item) return null;

  const showDelete = Boolean(onDelete) && item.canDelete;

  return createPortal(
    <div className={styles.backdrop} onClick={onClose}>
      <div className={styles.toolbar} onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          className={styles.toolBtn}
          onClick={() => setPlaying((p) => !p)}
          aria-label={playing ? 'Pause lysbildefremvisning' : 'Start lysbildefremvisning'}
          title={playing ? 'Pause' : 'Lysbildefremvisning'}
        >
          {playing ? '❚❚' : '▶'}
        </button>
        {item.downloadUrl && (
          <a
            className={styles.toolBtn}
            href={item.downloadUrl}
            download
            aria-label="Last ned"
            title="Last ned"
          >
            <DownloadIcon />
          </a>
        )}
        {showDelete && (
          <button
            type="button"
            className={`${styles.toolBtn} ${styles.danger}`}
            onClick={() => onDelete?.(item, index)}
            aria-label="Slett"
            title="Slett"
          >
            <TrashIcon />
          </button>
        )}
        <span className={styles.counter}>{index + 1} / {items.length}</span>
        <button type="button" className={styles.toolBtn} onClick={onClose} aria-label="Lukk" title="Lukk">×</button>
      </div>

      {index > 0 && (
        <button
          className={`${styles.nav} ${styles.navPrev}`}
          onClick={(e) => { e.stopPropagation(); goPrev(); }}
          aria-label="Forrige"
        >‹</button>
      )}

      {item.type === 'video' ? (
        <video
          key={item.key}
          className={styles.media}
          src={item.src}
          controls
          autoPlay
          onClick={(e) => e.stopPropagation()}
          onEnded={() => { if (playing) goNext(); }}
        />
      ) : (
        <img
          key={item.key}
          className={styles.media}
          src={item.src}
          alt={item.alt}
          onClick={(e) => e.stopPropagation()}
        />
      )}

      {index < items.length - 1 && (
        <button
          className={`${styles.nav} ${styles.navNext}`}
          onClick={(e) => { e.stopPropagation(); goNext(); }}
          aria-label="Neste"
        >›</button>
      )}
    </div>,
    document.body,
  );
}
