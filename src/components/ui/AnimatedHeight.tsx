import { useLayoutEffect, useRef } from 'react';

const HEIGHT_MS  = 380;
const FADE_IN_MS = 250;

interface Props {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}

/**
 * Walk up the DOM checking inline `style.opacity`. Returns true if any ancestor
 * has an explicit opacity below 0.5 — meaning a parent (e.g. AnimatedCollapse)
 * has already claimed ownership of the reveal by setting opacity:0 on its inner
 * wrapper.  We use the *inline* style rather than getComputedStyle so we catch
 * the value set synchronously before any CSS transition has started.
 */
function hasHiddenAncestor(el: HTMLElement): boolean {
  let parent = el.parentElement;
  while (parent) {
    const op = parent.style.opacity;
    if (op !== '' && parseFloat(op) < 0.5) return true;
    parent = parent.parentElement;
  }
  return false;
}

export function AnimatedHeight({ children, className, style }: Props) {
  const outerRef      = useRef<HTMLDivElement>(null);
  const innerRef      = useRef<HTMLDivElement>(null);
  const prevHeightRef = useRef<number | null>(null);
  const timerRef      = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── One-time init + ResizeObserver ─────────────────────────────────────────
  useLayoutEffect(() => {
    const inner = innerRef.current;
    const outer = outerRef.current;
    if (!inner || !outer) return;

    const h0 = inner.offsetHeight;
    outer.style.height  = `${h0}px`;
    inner.style.opacity = '1';
    prevHeightRef.current = h0;

    const clear = () => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };

    const ro = new ResizeObserver(() => {
      const newH = inner.offsetHeight;
      const oldH = prevHeightRef.current ?? newH;
      if (newH === oldH) return;

      clear();
      prevHeightRef.current = newH;

      if (newH > oldH) {
        // ── Expand ──────────────────────────────────────────────────────────

        if (hasHiddenAncestor(outer)) {
          // A parent AnimatedCollapse already owns the reveal — it has set the
          // body to opacity:0 and will fade it in.  Snap our height immediately
          // so the parent's snap-to-auto sees the correct final value, and
          // pre-reveal the content so the parent's single fade is the only
          // opacity layer active (no double-fade).
          outer.style.transition = 'none';
          outer.style.height     = `${newH}px`;
          inner.style.transition = 'none';
          inner.style.opacity    = '1';
        } else {
          // Height fills first (content hidden), then content fades in.
          // Matches the calendar event-list behaviour: space opens up, then
          // the content appears.
          inner.style.transition = 'none';
          inner.style.opacity    = '0';
          outer.style.transition = `height ${HEIGHT_MS}ms cubic-bezier(0.4, 0, 0.2, 1)`;
          outer.style.height     = `${newH}px`;

          timerRef.current = setTimeout(() => {
            inner.style.transition = `opacity ${FADE_IN_MS}ms ease`;
            inner.style.opacity    = '1';
          }, HEIGHT_MS);
        }

      } else {
        // ── Collapse ─────────────────────────────────────────────────────────
        // Instantly hide outgoing content, collapse height, then fade in the
        // incoming (shorter) content.
        inner.style.transition = 'none';
        inner.style.opacity    = '0';
        outer.style.transition = `height ${HEIGHT_MS}ms cubic-bezier(0.4, 0, 0.2, 1)`;
        outer.style.height     = `${newH}px`;

        timerRef.current = setTimeout(() => {
          inner.style.transition = `opacity ${FADE_IN_MS}ms ease`;
          inner.style.opacity    = '1';
        }, HEIGHT_MS);
      }
    });

    ro.observe(inner);
    return () => {
      ro.disconnect();
      clear();
    };
  }, []);

  // ── Pre-hide on every render ────────────────────────────────────────────────
  // Fires synchronously before paint.  When the inner div's height has already
  // changed (children swapped) but the ResizeObserver hasn't fired yet, force
  // opacity:0 so there is no flash of new content before the animation starts.
  useLayoutEffect(() => {
    const inner = innerRef.current;
    const oldH  = prevHeightRef.current;
    if (!inner || oldH === null) return;
    const newH = inner.offsetHeight;
    if (newH === oldH) return;
    inner.style.transition = 'none';
    inner.style.opacity    = '0';
  });

  return (
    <div ref={outerRef} className={className} style={{ overflow: 'hidden', ...style }}>
      <div ref={innerRef}>{children}</div>
    </div>
  );
}
