import { useLayoutEffect, useRef } from 'react';

const HEIGHT_MS  = 380;
const FADE_IN_MS = 250;

interface Props {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
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
    outer.style.height = `${h0}px`;
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
        // Expanding: hide → animate height → fade in
        inner.style.transition = 'none';
        inner.style.opacity    = '0';
        outer.style.transition = `height ${HEIGHT_MS}ms cubic-bezier(0.4, 0, 0.2, 1)`;
        outer.style.height     = `${newH}px`;

        timerRef.current = setTimeout(() => {
          inner.style.transition = `opacity ${FADE_IN_MS}ms ease`;
          inner.style.opacity    = '1';
        }, HEIGHT_MS);
      } else {
        // Collapsing: instantly hide → animate height → fade back in
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

  // ── Pre-hide on every render — fires synchronously before any paint ─────────
  // If the inner div's height has changed since the last ResizeObserver update,
  // force opacity to 0 immediately so there is no flash frame before the
  // ResizeObserver callback runs and starts the proper animation.
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
