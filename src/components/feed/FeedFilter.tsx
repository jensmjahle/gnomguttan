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
        aria-expanded={open}
        title="Filtrer feed"
      >
        <FilterIcon />
        {hiddenCount > 0 && <span className={styles.badge}>{hiddenCount}</span>}
      </button>

      {open && (
        <div className={styles.dropdown}>
          <div className={styles.dropdownHeader}>
            <span className={styles.dropdownTitle}>Vis i feed</span>
            {hiddenCount > 0 && (
              <button type="button" className={styles.resetBtn} onClick={enableAll}>
                Vis alle
              </button>
            )}
          </div>

          <div className={styles.options}>
            {CATEGORIES.map((category) => (
              <label key={category} className={styles.option}>
                <input
                  type="checkbox"
                  className={styles.checkbox}
                  checked={enabled[category]}
                  onChange={() => toggle(category)}
                />
                <span className={styles.optionLabel}>{CATEGORY_LABELS[category]}</span>
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
