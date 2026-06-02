import { useState, type ReactNode } from 'react';
import styles from './StreamDeck.module.css';

// ── Types ─────────────────────────────────────────────────────────────────────

type ButtonEntry = {
  label:   string;
  icon:    ReactNode;
  kind:    'button';
  onPress: () => void;
};

type WidgetEntry = {
  label: string;
  icon:  ReactNode;
  kind:  'widget';
  node:  ReactNode;
};

// Custom entries render their own pre-built tile component (e.g. MjauTile,
// LampaTile) directly in the grid cell — no default tile wrapper applied.
type CustomEntry = {
  label: string;
  kind:  'custom';
  tile:  ReactNode;
};

export type StreamDeckEntry = ButtonEntry | WidgetEntry | CustomEntry;

// ── Constants ─────────────────────────────────────────────────────────────────

const COLS     = 3;
const PER_PAGE = COLS * 2;

// ── TileButton — shared tile shell used by custom tile components ──────────────

export function TileButton({
  label,
  onClick,
  active  = false,
  color,
  children,
}: {
  label:     string;
  onClick:   () => void;
  active?:   boolean;
  color?:    string;        // optional icon colour override
  children:  ReactNode;
}) {
  return (
    <button
      className={`${styles.tile} ${active ? styles.tileActive : ''}`}
      onClick={onClick}
    >
      <span className={styles.tileIcon} style={color ? { color } : undefined}>
        {children}
      </span>
      <span className={styles.tileLabel}>{label}</span>
    </button>
  );
}

// ── Icons ─────────────────────────────────────────────────────────────────────

function ChevLeft() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="15 18 9 12 15 6"/>
    </svg>
  );
}
function ChevRight() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="9 18 15 12 9 6"/>
    </svg>
  );
}
function CloseIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
    </svg>
  );
}

// ── Default tile (button / widget kinds) ──────────────────────────────────────

function Tile({ entry, onOpen }: { entry: ButtonEntry | WidgetEntry; onOpen: () => void }) {
  const [active, setActive] = useState(false);

  function handleClick() {
    if (entry.kind === 'button') {
      setActive(true);
      setTimeout(() => setActive(false), 600);
      entry.onPress();
    } else {
      onOpen();
    }
  }

  return (
    <button
      className={`${styles.tile} ${active ? styles.tileActive : ''}`}
      onClick={handleClick}
    >
      <span className={styles.tileIcon}>{entry.icon}</span>
      <span className={styles.tileLabel}>{entry.label}</span>
    </button>
  );
}

// ── StreamDeck ────────────────────────────────────────────────────────────────

export function StreamDeck({ entries }: { entries: StreamDeckEntry[] }) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [page, setPage]               = useState(0);

  const totalPages  = Math.ceil(entries.length / PER_PAGE);
  const showPaging  = totalPages > 1;
  const pageEntries = entries.slice(page * PER_PAGE, (page + 1) * PER_PAGE);

  // ── Active (widget) view ───────────────────────────────────────────────────
  if (activeIndex !== null) {
    const entry = entries[activeIndex];
    return (
      <div className={styles.shell}>
        <div className={styles.content}>
          {entry.kind === 'widget' ? entry.node : null}
        </div>
        <div className={styles.nav}>
          <button
            className={styles.navBtn}
            onClick={() => setActiveIndex(null)}
            aria-label="Tilbake til oversikt"
          >
            <CloseIcon />
          </button>
        </div>
      </div>
    );
  }

  // ── Grid view ──────────────────────────────────────────────────────────────
  return (
    <div className={styles.shell}>
      <div className={styles.grid}>
        {pageEntries.map((e, i) => {
          if (e.kind === 'custom') {
            return <div key={e.label} style={{ display: 'contents' }}>{e.tile}</div>;
          }
          return (
            <Tile
              key={e.label}
              entry={e}
              onOpen={() => setActiveIndex(page * PER_PAGE + i)}
            />
          );
        })}
      </div>

      {showPaging && (
        <div className={styles.nav}>
          <button
            className={styles.navBtn}
            onClick={() => setPage(p => p - 1)}
            disabled={page === 0}
            aria-label="Forrige side"
          >
            <ChevLeft />
          </button>
          <div className={styles.dots}>
            {Array.from({ length: totalPages }, (_, i) => (
              <button
                key={i}
                className={`${styles.dot} ${i === page ? styles.dotActive : ''}`}
                onClick={() => setPage(i)}
                aria-label={`Side ${i + 1}`}
              />
            ))}
          </div>
          <button
            className={styles.navBtn}
            onClick={() => setPage(p => p + 1)}
            disabled={page === totalPages - 1}
            aria-label="Neste side"
          >
            <ChevRight />
          </button>
        </div>
      )}
    </div>
  );
}
