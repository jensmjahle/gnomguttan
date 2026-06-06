import { useLayoutEffect, useEffect, useRef } from 'react';

const HEIGHT_MS   = 380;
const FADE_IN_MS  = 250;
const FADE_OUT_MS = 150;

interface Props {
  open: boolean;
  children: React.ReactNode;
  style?: React.CSSProperties;
  innerStyle?: React.CSSProperties;
}

/**
 * Collapses / expands its children in response to the `open` prop.
 * - Collapse: content fades out (150ms), then height slides to 0 (380ms).
 * - Expand:   height slides to content height (380ms, content hidden), then
 *             height snaps to `auto` while still invisible (silently corrects
 *             any nested-AnimatedHeight mismatch), then content fades in (250ms).
 *
 * If inner content height changes mid-expansion (e.g. a nested AnimatedHeight
 * snaps to a larger size because a sibling state change fired), a ResizeObserver
 * redirects the in-flight CSS transition to the new target height and resets the
 * settle timer, so the snap-to-auto and fade-in fire only after the correct
 * final height is actually reached — no visible jump.
 */
export function AnimatedCollapse({ open, children, style, innerStyle }: Props) {
  const outerRef          = useRef<HTMLDivElement>(null);
  const innerRef          = useRef<HTMLDivElement>(null);
  const timerARef         = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevOpenRef       = useRef(open);
  const lastOpenHeightRef = useRef(0);
  const isExpandingRef    = useRef(false);

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

  // Watch for content-height changes while the expand animation is in progress.
  // Scenario: composerOpen fires mid-reveal → a nested AnimatedHeight snaps to a
  // larger size → inner.scrollHeight jumps. We redirect the outer transition to
  // the new target and reset the settle timer so snap-to-auto fires only after
  // the CSS transition actually finishes at the new height.
  useLayoutEffect(() => {
    const inner = innerRef.current;
    const outer = outerRef.current;
    if (!inner || !outer) return;

    const settle = () => {
      timerARef.current      = null;
      isExpandingRef.current = false;
      outer.style.transition = 'none';
      outer.style.height     = 'auto';
      outer.style.overflow   = 'visible';
      void outer.offsetHeight; // flush so auto-height commits before opacity starts
      inner.style.transition = `opacity ${FADE_IN_MS}ms ease`;
      inner.style.opacity    = '1';
    };

    const ro = new ResizeObserver(() => {
      if (!isExpandingRef.current) return;
      const newH  = inner.scrollHeight;
      const prevH = parseFloat(outer.style.height);
      if (Math.abs(newH - prevH) < 1) return;
      // Redirect the in-flight animation to the new target height.
      outer.style.height = `${newH}px`;
      // Reset the settle timer: it must fire HEIGHT_MS after this update so the
      // CSS transition has time to actually reach the new target.
      if (timerARef.current) clearTimeout(timerARef.current);
      timerARef.current = setTimeout(settle, HEIGHT_MS);
    });

    ro.observe(inner);
    return () => ro.disconnect();
  }, []);

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

    if (!open) {
      isExpandingRef.current = false;
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
      // 1. Height animates from 0 → measured content height (box grows, content hidden).
      // 2. At HEIGHT_MS, while content is STILL invisible, snap to `height: auto`.
      //    This silently corrects any mismatch between the measured height and the
      //    true layout height (e.g. caused by a nested AnimatedHeight updating in the
      //    same render cycle) — the snap is invisible because opacity is still 0.
      // 3. Then fade the content in at the correct final size.
      // If inner content changes mid-animation, the ResizeObserver above redirects
      // the target height and resets the timer — see its comment for details.
      isExpandingRef.current = true;
      inner.style.transition = 'none';
      inner.style.opacity    = '0';

      outer.style.overflow   = 'hidden';
      outer.style.transition = `height ${HEIGHT_MS}ms cubic-bezier(0.4, 0, 0.2, 1)`;
      // scrollHeight sees through nested overflow:hidden containers (e.g. AnimatedHeight)
      // so we get the true final content height even when inner content changed in the
      // same render that triggered the expand.
      outer.style.height     = `${inner.scrollHeight}px`;

      timerARef.current = setTimeout(() => {
        timerARef.current      = null;
        isExpandingRef.current = false;
        // Snap to auto while still invisible — no visible jump
        outer.style.transition = 'none';
        outer.style.height     = 'auto';
        outer.style.overflow   = 'visible';
        void outer.offsetHeight; // flush so auto-height lands before opacity starts

        inner.style.transition = `opacity ${FADE_IN_MS}ms ease`;
        inner.style.opacity    = '1';
      }, HEIGHT_MS);
    }

    return () => {
      if (timerARef.current) clearTimeout(timerARef.current);
      isExpandingRef.current = false;
    };
  }, [open]);

  return (
    <div ref={outerRef} style={style}>
      <div ref={innerRef} style={innerStyle}>{children}</div>
    </div>
  );
}
