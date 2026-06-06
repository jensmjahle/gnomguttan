import { useState, useEffect, useCallback, useRef, type ReactNode } from 'react';
import { AnimatedCollapse } from '@/components/ui/AnimatedCollapse';
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

const TILE_SIZE        = 64;
const TILE_GAP         = 4;
const GRID_PAD         = 6;
const FADE_MS          = 180;
const DEFAULT_PER_PAGE = 4;

function computePerPage(w: number): number {
  return Math.max(1, Math.floor((w - GRID_PAD * 2 + TILE_GAP) / (TILE_SIZE + TILE_GAP)));
}

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
  color?:    string;
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

export function StreamDeck({
  entries,
  activeIndex,
  onActiveChange,
  minimized = false,
  onNeedsSpace,
}: {
  entries: StreamDeckEntry[];
  activeIndex: number | null;
  onActiveChange: (index: number | null) => void;
  minimized?: boolean;
  onNeedsSpace?: (extraPx: number) => void;
}) {
  const [page, setPage]       = useState(0);
  const [perPage, setPerPage] = useState(DEFAULT_PER_PAGE);

  // Callback ref so the effect re-runs whenever the element mounts or changes
  const [shellEl, setShellEl] = useState<HTMLDivElement | null>(null);
  const shellRefCb = useCallback((el: HTMLDivElement | null) => setShellEl(el), []);

  // Observe the shell — always attached to the live element, fires on every resize.
  // window.resize is added as a fallback because ResizeObserver alone can miss
  // viewport-driven reflows (layout changes caused by the window width changing).
  useEffect(() => {
    if (!shellEl) return;
    function update() {
      const { width } = shellEl!.getBoundingClientRect();
      if (!width) return;
      const pp = computePerPage(width);
      setPerPage(pp);
      setPage(p => Math.min(p, Math.max(0, Math.ceil(entries.length / pp) - 1)));
    }
    update();
    const ro = new ResizeObserver(update);
    ro.observe(shellEl);
    window.addEventListener('resize', update, { passive: true });
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', update);
    };
  }, [shellEl, entries.length]);

  // visibleIndex lags activeIndex by one fade cycle
  const [visibleIndex, setVisibleIndex] = useState<number | null>(activeIndex);
  const [fading, setFading]             = useState(false);
  const prevActiveRef                   = useRef<number | null>(activeIndex);
  const timerRef                        = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const prev = prevActiveRef.current;
    prevActiveRef.current = activeIndex;
    if (activeIndex === prev) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    setFading(true);
    timerRef.current = setTimeout(() => {
      setVisibleIndex(activeIndex);
      setFading(false);
    }, FADE_MS);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [activeIndex]);

  // Keep a stable ref to onNeedsSpace so the callback ref below never
  // needs to be recreated (avoids unnecessary content div remounts).
  const onNeedsSpaceRef = useRef(onNeedsSpace);
  useEffect(() => { onNeedsSpaceRef.current = onNeedsSpace; });

  // Callback ref attached to the widget .content div.
  // One rAF after it mounts we check whether the widget overflows its
  // container and notify the parent of how many extra pixels it needs.
  const contentOverflowRef = useCallback((el: HTMLDivElement | null) => {
    if (!el) {
      onNeedsSpaceRef.current?.(0);
      return;
    }
    const rafId = requestAnimationFrame(() => {
      const extra = Math.max(0, el.scrollHeight - el.clientHeight);
      onNeedsSpaceRef.current?.(extra);
    });
    return () => cancelAnimationFrame(rafId);
  }, []);

  const totalPages  = Math.max(1, Math.ceil(entries.length / perPage));
  const pageEntries = entries.slice(page * perPage, (page + 1) * perPage);

  return (
    <div className={styles.shell} ref={shellRefCb}>

      {/* Nav bar — always visible at top */}
      <div className={styles.nav}>
        <div />
        <div className={styles.navCenter}>
          <button
            className={styles.navBtn}
            onClick={() => setPage(p => Math.max(0, p - 1))}
            disabled={page === 0}
            aria-label="Forrige side"
          >
            <ChevLeft />
          </button>

          {totalPages > 1 && (() => {
            const MAX_DOTS = 5;
            const half     = Math.floor(MAX_DOTS / 2);
            const start    = Math.max(0, Math.min(page - half, totalPages - MAX_DOTS));
            const end      = Math.min(totalPages, start + MAX_DOTS);
            return (
              <div className={styles.dots}>
                {Array.from({ length: end - start }, (_, i) => {
                  const idx = start + i;
                  return (
                    <button
                      key={idx}
                      className={`${styles.dot} ${idx === page ? styles.dotActive : ''}`}
                      onClick={() => setPage(idx)}
                      aria-label={`Side ${idx + 1}`}
                    />
                  );
                })}
              </div>
            );
          })()}

          <button
            className={styles.navBtn}
            onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
            disabled={page === totalPages - 1}
            aria-label="Neste side"
          >
            <ChevRight />
          </button>
        </div>

        <div className={styles.navEnd} />
      </div>

      {/* Content — collapses when minimized */}
      <AnimatedCollapse
        open={!minimized}
        style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}
        innerStyle={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}
      >
        <div
          className={styles.contentArea}
          style={{
            opacity:    fading ? 0 : 1,
            transition: `opacity ${FADE_MS}ms ease`,
          }}
        >
          {visibleIndex !== null ? (
            <>
              <div className={styles.content} ref={contentOverflowRef}>
                {entries[visibleIndex]?.kind === 'widget' ? entries[visibleIndex].node : null}
              </div>
              <div className={styles.closeBar}>
                <button
                  className={styles.closeBarBtn}
                  onClick={() => onActiveChange(null)}
                  aria-label="Tilbake til oversikt"
                >
                  <CloseIcon />
                </button>
              </div>
            </>
          ) : (
            <div className={styles.grid}>
              {pageEntries.map((e, i) => {
                if (e.kind === 'custom') {
                  return <div key={e.label} style={{ display: 'contents' }}>{e.tile}</div>;
                }
                return (
                  <Tile
                    key={e.label}
                    entry={e}
                    onOpen={() => onActiveChange(page * perPage + i)}
                  />
                );
              })}
            </div>
          )}
        </div>
      </AnimatedCollapse>

    </div>
  );
}
