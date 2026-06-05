import { useLayoutEffect, useEffect, useRef } from 'react';

const HEIGHT_MS  = 380;
const FADE_IN_MS = 250;
const FADE_OUT_MS = 150;

interface Props {
  open: boolean;
  children: React.ReactNode;
  style?: React.CSSProperties;
  innerStyle?: React.CSSProperties;
}

/**
 * Collapses / expands its children in response to the `open` prop.
 * - Collapse: content fades out, then height slides to 0.
 * - Expand:   height slides to content height, then content fades in.
 *             After the animation finishes the outer div is reset to
 *             `height: auto; overflow: visible` so nested AnimatedHeight
 *             children can resize freely without being clipped.
 */
export function AnimatedCollapse({ open, children, style, innerStyle }: Props) {
  const outerRef         = useRef<HTMLDivElement>(null);
  const innerRef         = useRef<HTMLDivElement>(null);
  const timerARef        = useRef<ReturnType<typeof setTimeout> | null>(null);
  const timerBRef        = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevOpenRef      = useRef(open);
  const lastOpenHeightRef = useRef(0);

  // Track the rendered height continuously while open so we always have a
  // valid value to animate from — even if a parent layout change (e.g. a
  // flex wrapper losing its `flex: 1`) happens in the same commit that
  // closes us, shrinking outer to 0 before the collapse effect reads it.
  useLayoutEffect(() => {
    const outer = outerRef.current;
    if (!outer || !open) return;
    const h = outer.offsetHeight;
    if (h > 0) lastOpenHeightRef.current = h;
  });

  // Set initial state without any transition
  useLayoutEffect(() => {
    const outer = outerRef.current;
    const inner = innerRef.current;
    if (!outer || !inner) return;

    if (open) {
      outer.style.height   = 'auto';
      outer.style.overflow = 'visible';
      inner.style.opacity  = '1';
    } else {
      outer.style.minHeight = '0';
      outer.style.height    = '0';
      outer.style.overflow  = 'hidden';
      inner.style.opacity   = '0';
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const prev = prevOpenRef.current;
    prevOpenRef.current = open;
    if (open === prev) return;

    const outer = outerRef.current;
    const inner = innerRef.current;
    if (!outer || !inner) return;

    if (timerARef.current) clearTimeout(timerARef.current);
    if (timerBRef.current) clearTimeout(timerBRef.current);

    if (!open) {
      // ── Collapse ─────────────────────────────────────────────────────
      // Lock the current height so we can animate to 0.
      // min-height: 0 overrides the flex `min-height: auto` default so the
      // element can actually shrink below its content size.
      outer.style.transition = 'none';
      outer.style.minHeight  = '0';
      outer.style.height     = `${lastOpenHeightRef.current}px`;
      outer.style.overflow   = 'hidden';

      // Fade content out
      inner.style.transition = `opacity ${FADE_OUT_MS}ms ease`;
      inner.style.opacity    = '0';

      // After fade, slide height to 0.
      // `void outer.offsetHeight` forces the browser to flush and commit the
      // locked height (from above) before the transition starts, so the
      // browser correctly interpolates from the locked value to 0.
      timerARef.current = setTimeout(() => {
        void outer.offsetHeight; // flush layout
        outer.style.transition = `height ${HEIGHT_MS}ms cubic-bezier(0.4, 0, 0.2, 1)`;
        void outer.offsetHeight; // register transition start
        outer.style.height     = '0';
      }, FADE_OUT_MS);

    } else {
      // ── Expand ───────────────────────────────────────────────────────
      // Content is invisible; get its natural height for the animation target
      inner.style.transition = 'none';
      inner.style.opacity    = '0';

      outer.style.transition = `height ${HEIGHT_MS}ms cubic-bezier(0.4, 0, 0.2, 1)`;
      outer.style.height     = `${inner.offsetHeight}px`;

      // After height finishes: fade content in
      timerARef.current = setTimeout(() => {
        inner.style.transition = `opacity ${FADE_IN_MS}ms ease`;
        inner.style.opacity    = '1';

        // After fade finishes: release fixed height so inner AnimatedHeight
        // children can grow/shrink freely without being clipped
        timerBRef.current = setTimeout(() => {
          outer.style.transition = 'none';
          outer.style.height     = 'auto';
          outer.style.overflow   = 'visible';
        }, FADE_IN_MS);
      }, HEIGHT_MS);
    }

    return () => {
      if (timerARef.current) clearTimeout(timerARef.current);
      if (timerBRef.current) clearTimeout(timerBRef.current);
    };
  }, [open]);

  return (
    <div ref={outerRef} style={style}>
      <div ref={innerRef} style={innerStyle}>{children}</div>
    </div>
  );
}
