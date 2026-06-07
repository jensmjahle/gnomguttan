import { useState, useRef, useCallback, useEffect } from 'react';
import styles from './PigsWidget.module.css';
import { postPigsRoundScore } from '@/services/feed';

// ── Types ─────────────────────────────────────────────────────────────────────

type PigPosition = 'dot_up' | 'dot_down' | 'trotter' | 'razorback' | 'snouter' | 'leaning_jowler';
type Phase       = 'idle' | 'throwing' | 'result';
type ResultType  = 'good' | 'pigout' | 'oinker' | null;
type PigAnim     = 'flying' | 'settling' | 'settled';

interface PigVis {
  display: PigPosition;
  anim:    PigAnim;
  x:       number;   // % from table left
  y:       number;   // % from table top
  rot:     number;   // final resting rotation in degrees
  entryRot: number;  // starting spin rotation for the fly-in (varies per pig)
}

// ── Data tables ───────────────────────────────────────────────────────────────

// Marginal probabilities from Kern (2006) Table 4, n=5977
// Averaged over black-pig (row) and pink-pig (column) marginals
const PROBABILITIES: [PigPosition, number][] = [
  ['dot_up',         0.3017],
  ['dot_down',       0.3497],
  ['trotter',        0.0884],
  ['razorback',      0.2237],
  ['snouter',        0.0304],
  ['leaning_jowler', 0.0061],
];

const OINKER_PROB = 23 / 6000;

// Scoring: Kern (2006) Table 3
const SCORES: Record<PigPosition, Record<PigPosition, number>> = {
  dot_up:         { dot_up: 1,  dot_down: 0,  trotter: 5,  razorback: 5,  snouter: 10, leaning_jowler: 15 },
  dot_down:       { dot_up: 0,  dot_down: 1,  trotter: 5,  razorback: 5,  snouter: 10, leaning_jowler: 15 },
  trotter:        { dot_up: 5,  dot_down: 5,  trotter: 20, razorback: 10, snouter: 15, leaning_jowler: 20 },
  razorback:      { dot_up: 5,  dot_down: 5,  trotter: 10, razorback: 20, snouter: 15, leaning_jowler: 20 },
  snouter:        { dot_up: 10, dot_down: 10, trotter: 15, razorback: 15, snouter: 40, leaning_jowler: 25 },
  leaning_jowler: { dot_up: 15, dot_down: 15, trotter: 20, razorback: 20, snouter: 25, leaning_jowler: 60 },
};

const PIG_IMAGES: Record<PigPosition, string> = {
  dot_up:         '/images/pigs/sideflesk%20prikk.gif',
  dot_down:       '/images/pigs/sideflesk%20ikke%20prikk.gif',
  trotter:        '/images/pigs/labber.gif',
  razorback:      '/images/pigs/svinerygg.gif',
  snouter:        '/images/pigs/tryne.gif',
  leaning_jowler: '/images/pigs/lyttegris.gif',
};

const POSITION_NAMES: Record<PigPosition, string> = {
  dot_up:         'Sideflesk (prikk)',
  dot_down:       'Sideflesk',
  trotter:        'Labber',
  razorback:      'Svinerygg',
  snouter:        'Tryne',
  leaning_jowler: 'Lyttegris',
};

const SIDERS       = new Set<PigPosition>(['dot_up', 'dot_down']);
const ALL_POSITIONS: PigPosition[] = ['dot_up', 'dot_down', 'trotter', 'razorback', 'snouter', 'leaning_jowler'];

// ── Helpers ───────────────────────────────────────────────────────────────────

function rollPosition(): PigPosition {
  const r = Math.random();
  let acc = 0;
  for (const [pos, prob] of PROBABILITIES) {
    acc += prob;
    if (r < acc) return pos;
  }
  return 'dot_down';
}

function rndItem<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)]; }

function getComboLabel(p1: PigPosition, p2: PigPosition): string {
  if (SCORES[p1][p2] === 0) return 'Grisebom!';
  if (p1 === p2) {
    return SIDERS.has(p1) ? 'Sideflesk' : `Dobbel ${POSITION_NAMES[p1]}!`;
  }
  const specials = ([p1, p2] as PigPosition[]).filter(p => !SIDERS.has(p));
  if (specials.length === 1) return POSITION_NAMES[specials[0]];
  return `${POSITION_NAMES[p1]} + ${POSITION_NAMES[p2]}`;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function PigsWidget({ compact = false }: { compact?: boolean }) {
  const [phase, setPhase]           = useState<Phase>('idle');
  const [resultType, setResultType] = useState<ResultType>(null);
  const [pig1, setPig1]             = useState<PigVis | null>(null);
  const [pig2, setPig2]             = useState<PigVis | null>(null);
  const [rollCount, setRollCount]   = useState(0);
  const [comboLabel, setComboLabel] = useState('');
  const [rollPoints, setRollPoints] = useState<number | null>(null);
  const [turnScore, setTurnScore]   = useState(0);
  const [totalScore, setTotalScore] = useState(0);
  const [bankedAmount, setBankedAmount] = useState<number | null>(null);
  const [feedPosted, setFeedPosted]     = useState(false);
  const [feedPosting, setFeedPosting]   = useState(false);

  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const clearAll = () => { timers.current.forEach(clearTimeout); timers.current = []; };
  const at = (fn: () => void, ms: number) => { timers.current.push(setTimeout(fn, ms)); };

  useEffect(() => clearAll, []);

  const roll = useCallback(() => {
    if (phase === 'throwing') return;
    clearAll();
    setBankedAmount(null);
    setPhase('throwing');
    setResultType(null);

    // Pre-compute result so the animation duration doesn't change the odds
    const isOinker  = Math.random() < OINKER_PROB;
    const finalP1   = rollPosition();
    const finalP2   = rollPosition();

    const mkPig = (x: number, y: number, rot: number, entryRot: number): PigVis => ({
      display: rndItem(ALL_POSITIONS),
      anim:    'flying',
      x, y, rot, entryRot,
    });

    let v1: PigVis, v2: PigVis;

    if (isOinker) {
      // Pigs collide — land overlapping near the center of the table
      const cx     = 33 + Math.random() * 30;         // 33–63 % from left
      const cy     = 25 + Math.random() * 32;         // 25–57 % from top
      const spread = 2 + Math.random() * 2.5;           // 2–4.5 % each side → 4–9 % total, well within the 14 % touch threshold
      v1 = mkPig(cx - spread, cy + (Math.random() - 0.5) * 6, (Math.random() - 0.5) * 30, -300);
      v2 = mkPig(cx + spread, cy + (Math.random() - 0.5) * 6, (Math.random() - 0.5) * 30, -200);
    } else {
      // Normal roll — keep pigs in their own halves
      v1 = mkPig(10  + Math.random() * 30, 20 + Math.random() * 42, (Math.random() - 0.5) * 44, -300);
      v2 = mkPig(58  + Math.random() * 26, 20 + Math.random() * 42, (Math.random() - 0.5) * 44, -200);
    }

    setRollCount(c => c + 1);
    setPig1(v1);
    setPig2(v2);

    // Rapid cycling during flight, decelerating toward the end
    const cycleTimes = [100, 210, 330, 460, 610, 780];
    cycleTimes.forEach(t => at(() => {
      setPig1(p => p ? { ...p, display: rndItem(ALL_POSITIONS) } : p);
      setPig2(p => p ? { ...p, display: rndItem(ALL_POSITIONS) } : p);
    }, t));

    // Lock to final image + begin settle animation
    at(() => {
      const d1 = isOinker ? rndItem(ALL_POSITIONS) : finalP1;
      const d2 = isOinker ? rndItem(ALL_POSITIONS) : finalP2;
      setPig1(p => p ? { ...p, display: d1, anim: 'settling' } : p);
      setPig2(p => p ? { ...p, display: d2, anim: 'settling' } : p);
    }, 870);

    // Settle animation completes
    at(() => {
      setPig1(p => p ? { ...p, anim: 'settled' } : p);
      setPig2(p => p ? { ...p, anim: 'settled' } : p);
    }, 1100);

    // Reveal result
    at(() => {
      if (isOinker) {
        setResultType('oinker');
        setComboLabel('Griseri!');
        setRollPoints(null);
        setTurnScore(0);
        setTotalScore(0);
      } else {
        const score    = SCORES[finalP1][finalP2];
        const isPigOut = score === 0;
        setComboLabel(getComboLabel(finalP1, finalP2));
        if (isPigOut) {
          setResultType('pigout');
          setRollPoints(null);
          setTurnScore(0);
        } else {
          setResultType('good');
          setRollPoints(score);
          setTurnScore(prev => prev + score);
        }
      }
      setPhase('result');
    }, 1150);
  }, [phase]);

  const bank = useCallback(() => {
    if (resultType !== 'good' || turnScore === 0) return;
    const amount = turnScore;
    setFeedPosted(false);
    setFeedPosting(false);
    setBankedAmount(amount);
    setTotalScore(prev => prev + amount);
    setTurnScore(0);
    setResultType(null);
    setComboLabel('');
    setRollPoints(null);
    setPhase('idle');
    // Pigs stay on the table
  }, [resultType, turnScore]);

  const canBank = resultType === 'good' && turnScore > 0;

  async function handleShareToFeed() {
    if (bankedAmount === null || feedPosting) return;
    setFeedPosting(true);
    try {
      await postPigsRoundScore(bankedAmount);
      setFeedPosted(true);
    } catch {
      // POST failed — leave button available for retry
    } finally {
      setFeedPosting(false);
    }
  }

  return (
    <section className={styles.widget}>
      <header className={styles.header}>
        <div className={styles.titleBlock}>
          <h2 className={styles.title}>Kast grisene</h2>
          <span className={styles.subtitle}>Ta å kast grisene da</span>
        </div>
      </header>

      <div className={styles.body}>

        {/* ── Table ────────────────────────────────────────────────────────── */}
        <div className={styles.table}>

          {phase === 'idle' && !pig1 && (
            <p className={styles.tableHint}>Kast grisene på bordet</p>
          )}

          {pig1 && (
            <div
              key={`p1-${rollCount}`}
              className={`${styles.pig} ${styles[pig1.anim]}`}
              style={{
                left:         `${pig1.x}%`,
                top:          `${pig1.y}%`,
                '--rot':      `${pig1.rot}deg`,
                '--entry-rot': `${pig1.entryRot}deg`,
              } as React.CSSProperties}
            >
              <img src={PIG_IMAGES[pig1.display]} alt={POSITION_NAMES[pig1.display]} />
            </div>
          )}

          {pig2 && (
            <div
              key={`p2-${rollCount}`}
              className={`${styles.pig} ${styles[pig2.anim]}`}
              style={{
                left:         `${pig2.x}%`,
                top:          `${pig2.y}%`,
                '--rot':      `${pig2.rot}deg`,
                '--entry-rot': `${pig2.entryRot}deg`,
              } as React.CSSProperties}
            >
              <img src={PIG_IMAGES[pig2.display]} alt={POSITION_NAMES[pig2.display]} />
            </div>
          )}

          {/* ── Result banner — overlaid on the table only in compact/widget mode */}
          {compact && phase === 'result' && resultType && (
            <div className={`${styles.banner} ${styles.bannerOverlay} ${styles[resultType]}`}>
              <span className={styles.comboName}>{comboLabel}</span>
              {resultType === 'oinker' && <span className={styles.comboSub}>Mister alt!</span>}
              {resultType === 'pigout' && <span className={styles.comboSub}>Mister rundepoeng</span>}
              {resultType === 'good' && rollPoints !== null && (
                <span className={styles.comboSub}>+{rollPoints} poeng</span>
              )}
            </div>
          )}
          {compact && phase === 'idle' && bankedAmount !== null && (
            <div className={`${styles.banner} ${styles.bannerOverlay} ${styles.banked}`}>
              <span className={styles.comboName}>De gir seg! 🙅</span>
              <span className={styles.comboSub}>+{bankedAmount} poeng</span>
              {feedPosted
                ? <span className={styles.comboSub}>Delt!</span>
                : <button className={styles.shareBtn} onClick={handleShareToFeed} disabled={feedPosting}>{feedPosting ? '…' : 'Del til feed'}</button>
              }
            </div>
          )}
        </div>

        {/* ── Result banner — below table on full page (non-compact) ─────── */}
        {!compact && (
          <div className={styles.bannerSlot}>
            {phase === 'result' && resultType && (
              <div className={`${styles.banner} ${styles[resultType]}`}>
                <span className={styles.comboName}>{comboLabel}</span>
                {resultType === 'oinker' && <span className={styles.comboSub}>Mister alt!</span>}
                {resultType === 'pigout' && <span className={styles.comboSub}>Mister rundepoeng</span>}
                {resultType === 'good' && rollPoints !== null && (
                  <span className={styles.comboSub}>+{rollPoints} poeng</span>
                )}
              </div>
            )}
            {phase === 'idle' && bankedAmount !== null && (
              <div className={`${styles.banner} ${styles.banked}`}>
                <span className={styles.comboName}>De gir seg! 🙅</span>
                <span className={styles.comboSub}>+{bankedAmount} poeng</span>
                {feedPosted
                  ? <span className={styles.comboSub}>Delt!</span>
                  : <button className={styles.shareBtn} onClick={handleShareToFeed} disabled={feedPosting}>{feedPosting ? '…' : 'Del til feed'}</button>
                }
              </div>
            )}
          </div>
        )}

        {/* ── Scores ───────────────────────────────────────────────────────── */}
        <div className={styles.scores}>
          <div className={styles.scoreBox}>
            <span className={styles.scoreLabel}>Runde</span>
            <span className={styles.scoreValue}>{turnScore}</span>
          </div>
          <div className={styles.scoreDivider} />
          <div className={styles.scoreBox}>
            <span className={styles.scoreLabel}>Totalt</span>
            <span className={styles.scoreValue}>{totalScore}</span>
          </div>
        </div>

        {/* ── Buttons ──────────────────────────────────────────────────────── */}
        <div className={styles.buttons}>
          {canBank && (
            <button className={styles.bankBtn} onClick={bank}>
              Gir meg der ({turnScore})
            </button>
          )}
          <button
            className={styles.rollBtn}
            onClick={roll}
            disabled={phase === 'throwing'}
          >
            {phase === 'throwing' ? 'Kaster…' :
             phase === 'idle'     ? 'Kast grisene' :
                                    'Kast igjen'}
          </button>
        </div>

      </div>
    </section>
  );
}
