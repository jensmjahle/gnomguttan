import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { GUTTAN_NAMES } from '@/constants/guttan';
import { postKrokodilResult } from '@/services/feed';
import { TOOTH_COUNT } from './krokodilConfig';
import type { KrokodilScene } from './krokodilScene';
import styles from './KrokodilWidget.module.css';

// Pass-the-device Krokodil: players take turns pressing a lower tooth, and the
// one who presses the hidden trap tooth gets the mouth slammed shut on them.
// The three.js scene is loaded on demand so the home page bundle stays small.

const STORAGE_KEY = 'krokodil_players';
const MAX_PLAYERS = 32;

type Phase = 'loading' | 'busy' | 'playing' | 'lost' | 'error';

interface RoundResult {
  loser:   string;
  presses: number;
  players: number;
}

function loadPlayers(): string[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null');
    return Array.isArray(parsed) && parsed.length >= 2 && parsed.every((p) => typeof p === 'string') ? parsed : GUTTAN_NAMES;
  } catch { return GUTTAN_NAMES; }
}

function PeopleIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
      <path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
      <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
    </svg>
  );
}

export function KrokodilWidget({ compact = false }: { compact?: boolean }) {
  const [players, setPlayers]         = useState<string[]>(loadPlayers);
  const [phase, setPhase]             = useState<Phase>('loading');
  const [turn, setTurn]               = useState(0);
  const [presses, setPresses]         = useState(0);
  const [result, setResult]           = useState<RoundResult | null>(null);
  const [editing, setEditing]         = useState(false);
  const [draft, setDraft]             = useState('');
  const [feedPosted, setFeedPosted]   = useState(false);
  const [feedPosting, setFeedPosting] = useState(false);

  const stageRef     = useRef<HTMLDivElement>(null);
  const sceneRef     = useRef<KrokodilScene | null>(null);
  const trapRef      = useRef(0);
  const playersRef   = useRef(players);
  const playAgainRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    playersRef.current = players;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(players));
  }, [players]);

  const current = players[turn % players.length];
  const next    = players[(turn + 1) % players.length];

  const startRound = useCallback(async (first: number) => {
    const scene = sceneRef.current;
    if (!scene) return;
    trapRef.current = Math.floor(Math.random() * TOOTH_COUNT);
    setTurn(first);
    setPresses(0);
    setResult(null);
    setFeedPosted(false);
    setFeedPosting(false);
    setPhase('busy');
    await scene.reopen();
    if (sceneRef.current === scene) setPhase('playing');
  }, []);

  const handlePress = async (index: number) => {
    const scene = sceneRef.current;
    if (!scene || phase !== 'playing' || editing) return;
    scene.setInteractive(false);
    setPhase('busy');
    const name  = players[turn % players.length];
    const count = presses + 1;
    setPresses(count);

    if (index === trapRef.current) {
      await scene.pressTooth(index);
      await scene.slam();
      if (sceneRef.current !== scene) return;
      setResult({ loser: name, presses: count, players: players.length });
      setPhase('lost');
      return;
    }

    await scene.pressTooth(index);
    if (sceneRef.current !== scene) return;
    scene.flinch();
    setTurn((turn + 1) % players.length);
    setPhase('playing');
  };

  // The scene calls back into whatever handlePress is current.
  const pressRef = useRef(handlePress);
  useEffect(() => { pressRef.current = handlePress; });

  useEffect(() => {
    let cancelled = false;
    let scene: KrokodilScene | null = null;
    import('./krokodilScene')
      .then(({ KrokodilScene }) => {
        if (cancelled || !stageRef.current) return;
        scene = new KrokodilScene(stageRef.current, { onToothPress: (i) => { void pressRef.current(i); } });
        sceneRef.current = scene;
        void startRound(Math.floor(Math.random() * playersRef.current.length));
      })
      .catch(() => { if (!cancelled) setPhase('error'); });
    return () => {
      cancelled = true;
      scene?.dispose();
      sceneRef.current = null;
    };
  }, [startRound]);

  // Teeth only respond while it's someone's turn and the names panel is closed.
  useEffect(() => {
    sceneRef.current?.setInteractive(phase === 'playing' && !editing);
  }, [phase, editing]);

  // "Spill igjen" takes focus when the round ends and again after editing names.
  useEffect(() => {
    if (phase === 'lost' && !editing) playAgainRef.current?.focus({ preventScroll: true });
  }, [phase, editing]);

  const playAgain = () => {
    // The loser is holding the device, so they start the next round.
    const loserIndex = result ? players.indexOf(result.loser) : -1;
    void startRound(Math.max(0, loserIndex));
    stageRef.current?.querySelector('canvas')?.focus({ preventScroll: true });
  };

  const share = async () => {
    if (!result || feedPosting) return;
    setFeedPosting(true);
    try {
      await postKrokodilResult(result.loser, result.players, result.presses);
      setFeedPosted(true);
    } catch {
      // POST failed — leave button available for retry
    } finally {
      setFeedPosting(false);
    }
  };

  const addPlayer = (e: FormEvent) => {
    e.preventDefault();
    const name = draft.trim();
    if (!name || players.includes(name) || players.length >= MAX_PLAYERS) return;
    setPlayers((prev) => [...prev, name]);
    setDraft('');
  };

  const removePlayer = (index: number) => {
    if (players.length <= 2) return;
    setPlayers((prev) => prev.filter((_, i) => i !== index));
    // Keep the turn with the same person when someone before them leaves.
    setTurn((t) => (index < t % players.length ? t - 1 : t));
  };

  const resetPlayers = () => {
    setPlayers(GUTTAN_NAMES);
    setTurn(0);
  };

  const canEdit = phase !== 'busy';
  const teethLeft = TOOTH_COUNT - presses;

  return (
    <section className={`${styles.widget} ${compact ? styles.compact : ''}`}>
      <header className={styles.header}>
        <div className={styles.titleBlock}>
          <h2 className={styles.title}>Krokodil</h2>
          <span className={styles.subtitle}>{players.length} spillere · {teethLeft} {teethLeft === 1 ? 'tann' : 'tenner'} igjen</span>
        </div>
        <div className={styles.headerActions}>
          <button
            className={`${styles.iconBtn} ${editing ? styles.iconBtnActive : ''}`}
            onClick={() => setEditing((v) => !v)}
            disabled={!canEdit && !editing}
            title="Spillere"
            aria-label="Spillere"
            aria-pressed={editing}
          >
            <PeopleIcon />
          </button>
          <button className={styles.resetBtn} onClick={resetPlayers} title="Reset to Guttan">
            <img src="/logo.png" alt="Reset to Guttan" className={styles.resetLogo} />
          </button>
        </div>
      </header>

      <div className={styles.body}>
        <div className={styles.stage}>
          <div ref={stageRef} className={styles.canvasHost} />

          {phase === 'loading' && <p className={styles.stageNote}>Vekker krokodillen…</p>}
          {phase === 'error' && <p className={styles.stageNote}>Klarte ikke å starte 3D-grafikken i denne nettleseren.</p>}

          {phase === 'lost' && result && (
            <div className={styles.endCard} role="dialog" aria-label="Runden er over">
              <span className={styles.endKicker}>SNAPP!</span>
              <span className={styles.endName}>{result.loser.toUpperCase()}</span>
              <span className={styles.endSub}>ble bitt på trykk nr. {result.presses}</span>
              <div className={styles.endActions}>
                <button ref={playAgainRef} className={styles.primaryBtn} onClick={playAgain}>Spill igjen</button>
                {feedPosted
                  ? <span className={styles.sharedConfirm}>Delt!</span>
                  : <button className={styles.secondaryBtn} onClick={share} disabled={feedPosting}>{feedPosting ? '…' : 'Del til feed'}</button>
                }
                <button className={styles.ghostBtn} onClick={() => setEditing(true)}>Endre navn</button>
              </div>
            </div>
          )}
        </div>

        <footer className={styles.turnBar}>
          {phase === 'lost' && result ? (
            <span className={styles.turnOver}>Runden er over</span>
          ) : (
            <>
              <div className={styles.turnNow}>
                <span className={styles.turnLabel}>Din tur</span>
                <span key={`${turn}-${presses}`} className={styles.turnName}>{current}</span>
              </div>
              <div className={styles.turnNext}>
                <span className={styles.turnLabel}>Neste</span>
                <span className={styles.turnNextName}>{next}</span>
              </div>
            </>
          )}
        </footer>

        {editing && (
          <div className={styles.namesPanel}>
            <div className={styles.namesHeader}>
              <span className={styles.listTitle}>Spillere</span>
              <button className={styles.primaryBtn} onClick={() => setEditing(false)}>Ferdig</button>
            </div>
            <form className={styles.addForm} onSubmit={addPlayer}>
              <input
                className={styles.input}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder={players.length >= MAX_PLAYERS ? `Maks ${MAX_PLAYERS} spillere` : 'Nytt navn'}
                disabled={players.length >= MAX_PLAYERS}
                autoFocus
                maxLength={24}
              />
              <button type="submit" className={styles.addBtn} disabled={!draft.trim() || players.includes(draft.trim())} aria-label="Legg til">
                <PlusIcon />
              </button>
            </form>
            <ul className={styles.nameList}>
              {players.map((name, i) => (
                <li key={name} className={`${styles.nameItem} ${i === turn % players.length && phase !== 'lost' ? styles.nameItemTurn : ''}`}>
                  <span className={styles.nameText}>{name}</span>
                  {players.length > 2 && (
                    <button className={styles.removeBtn} onClick={() => removePlayer(i)} title={`Fjern ${name}`} aria-label={`Fjern ${name}`}>×</button>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </section>
  );
}
