import { useState, useRef, useEffect, useCallback, type FormEvent } from 'react';
import styles from './SpinWheelWidget.module.css';

function generateHues(n: number): number[] {
  const offset = Math.random() * 360;
  return Array.from({ length: n }, (_, i) => (offset + (i * 360) / n) % 360);
}

function hslStr(h: number): string {
  return `hsl(${Math.round(((h % 360) + 360) % 360)}, 68%, 55%)`;
}

// Solves cubic-bezier(0.17, 0.67, 0.12, 0.99) — same curve used for the spin transition.
// Returns the easing output (progress) for a normalized time t ∈ [0,1].
function bezierProgress(t: number): number {
  const x1 = 0.17, y1 = 0.67, x2 = 0.12, y2 = 0.99;
  let lo = 0, hi = 1;
  for (let i = 0; i < 20; i++) {
    const s = (lo + hi) / 2;
    const xs = 3 * x1 * s * (1 - s) ** 2 + 3 * x2 * s ** 2 * (1 - s) + s ** 3;
    if (xs < t) lo = s; else hi = s;
  }
  const s = (lo + hi) / 2;
  return 3 * y1 * s * (1 - s) ** 2 + 3 * y2 * s ** 2 * (1 - s) + s ** 3;
}
const SIZE = 260;
const CX = SIZE / 2;
const CY = SIZE / 2;
const R = CX - 6;
const STORAGE_KEY = 'spin_wheel_options';
const DEFAULT_OPTIONS = ['Ari', 'Emil', 'Heine', 'Jens', 'Joachim', 'Magnus', 'Martin', 'Mikkel', 'Sondre', 'Torbjørn'];

function polarToXY(angleDeg: number, r = R) {
  const rad = (angleDeg - 90) * (Math.PI / 180);
  return { x: CX + r * Math.cos(rad), y: CY + r * Math.sin(rad) };
}

function segPath(startDeg: number, endDeg: number): string {
  const s = polarToXY(startDeg);
  const e = polarToXY(endDeg);
  const large = endDeg - startDeg > 180 ? 1 : 0;
  return `M${CX},${CY} L${s.x},${s.y} A${R},${R} 0 ${large} 1 ${e.x},${e.y} Z`;
}

function truncate(s: string, n: number) {
  return s.length > n ? s.slice(0, n) + '…' : s;
}

function PlusIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
      strokeLinecap="round" strokeLinejoin="round"
      style={{ transition: 'transform 0.22s ease', transform: open ? 'rotate(180deg)' : 'rotate(0deg)' }}
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

const CONFETTI_COLORS = ['#6366f1', '#22c55e', '#f59e0b', '#ef4444', '#06b6d4', '#a855f7', '#ec4899', '#fde047'];

function useConfetti(containerRef: React.RefObject<HTMLElement>) {
  const rafRef = useRef(0);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => () => {
    cancelAnimationFrame(rafRef.current);
    canvasRef.current?.remove();
  }, []);

  return useCallback(() => {
    const container = containerRef.current;
    if (!container) return;

    cancelAnimationFrame(rafRef.current);
    canvasRef.current?.remove();

    const canvas = document.createElement('canvas');
    canvas.width = container.offsetWidth;
    canvas.height = container.offsetHeight;
    canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:10;';
    container.appendChild(canvas);
    canvasRef.current = canvas;
    const ctx = canvas.getContext('2d')!;

    const particles = Array.from({ length: 80 }, () => ({
      x: canvas.width * (0.1 + Math.random() * 0.8),
      y: -5 - Math.random() * 30,
      vx: (Math.random() - 0.5) * 4,
      vy: 1 + Math.random() * 3,
      rot: Math.random() * Math.PI * 2,
      rotV: (Math.random() - 0.5) * 0.16,
      color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
      w: 7 + Math.random() * 7,
      h: 3 + Math.random() * 5,
    }));

    const start = performance.now();

    function tick(now: number) {
      const elapsed = now - start;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const alpha = Math.max(0, 1 - Math.max(0, elapsed - 2200) / 800);
      let any = false;

      for (const p of particles) {
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.13;
        p.vx *= 0.99;
        p.rot += p.rotV;
        if (p.y > canvas.height + 20) continue;
        any = true;
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        ctx.restore();
      }

      if (any && elapsed < 3500) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        canvas.remove();
      }
    }

    rafRef.current = requestAnimationFrame(tick);
  }, [containerRef]);
}

export function SpinWheelWidget() {
  const [options, setOptions] = useState<string[]>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      const parsed = stored ? JSON.parse(stored) : null;
      return Array.isArray(parsed) && parsed.length >= 2 ? parsed : DEFAULT_OPTIONS;
    } catch {
      return DEFAULT_OPTIONS;
    }
  });
  const [hues, setHues] = useState<number[]>(() => generateHues(options.length));
  const [spinning, setSpinning] = useState(false);
  const [winner, setWinner] = useState<string | null>(null);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [draft, setDraft] = useState('');

  const widgetRef = useRef<HTMLElement>(null);
  const fireConfetti = useConfetti(widgetRef);
  const svgRef = useRef<SVGSVGElement>(null);
  const rotationRef = useRef(0);
  const winnerRef = useRef('');
  const baseHuesRef = useRef<number[]>([]);
  const hueAccRef = useRef(0);
  const colorAnimRef = useRef(0);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(options));
  }, [options]);

  const spin = () => {
    const el = svgRef.current;
    if (spinning || options.length < 2 || !el) return;

    const n = options.length;
    const segAngle = 360 / n;
    const idx = Math.floor(Math.random() * n);
    winnerRef.current = options[idx];

    const margin = segAngle * 0.02;
    const targetTop = (idx * segAngle + margin + Math.random() * (segAngle - margin * 2)) % 360;
    const needed = (360 - targetTop) % 360;
    const currentMod = rotationRef.current % 360;
    const diff = (needed - currentMod + 360) % 360;
    const prevRotation = rotationRef.current;
    const finalRotation = prevRotation + 5 * 360 + diff;
    const totalRotation = finalRotation - prevRotation;

    rotationRef.current = finalRotation;
    setSpinning(true);
    setWinner(null);

    el.style.transition = 'transform 4s cubic-bezier(0.17, 0.67, 0.12, 0.99)';
    el.style.transformOrigin = 'center';
    el.style.transform = `rotate(${finalRotation}deg)`;

    // Snapshot hues and start color animation driven by the same velocity curve.
    cancelAnimationFrame(colorAnimRef.current);
    baseHuesRef.current = [...hues];
    hueAccRef.current = 0;
    const spinStart = performance.now();
    const SPIN_DURATION = 4000;
    let prevProgress = 0;

    function animateHues(now: number) {
      const t = Math.min((now - spinStart) / SPIN_DURATION, 1);
      const progress = bezierProgress(t);
      const deltaRotation = (progress - prevProgress) * totalRotation;
      prevProgress = progress;
      hueAccRef.current += deltaRotation * 0.5; // 0.5 hue° per wheel°

      const color = (i: number) => hslStr(baseHuesRef.current[i] + hueAccRef.current);

      svgRef.current?.querySelectorAll<SVGPathElement>('path').forEach((path, i) => {
        if (i < baseHuesRef.current.length) path.style.fill = color(i);
      });

      widgetRef.current?.querySelectorAll<HTMLSpanElement>('[data-color-dot]').forEach((dot) => {
        const i = Number(dot.dataset.colorDot);
        dot.style.background = color(i);
      });

      if (t < 1) colorAnimRef.current = requestAnimationFrame(animateHues);
    }
    colorAnimRef.current = requestAnimationFrame(animateHues);

    const onEnd = () => {
      el.removeEventListener('transitionend', onEnd);
      el.style.transition = 'none';
      cancelAnimationFrame(colorAnimRef.current);
      const finalHues = baseHuesRef.current.map(h => ((h + hueAccRef.current) % 360 + 360) % 360);
      setHues(finalHues);
      setSpinning(false);
      setWinner(winnerRef.current);
      fireConfetti();
    };
    el.addEventListener('transitionend', onEnd);
  };

  const addOption = (e: FormEvent) => {
    e.preventDefault();
    const text = draft.trim();
    if (!text || options.includes(text)) return;
    setOptions((prev) => [...prev, text]);
    setHues(generateHues(options.length + 1));
    setDraft('');
    setAddOpen(false);
    setWinner(null);
  };

  const removeOption = (i: number) => {
    if (options.length <= 2) return;
    setOptions((prev) => prev.filter((_, idx) => idx !== i));
    setHues(generateHues(options.length - 1));
    setWinner(null);
    const el = svgRef.current;
    if (el) {
      el.style.transition = 'none';
      el.style.transform = 'rotate(0deg)';
      rotationRef.current = 0;
    }
  };

  const resetOptions = () => {
    setOptions(DEFAULT_OPTIONS);
    setHues(generateHues(DEFAULT_OPTIONS.length));
    setWinner(null);
    const el = svgRef.current;
    if (el) {
      el.style.transition = 'none';
      el.style.transform = 'rotate(0deg)';
      rotationRef.current = 0;
    }
  };

  const n = options.length;
  const segAngle = 360 / n;
  const fontSize = n > 8 ? 9 : n > 5 ? 11 : 13;
  const maxChars = n > 8 ? 10 : n > 5 ? 13 : 16;

  return (
    <section ref={widgetRef} className={styles.widget}>
      <header className={styles.header}>
        <div className={styles.titleBlock}>
          <h2 className={styles.title}>Spin the Wheel</h2>
          <span className={styles.subtitle}>{n} options</span>
        </div>
        <button className={styles.resetBtn} onClick={resetOptions} title="Reset to Guttan">
          <img src="/logo.png" alt="Reset to Guttan" className={styles.resetLogo} />
        </button>
      </header>

      <div className={styles.body}>
        <div className={styles.wheelWrap}>
          <div className={styles.pointer} />
          <svg
            ref={svgRef}
            width={SIZE}
            height={SIZE}
            viewBox={`0 0 ${SIZE} ${SIZE}`}
            className={styles.wheelSvg}
            onClick={spin}
            style={{ cursor: spinning ? 'default' : 'pointer' }}
            aria-label="Spin the wheel"
            role="button"
          >
            {options.map((opt, i) => {
              const start = i * segAngle;
              const end = (i + 1) * segAngle;
              const mid = (start + end) / 2;
              const { x: tx, y: ty } = polarToXY(mid, R * 0.62);
              return (
                <g key={i}>
                  <path
                    d={segPath(start, end)}
                    style={{ fill: hslStr(hues[i]) }}
                    stroke="rgba(255,255,255,0.2)"
                    strokeWidth="1.5"
                  />
                  <text
                    x={tx}
                    y={ty}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fill="white"
                    fontSize={fontSize}
                    fontWeight="700"
                    transform={`rotate(${mid - 90}, ${tx}, ${ty})`}
                    style={{ pointerEvents: 'none', userSelect: 'none' }}
                  >
                    {truncate(opt, maxChars)}
                  </text>
                </g>
              );
            })}
            <circle cx={CX} cy={CY} r={14} fill="white" opacity="0.15" />
            <circle cx={CX} cy={CY} r={8} fill="white" opacity="0.85" />
          </svg>
          {winner && (
            <div className={styles.winnerOverlay}>
              <span className={styles.winnerLabel}>Winner</span>
              <span className={styles.winnerText}>{winner.toUpperCase()}</span>
            </div>
          )}
        </div>

        <p className={styles.hint}>{spinning ? 'Spinning…' : 'Click the wheel to spin'}</p>

        <div className={styles.optionsToggleRow}>
          <button
            className={styles.optionsToggle}
            onClick={() => setOptionsOpen((o) => !o)}
          >
            <ChevronIcon open={optionsOpen} />
            <span>Options ({n})</span>
          </button>
          <button
            className={styles.iconBtn}
            title="Add option"
            onClick={() => { setOptionsOpen(true); setAddOpen((o) => !o); setDraft(''); }}
          >
            <PlusIcon />
          </button>
        </div>

        <div className={`${styles.optionsDrawer} ${optionsOpen ? styles.drawerOpen : ''}`}>
          <div className={styles.optionsInner}>
            <div className={styles.optionsContent}>
              {addOpen && (
                <form className={styles.addForm} onSubmit={addOption}>
                  <input
                    className={styles.input}
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    placeholder="New option"
                    autoFocus
                    maxLength={24}
                  />
                  <button type="submit" className={styles.primaryBtn} disabled={!draft.trim()}>
                    Add
                  </button>
                </form>
              )}
              <ul className={styles.optionList}>
                {options.map((opt, i) => (
                  <li key={i} className={styles.optionItem}>
                    <span className={styles.optionDot} data-color-dot={i} style={{ background: hslStr(hues[i]) }} />
                    <span className={styles.optionText}>{opt}</span>
                    {options.length > 2 && (
                      <button className={styles.removeBtn} onClick={() => removeOption(i)} title="Remove">
                        ×
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
