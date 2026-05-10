import { useState, useRef, useEffect, useCallback, type FormEvent } from 'react';
import styles from './SpinWheelWidget.module.css';

function generateColors(n: number): string[] {
  const offset = Math.random() * 360;
  return Array.from({ length: n }, (_, i) =>
    `hsl(${Math.round((offset + (i * 360) / n) % 360)}, 68%, 55%)`
  );
}
const SIZE = 260;
const CX = SIZE / 2;
const CY = SIZE / 2;
const R = CX - 6;
const STORAGE_KEY = 'spin_wheel_options';

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
  }, []);
}

export function SpinWheelWidget() {
  const [options, setOptions] = useState<string[]>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      const parsed = stored ? JSON.parse(stored) : null;
      return Array.isArray(parsed) && parsed.length >= 2 ? parsed : ['Ari', 'Emil', 'Heine', 'Jens', 'Joachim', 'Magnus', 'Martin', 'Mikkel', 'Sondre', 'Torbjørn'];
    } catch {
      return ['Ari', 'Emil', 'Heine', 'Jens', 'Joachim', 'Magnus', 'Martin', 'Mikkel', 'Sondre', 'Torbjørn'];
    }
  });
  const [colors, setColors] = useState<string[]>(() => generateColors(options.length));
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

    // The segment at the top after rotation R is at angle (360 - R % 360) % 360 from the start.
    // We want that angle to equal the midpoint of winner segment idx.
    const targetTop = (idx * segAngle + segAngle / 2) % 360;
    const needed = (360 - targetTop) % 360;
    const currentMod = rotationRef.current % 360;
    const diff = (needed - currentMod + 360) % 360;
    const finalRotation = rotationRef.current + 5 * 360 + diff;

    rotationRef.current = finalRotation;
    setSpinning(true);
    setWinner(null);

    el.style.transition = 'transform 4s cubic-bezier(0.17, 0.67, 0.12, 0.99)';
    el.style.transformOrigin = 'center';
    el.style.transform = `rotate(${finalRotation}deg)`;

    const onEnd = () => {
      el.removeEventListener('transitionend', onEnd);
      el.style.transition = 'none';
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
    setColors(generateColors(options.length + 1));
    setDraft('');
    setAddOpen(false);
    setWinner(null);
  };

  const removeOption = (i: number) => {
    if (options.length <= 2) return;
    setOptions((prev) => prev.filter((_, idx) => idx !== i));
    setColors(generateColors(options.length - 1));
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
                    fill={colors[i]}
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
                    <span className={styles.optionDot} style={{ background: colors[i] }} />
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
