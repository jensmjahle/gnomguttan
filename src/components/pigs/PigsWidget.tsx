import { useState, useRef, useCallback } from 'react';
import styles from './PigsWidget.module.css';

// ── Types ─────────────────────────────────────────────────────────────────────

type PigPosition = 'dot_up' | 'dot_down' | 'trotter' | 'razorback' | 'snouter' | 'leaning_jowler';
type Phase      = 'idle' | 'throwing' | 'result';
type ResultType = 'good' | 'pigout' | 'oinker' | null;

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

// 23 out of 6000 recorded rolls resulted in touching pigs
const OINKER_PROB = 23 / 6000;

// Scoring table: Kern (2006) Table 3 — all 36 two-pig combinations
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
  leaning_jowler: '/images/pigs/skeiv%20gris.gif',
};

const POSITION_NAMES: Record<PigPosition, string> = {
  dot_up:         'Sideflesk (prikk)',
  dot_down:       'Sideflesk',
  trotter:        'Labber',
  razorback:      'Svinerygg',
  snouter:        'Tryne',
  leaning_jowler: 'Skeiv gris',
};

const SIDERS = new Set<PigPosition>(['dot_up', 'dot_down']);

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

export function PigsWidget() {
  const [phase, setPhase]               = useState<Phase>('idle');
  const [resultType, setResultType]     = useState<ResultType>(null);
  const [pig1, setPig1]                 = useState<PigPosition | null>(null);
  const [pig2, setPig2]                 = useState<PigPosition | null>(null);
  const [comboLabel, setComboLabel]     = useState('');
  const [rollPoints, setRollPoints]     = useState<number | null>(null);
  const [turnScore, setTurnScore]       = useState(0);
  const [totalScore, setTotalScore]     = useState(0);
  const [bankedAmount, setBankedAmount] = useState<number | null>(null);

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const roll = useCallback(() => {
    if (phase === 'throwing') return;
    if (timerRef.current) clearTimeout(timerRef.current);
    setBankedAmount(null);
    setPhase('throwing');
    setPig1(null);
    setPig2(null);
    setResultType(null);

    timerRef.current = setTimeout(() => {
      if (Math.random() < OINKER_PROB) {
        setResultType('oinker');
        setComboLabel('Oinker!');
        setRollPoints(null);
        setTurnScore(0);
        setTotalScore(0);
        setPhase('result');
        return;
      }

      const p1 = rollPosition();
      const p2 = rollPosition();
      const score = SCORES[p1][p2];
      const isPigOut = score === 0;

      setPig1(p1);
      setPig2(p2);
      setComboLabel(getComboLabel(p1, p2));

      if (isPigOut) {
        setResultType('pigout');
        setRollPoints(null);
        setTurnScore(0);
      } else {
        setResultType('good');
        setRollPoints(score);
        setTurnScore(prev => prev + score);
      }
      setPhase('result');
    }, 700);
  }, [phase]);

  const bank = useCallback(() => {
    if (resultType !== 'good' || turnScore === 0) return;
    const amount = turnScore;
    setBankedAmount(amount);
    setTotalScore(prev => prev + amount);
    setTurnScore(0);
    setPig1(null);
    setPig2(null);
    setResultType(null);
    setComboLabel('');
    setRollPoints(null);
    setPhase('idle');
  }, [resultType, turnScore]);

  const canBank = resultType === 'good' && turnScore > 0;

  return (
    <section className={styles.widget}>
      <header className={styles.header}>
        <div className={styles.titleBlock}>
          <h2 className={styles.title}>Grispill</h2>
          <span className={styles.subtitle}>Pass the Pigs</span>
        </div>
      </header>

      <div className={styles.body}>

        {/* ── Pig stage ──────────────────────────────────────────────────────── */}
        <div className={styles.stage}>
          <div className={styles.pigSlots}>

            <div className={`${styles.pigSlot} ${phase === 'throwing' ? styles.throwing : ''}`}>
              {pig1 ? (
                <img src={PIG_IMAGES[pig1]} alt={POSITION_NAMES[pig1]} className={styles.pigImg} />
              ) : (
                <div className={styles.pigPlaceholder} />
              )}
            </div>

            <div className={`${styles.pigSlot} ${phase === 'throwing' ? styles.throwing : ''} ${styles.throwDelay}`}>
              {pig2 ? (
                <img src={PIG_IMAGES[pig2]} alt={POSITION_NAMES[pig2]} className={styles.pigImg} />
              ) : (
                <div className={styles.pigPlaceholder} />
              )}
            </div>

          </div>

          {/* Result / banked banner */}
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
                <span className={styles.comboName}>Banket!</span>
                <span className={styles.comboSub}>+{bankedAmount} poeng</span>
              </div>
            )}
          </div>
        </div>

        {/* ── Score panel ────────────────────────────────────────────────────── */}
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

        {/* ── Buttons ────────────────────────────────────────────────────────── */}
        <div className={styles.buttons}>
          {canBank && (
            <button className={styles.bankBtn} onClick={bank}>
              Bank ({turnScore})
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
