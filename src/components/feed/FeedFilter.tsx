import { useEffect, useRef, useState } from 'react';
import { CATEGORY_LABELS, useFeedFilterStore, type FeedCategory } from '@/store/feedFilterStore';
import styles from './FeedFilter.module.css';

const CATEGORIES = Object.keys(CATEGORY_LABELS) as FeedCategory[];

function FilterIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
    </svg>
  );
}

export function FeedFilter() {
  const { enabled, toggle, enableAll } = useFeedFilterStore();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const hiddenCount = CATEGORIES.filter((c) => !enabled[c]).length;

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [open]);

  return (
    <div className={styles.root} ref={ref}>
      <button
        type="button"
        className={[styles.trigger, hiddenCount > 0 ? styles.triggerActive : ''].filter(Boolean).join(' ')}
        onClick={() => setOpen((v) => !v)}
        aria-label="Filtrer feed"
        aria-expanded={open}
        aria-haspopup="dialog"
      >
        <FilterIcon />
        {hiddenCount > 0 && <span className={styles.badge}>{hiddenCount}</span>}
      </button>

      {open && <div className={styles.backdrop} onClick={() => setOpen(false)} />}

      {open && (
        <div className={styles.panel} role="dialog" aria-label="Feed-filter">
          <div className={styles.panelHeader}>
            <span className={styles.panelTitle}>Vis i feed</span>
            {hiddenCount > 0 && (
              <button type="button" className={styles.resetBtn} onClick={enableAll}>
                Vis alle
              </button>
            )}
          </div>

          <div className={styles.options}>
            {CATEGORIES.map((category) => (
              <button
                key={category}
                type="button"
                className={styles.option}
                onClick={() => toggle(category)}
                aria-pressed={enabled[category]}
              >
                <span className={styles.optionLabel}>{CATEGORY_LABELS[category]}</span>
                <span className={`${styles.toggle} ${enabled[category] ? styles.toggleOn : ''}`}>
                  <span className={styles.toggleThumb} />
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
