import { useState, useCallback, useEffect, useId } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import styles from './TournamentPage.module.css';
import {
  GUTTAN, applyWinner, buildDoubleElim, buildFfaWithLB, buildFromNames, buildRoundRobin, buildSingleElim, buildSwissRound,
  computeStandings, flattenToNames, genId, shuffle,
  type BMatch, type FormatType, type Participant, type RRMatch,
} from '@/utils/tournamentEngine';

// ── Match card ────────────────────────────────────────────────────────────────

function MatchCard({ match, participants, onWinner, revealMode, revealed, onReveal }: {
  match: BMatch;
  participants: Participant[];
  onWinner: (matchId: string, pid: string) => void;
  revealMode: boolean;
  revealed: Set<string>;
  onReveal: (pid: string) => void;
}) {
  const [queue, setQueue] = useState<string[]>([]);
  const [animating, setAnimating] = useState<string | null>(null);

  useEffect(() => {
    if (queue.length === 0) return;
    const [first, ...rest] = queue;
    const timer = setTimeout(() => {
      onReveal(first);
      setAnimating(first);
      setQueue(rest);
      setTimeout(() => setAnimating(null), 500);
    }, 600);
    return () => clearTimeout(timer);
  }, [queue, onReveal]);

  // Auto-resolve when all slots are filled but only one is a real player (others are byes)
  useEffect(() => {
    const real = match.slots.filter(s => s.pid && !s.isBye);
    const allFilled = match.slots.every(s => s.pid !== null);
    if (allFilled && real.length === 1 && match.winners.length === 0) {
      onWinner(match.id, real[0].pid!);
    }
  }, [match.id, match.slots, match.winners.length, onWinner]);

  const getName = (pid: string | null) => {
    if (!pid) return 'TBD';
    if (pid.startsWith('__bye')) return 'Bye';
    return participants.find(p => p.id === pid)?.label ?? pid;
  };

  const unrevealed = match.slots.filter(s => s.pid && !s.isBye && !revealed.has(s.pid));
  const isAnyUnrevealed = revealMode && unrevealed.length > 0;
  const isRevealing = queue.length > 0;
  const showOverlay = isAnyUnrevealed && !isRevealing;

  const startReveal = () => {
    if (isRevealing || unrevealed.length === 0) return;
    setQueue(unrevealed.map(s => s.pid!));
  };

  const filledNonBye = match.slots.filter(s => s.pid && !s.isBye).length;
  const canPick = filledNonBye >= 2 && !isAnyUnrevealed;
  const isDone = match.winners.length >= match.advancePer;

  return (
    <div className={`${styles.match} ${isDone && !isAnyUnrevealed ? styles.matchDone : ''}`} style={{ position: 'relative' }}>
      {/* Big ? overlay — covers the whole card until the sequence starts */}
      {showOverlay && (
        <button
          className={styles.matchRevealOverlay}
          onClick={startReveal}
          aria-label="Avsløre"
        >
          <span className={styles.matchRevealQ}>?</span>
        </button>
      )}

      {match.slots.filter(s => !s.isBye).map((slot, i) => {
        const isVisible = !revealMode || !slot.pid || revealed.has(slot.pid);
        const isFadingIn = slot.pid === animating;
        const isWinner = slot.pid !== null && match.winners.includes(slot.pid);
        const isTbd = slot.pid === null;
        const atCapacity = match.winners.length >= match.advancePer;
        const disabled = isAnyUnrevealed || !canPick || isTbd || (!isWinner && atCapacity);

        return (
          <button
            key={i}
            className={[
              styles.matchSlot,
              isWinner && !isAnyUnrevealed ? styles.matchSlotWinner : '',
              isTbd ? styles.matchSlotTbd : '',
            ].filter(Boolean).join(' ')}
            onClick={() => !disabled && slot.pid && onWinner(match.id, slot.pid)}
            disabled={disabled}
          >
            <span className={`${styles.slotName} ${isFadingIn ? styles.slotFadeIn : ''}`}>
              {isVisible ? getName(slot.pid) : ''}
            </span>
            {!isAnyUnrevealed && isWinner && <span className={styles.winnerMark}>✓</span>}
          </button>
        );
      })}
    </div>
  );
}

// ── Round column ──────────────────────────────────────────────────────────────

function RoundCol({ matches, participants, onWinner, revealMode, revealed, onReveal }: {
  matches: BMatch[];
  participants: Participant[];
  onWinner: (matchId: string, pid: string) => void;
  revealMode: boolean;
  revealed: Set<string>;
  onReveal: (pid: string) => void;
}) {
  return (
    <div className={styles.round}>
      {matches.map(m => (
        <div key={m.id} className={styles.matchWrap}>
          <MatchCard match={m} participants={participants} onWinner={onWinner}
            revealMode={revealMode} revealed={revealed} onReveal={onReveal} />
        </div>
      ))}
    </div>
  );
}

// ── RR / Swiss components ─────────────────────────────────────────────────────

function StandingsTable({ participants, matches }: { participants: Participant[]; matches: RRMatch[] }) {
  const rows = computeStandings(participants, matches);
  const played = (p: typeof rows[0]) => p.wins + p.losses;
  return (
    <table className={styles.standingsTable}>
      <thead>
        <tr><th>#</th><th>Navn</th><th>V</th><th>T</th><th>Spilt</th></tr>
      </thead>
      <tbody>
        {rows.map((p, i) => (
          <tr key={p.id} className={i === 0 && played(p) > 0 ? styles.standingsLeader : ''}>
            <td>{i + 1}</td>
            <td>{p.label}</td>
            <td>{p.wins}</td>
            <td>{p.losses}</td>
            <td>{played(p)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function RRMatchCard({ match, participants, onWinner }: {
  match: RRMatch;
  participants: Participant[];
  onWinner: (id: string, winnerId: string) => void;
}) {
  const getName = (pid: string | null) => pid ? (participants.find(p => p.id === pid)?.label ?? pid) : 'Bye';
  if (match.pidB === null) return null; // byes are invisible
  const isDone = match.winnerId !== null;
  return (
    <div className={`${styles.match} ${isDone ? styles.matchDone : ''}`}>
      {([match.pidA, match.pidB] as string[]).map((pid, i) => {
        const isWinner = match.winnerId === pid;
        return (
          <button key={i}
            className={[styles.matchSlot, isWinner ? styles.matchSlotWinner : ''].filter(Boolean).join(' ')}
            onClick={() => onWinner(match.id, match.winnerId === pid ? '' : pid)}
          >
            <span className={styles.slotName}>{getName(pid)}</span>
            {isWinner && <span className={styles.winnerMark}>✓</span>}
          </button>
        );
      })}
    </div>
  );
}

function RRSwissBracketScreen({ participants, format, tournamentName, teamSize, matches, swissMaxRounds, swissCurrentRound, onWinner, onNextSwissRound, onReset }: {
  participants: Participant[];
  format: 'round-robin' | 'swiss';
  tournamentName: string;
  teamSize: number;
  matches: RRMatch[];
  swissMaxRounds: number;
  swissCurrentRound: number;
  onWinner: (id: string, winnerId: string) => void;
  onNextSwissRound: () => void;
  onReset: () => void;
}) {
  const [viewRound, setViewRound] = useState(0);
  const [activeTab, setActiveTab] = useState<'matches' | 'standings'>('standings');

  useEffect(() => { setViewRound(swissCurrentRound); }, [swissCurrentRound]);

  const generatedCount = Math.max(...matches.map(m => m.round), 0) + 1;
  const totalRounds = format === 'swiss' ? swissMaxRounds : generatedCount;

  const currentRoundComplete = format === 'swiss'
    ? matches.filter(m => m.round === swissCurrentRound && m.pidB !== null).every(m => m.winnerId !== null)
    : false;
  const canGenerateNext = format === 'swiss' && currentRoundComplete && swissCurrentRound < swissMaxRounds - 1;

  const canGoPrev = viewRound > 0;
  const canGoNext = viewRound < generatedCount - 1 || (viewRound === swissCurrentRound && canGenerateNext);

  const handleNext = () => {
    if (viewRound < generatedCount - 1) setViewRound(v => v + 1);
    else if (canGenerateNext) onNextSwissRound();
  };

  const rMatches = matches.filter(m => m.round === viewRound && m.pidB !== null);

  const standings = computeStandings(participants, matches);
  const allDone = matches.filter(m => m.pidB !== null).every(m => m.winnerId !== null);
  const isSwissComplete = format !== 'swiss' || swissCurrentRound >= swissMaxRounds - 1;
  const champion = allDone && isSwissComplete && standings.length > 0 && standings[0].wins > 0 ? participants.find(p => p.id === standings[0].id) : null;

  const modeName = teamSize === 1
    ? (format === 'round-robin' ? 'Round Robin' : `Swiss (${swissMaxRounds} runder)`)
    : (format === 'round-robin' ? `${teamSize}v${teamSize} Round Robin` : `${teamSize}v${teamSize} Swiss`);

  return (
    <div className={styles.bracketPage}>
      <div className={styles.bracketHeader}>
        <div>
          <div className={styles.bracketTitle}>{tournamentName || 'Turnering'} — {modeName}</div>
          <div className={styles.bracketMeta}>{participants.length} {teamSize > 1 ? 'lag' : 'deltakere'}</div>
        </div>
        <button className={styles.resetBtn} onClick={onReset}>← Tilbake</button>
      </div>
      <div className={styles.rrTabBar}>
        <button className={`${styles.rrTabBtn} ${activeTab === 'standings' ? styles.rrTabBtnActive : ''}`} onClick={() => setActiveTab('standings')}>Tabell</button>
        <button className={`${styles.rrTabBtn} ${activeTab === 'matches' ? styles.rrTabBtnActive : ''}`} onClick={() => setActiveTab('matches')}>Kamper</button>
      </div>
      <div className={styles.bracketScroll}>
        <div className={styles.rrLayout}>
          <div className={`${styles.rrStandings} ${activeTab !== 'standings' ? styles.rrHideMobile : ''}`}>
            <div className={styles.bracketSectionLabel}>Tabell</div>
            <StandingsTable participants={participants} matches={matches} />
          </div>
          <div className={`${styles.rrRounds} ${activeTab !== 'matches' ? styles.rrHideMobile : ''}`}>
            <div className={styles.bracketSectionLabel}>Kamper</div>
            <div className={styles.rrNav}>
              <button className={styles.rrNavBtn} onClick={() => setViewRound(v => v - 1)} disabled={!canGoPrev}>&#8592;</button>
              <span className={styles.rrNavLabel}>Runde {viewRound + 1} / {totalRounds}</span>
              <button className={styles.rrNavBtn} onClick={handleNext} disabled={!canGoNext}>&#8594;</button>
            </div>
            <div className={styles.rrMatchCol}>
              {rMatches.map(m => (
                <div key={m.id} className={styles.matchWrap}>
                  <RRMatchCard match={m} participants={participants} onWinner={onWinner} />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
      {champion && (
        <div className={styles.champOverlay} onClick={onReset}>
          <div className={styles.champCard} onClick={e => e.stopPropagation()}>
            <span className={styles.champCrown}>🏆</span>
            <span className={styles.champLabel}>Vinner</span>
            <span className={styles.champName}>{champion.label}</span>
            {champion.members.length > 1 && <span className={styles.champMembers}>{champion.members.join(' & ')}</span>}
            <button className={styles.champBtn} onClick={onReset}>Ny turnering</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Setup screen ──────────────────────────────────────────────────────────────

const STORAGE_KEY = 'tournament_setup';

function loadSaved(): { teamSize: number; perMatch: number; loserBracket: boolean; advancePer: number; revealMode: boolean; participants: Participant[]; tournamentName?: string; format?: FormatType; thirdPlace?: boolean; ffaLoserBracket?: boolean; swissMaxRounds?: number } | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function FormatIcon({ type }: { type: FormatType }) {
  const p: React.SVGProps<SVGSVGElement> = { width: 22, height: 20, viewBox: '0 0 22 20', fill: 'none', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round', strokeLinejoin: 'round' };
  switch (type) {
    case 'single-elim': return (
      <svg {...p}>
        <line x1="1" y1="4" x2="7" y2="4"/><line x1="1" y1="9" x2="7" y2="9"/>
        <line x1="7" y1="4" x2="7" y2="9"/><line x1="7" y1="6.5" x2="13" y2="6.5"/>
        <line x1="1" y1="13" x2="7" y2="13"/><line x1="1" y1="18" x2="7" y2="18"/>
        <line x1="7" y1="13" x2="7" y2="18"/><line x1="7" y1="15.5" x2="13" y2="15.5"/>
        <line x1="13" y1="6.5" x2="13" y2="15.5"/><line x1="13" y1="11" x2="21" y2="11"/>
      </svg>
    );
    case 'double-elim': return (
      <svg {...p}>
        {/* Left fork */}
        <line x1="1" y1="4" x2="6" y2="4"/><line x1="1" y1="10" x2="6" y2="10"/>
        <line x1="6" y1="4" x2="6" y2="10"/><line x1="6" y1="7" x2="10" y2="7"/>
        {/* Right fork */}
        <line x1="12" y1="4" x2="17" y2="4"/><line x1="12" y1="10" x2="17" y2="10"/>
        <line x1="17" y1="4" x2="17" y2="10"/><line x1="17" y1="7" x2="21" y2="7"/>
      </svg>
    );
    case 'ffa': return (
      <svg {...p}>
        <line x1="1" y1="3" x2="8" y2="3"/><line x1="1" y1="8" x2="8" y2="8"/>
        <line x1="1" y1="13" x2="8" y2="13"/><line x1="1" y1="18" x2="8" y2="18"/>
        <line x1="8" y1="3" x2="8" y2="18"/><line x1="8" y1="10.5" x2="21" y2="10.5"/>
      </svg>
    );
    case 'round-robin': return (
      <svg {...p}>
        <circle cx="3.5" cy="3.5" r="2" fill="currentColor" stroke="none"/>
        <circle cx="18.5" cy="3.5" r="2" fill="currentColor" stroke="none"/>
        <circle cx="3.5" cy="16.5" r="2" fill="currentColor" stroke="none"/>
        <circle cx="18.5" cy="16.5" r="2" fill="currentColor" stroke="none"/>
        <line x1="3.5" y1="3.5" x2="18.5" y2="3.5"/>
        <line x1="3.5" y1="16.5" x2="18.5" y2="16.5"/>
        <line x1="3.5" y1="3.5" x2="3.5" y2="16.5"/>
        <line x1="18.5" y1="3.5" x2="18.5" y2="16.5"/>
        <line x1="3.5" y1="3.5" x2="18.5" y2="16.5"/>
        <line x1="18.5" y1="3.5" x2="3.5" y2="16.5"/>
      </svg>
    );
    case 'swiss': return (
      <svg {...p}>
        <rect x="1" y="2" width="20" height="16" rx="1.5"/>
        <line x1="1" y1="8" x2="21" y2="8"/>
        <line x1="1" y1="14" x2="21" y2="14"/>
        <line x1="9" y1="2" x2="9" y2="18"/>
      </svg>
    );
  }
}

const FORMAT_CARDS: { key: FormatType; label: string }[] = [
  { key: 'single-elim', label: 'Enkel' },
  { key: 'double-elim', label: 'Dobbel' },
  { key: 'ffa',         label: 'FFA' },
  { key: 'round-robin', label: 'Round Robin' },
  { key: 'swiss',       label: 'Swiss' },
];

function SetupScreen({ onGenerate }: { onGenerate: (participants: Participant[], teamSize: number, format: FormatType, perMatch: number, advancePer: number, ffaLoserBracket: boolean, revealMode: boolean, tournamentName: string, thirdPlace: boolean, swissMaxRounds: number) => void }) {
  const saved = loadSaved();
  const [format, setFormat] = useState<FormatType>(saved?.format ?? 'single-elim');
  const [teamSize, setTeamSize] = useState(saved?.teamSize ?? 1);
  const [perMatch, setPerMatch] = useState(saved?.perMatch ?? 4);
  const [ffaLoserBracket, setFfaLoserBracket] = useState(saved?.ffaLoserBracket ?? true);
  const [advancePer, setAdvancePer] = useState<number>(saved?.advancePer ?? 1);
  const [thirdPlace, setThirdPlace] = useState(saved?.thirdPlace ?? false);
  const [swissMaxRounds, setSwissMaxRounds] = useState(saved?.swissMaxRounds ?? 4);
  const [revealMode, setRevealMode] = useState(saved?.revealMode ?? false);
  const [tournamentName, setTournamentName] = useState(saved?.tournamentName ?? '');
  const [name, setName] = useState('');
  const [participants, setParticipants] = useState<Participant[]>(saved?.participants ?? []);
  const inputId = useId();

  // Raw string values for number inputs so the user can clear and retype freely
  const [teamSizeStr, setTeamSizeStr] = useState(String(saved?.teamSize ?? 1));
  const [perMatchStr, setPerMatchStr] = useState(String(saved?.perMatch ?? 4));
  const [advancePerStr, setAdvancePerStr] = useState(String(saved?.advancePer ?? 1));
  const [swissRoundsStr, setSwissRoundsStr] = useState(String(saved?.swissMaxRounds ?? 4));

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ format, teamSize, perMatch, ffaLoserBracket, advancePer, thirdPlace, swissMaxRounds, revealMode, participants, tournamentName }));
    } catch { /* ignore */ }
  }, [format, teamSize, perMatch, ffaLoserBracket, advancePer, thirdPlace, swissMaxRounds, revealMode, participants, tournamentName]);

  const ffaLBAvailable = perMatch > 2 && (perMatch - advancePer) >= 2;

  const canGenerate = format === 'round-robin' || format === 'swiss'
    ? participants.length >= 2
    : format === 'single-elim' || format === 'double-elim'
      ? participants.length >= 2
      : participants.length >= perMatch + 1;

  const resetToGuttan = useCallback(() => {
    if (teamSize === 1) {
      setParticipants(GUTTAN.map(n => ({ id: genId(), label: n, members: [n] })));
    } else {
      const teams: Participant[] = [];
      for (let i = 0; i < GUTTAN.length; i += teamSize) {
        const group = GUTTAN.slice(i, i + teamSize);
        const filled = [...group];
        while (filled.length < teamSize) filled.push('');
        const label = group.length === 2 ? `${group[0]} & ${group[1]}` : group[0] + (group.length > 1 ? ` +${group.length - 1}` : '');
        teams.push({ id: genId(), label, members: filled });
      }
      setParticipants(teams);
    }
  }, [teamSize]);

  const addParticipant = useCallback(() => {
    const n = name.trim();
    if (!n) return;
    setParticipants(prev => [
      ...prev,
      teamSize === 1
        ? { id: genId(), label: n, members: [n] }
        : { id: genId(), label: n, members: Array(teamSize).fill('') },
    ]);
    setName('');
  }, [name, teamSize]);

  const addTeam = useCallback(() => {
    setParticipants(prev => [...prev, { id: genId(), label: `Lag ${prev.length + 1}`, members: Array(teamSize).fill('') }]);
  }, [teamSize]);

  const updateMember = (pid: string, idx: number, value: string) =>
    setParticipants(prev => prev.map(p => {
      if (p.id !== pid) return p;
      const members = [...p.members];
      members[idx] = value;
      return { ...p, members };
    }));

  const updateLabel = (pid: string, value: string) =>
    setParticipants(prev => prev.map(p => p.id === pid ? { ...p, label: value } : p));

  const remove = (pid: string) =>
    setParticipants(prev => prev.filter(p => p.id !== pid));

  const handleTeamSizeChange = (val: number) => {
    const names = flattenToNames(participants);
    setTeamSize(val);
    setParticipants(names.length > 0 ? buildFromNames(names, val) : []);
  };

  const randomize = useCallback(() => {
    const names = flattenToNames(participants);
    if (names.length === 0) return;
    setParticipants(buildFromNames(shuffle(names), teamSize));
  }, [participants, teamSize]);

  return (
    <div className={styles.setup}>
      <div className={styles.setupTitleRow}>
        <h1 className={styles.setupTitle}>Turnering</h1>
        <div className={styles.setupTitleActions}>
          {participants.length >= 2 && (
            <button className={styles.guttanBtn} onClick={randomize}>Randomiser</button>
          )}
          {participants.length > 0 && (
            <button className={styles.guttanBtn} onClick={() => setParticipants([])}>Tøm alle</button>
          )}
          <button className={styles.guttanBtn} onClick={resetToGuttan}>
            <img src="/logo.png" alt="" className={styles.guttanLogo} />
            <span className={styles.guttanBtnText}>Reset til Guttan</span>
          </button>
        </div>
      </div>

      <div className={styles.setupBody}>
        {/* Left — settings */}
        <div className={styles.setupLeft}>
          {/* Format cards */}
          <div className={styles.section}>
            <span className={styles.sectionLabel}>Format</span>
            <div className={styles.modeGrid}>
              {FORMAT_CARDS.map(f => (
                <button key={f.key} type="button"
                  className={`${styles.modeCard} ${format === f.key ? styles.modeCardActive : ''}`}
                  onClick={() => setFormat(f.key)}>
                  <span className={styles.modeCardIcon}><FormatIcon type={f.key} /></span>
                  <span className={styles.modeCardLabel}>{f.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Tournament name */}
          <div className={styles.section}>
            <span className={styles.sectionLabel}>Turneringsnavn</span>
            <input type="text" value={tournamentName} onChange={e => setTournamentName(e.target.value)}
              placeholder="Navn på turneringen..." className={styles.nameInput} />
          </div>

          {/* Number inputs — all side by side */}
          <div className={styles.inputsRow}>
            <div className={styles.inputGroup}>
              <span className={styles.sectionLabel}>Per lag</span>
              <input type="number" min={1} max={4} value={teamSizeStr} className={styles.numInput}
                onChange={e => setTeamSizeStr(e.target.value)}
                onBlur={() => {
                  const n = Math.min(4, Math.max(1, Number(teamSizeStr) || 1));
                  handleTeamSizeChange(n);
                  setTeamSizeStr(String(n));
                }} />
              <span className={styles.numHint}>{teamSize === 1 ? 'Solo' : `${teamSize}v${teamSize}`}</span>
            </div>
            {format === 'ffa' && (
              <div className={styles.inputGroup}>
                <span className={styles.sectionLabel}>Per kamp</span>
                <input type="number" min={2} max={8} value={perMatchStr} className={styles.numInput}
                  onChange={e => setPerMatchStr(e.target.value)}
                  onBlur={() => {
                    const pm = Math.min(8, Math.max(2, Number(perMatchStr) || 2));
                    setPerMatch(pm);
                    setPerMatchStr(String(pm));
                    const ap = Math.min(pm - 1, Math.max(1, advancePer));
                    setAdvancePer(ap);
                    setAdvancePerStr(String(ap));
                  }} />
                <span className={styles.numHint}>{perMatch === 2 ? 'Duell' : `${perMatch}-kamp`}</span>
              </div>
            )}
            {format === 'ffa' && (
              <div className={styles.inputGroup}>
                <span className={styles.sectionLabel}>Avanserer</span>
                <input type="number" min={1} max={perMatch - 1} value={advancePerStr} className={styles.numInput}
                  onChange={e => setAdvancePerStr(e.target.value)}
                  onBlur={() => {
                    const ap = Math.min(perMatch - 1, Math.max(1, Number(advancePerStr) || 1));
                    setAdvancePer(ap);
                    setAdvancePerStr(String(ap));
                  }} />
                <span className={styles.numHint}>av {perMatch}</span>
              </div>
            )}
            {format === 'swiss' && (
              <div className={styles.inputGroup}>
                <span className={styles.sectionLabel}>Runder</span>
                <input type="number" min={1} max={20} value={swissRoundsStr} className={styles.numInput}
                  onChange={e => setSwissRoundsStr(e.target.value)}
                  onBlur={() => {
                    const n = Math.min(20, Math.max(1, Number(swissRoundsStr) || 1));
                    setSwissMaxRounds(n);
                    setSwissRoundsStr(String(n));
                  }} />
                <span className={styles.numHint}>maks</span>
              </div>
            )}
          </div>

          {/* Toggles — always below the number inputs */}
          <div className={styles.section}>
            {format === 'ffa' && (
              <label className={styles.toggleRow}>
                <button type="button"
                  className={`${styles.toggle} ${ffaLoserBracket && ffaLBAvailable ? styles.toggleOn : ''}`}
                  onClick={() => setFfaLoserBracket(v => !v)}
                  disabled={!ffaLBAvailable}
                  style={{ opacity: !ffaLBAvailable ? 0.4 : 1 }}>
                  <span className={styles.toggleKnob} />
                </button>
                <span className={styles.toggleLabel}>
                  Taperbrakett{!ffaLBAvailable ? ' (trenger ≥2 tapere)' : ''}
                </span>
              </label>
            )}
            {format === 'single-elim' && (
              <label className={styles.toggleRow}>
                <button type="button" className={`${styles.toggle} ${thirdPlace ? styles.toggleOn : ''}`} onClick={() => setThirdPlace(v => !v)}>
                  <span className={styles.toggleKnob} />
                </button>
                <span className={styles.toggleLabel}>Bronsekamp (3. plass)</span>
              </label>
            )}
            <label className={styles.toggleRow}>
              <button type="button" className={`${styles.toggle} ${revealMode ? styles.toggleOn : ''}`} onClick={() => setRevealMode(v => !v)}>
                <span className={styles.toggleKnob} />
              </button>
              <span className={styles.toggleLabel}>Reveal-modus</span>
            </label>
          </div>
        </div>

        {/* Right — participants */}
        <div className={styles.setupRight}>
          {teamSize === 1 ? (
            <>
              <label htmlFor={inputId} className={styles.sectionLabel}>Deltakere ({participants.length})</label>
              <div className={styles.addRow}>
                <input id={inputId} value={name} onChange={e => setName(e.target.value)} onKeyDown={e => e.key === 'Enter' && addParticipant()} placeholder="Navn..." />
                <button className={styles.addBtn} onClick={addParticipant} disabled={!name.trim()}>Legg til</button>
              </div>
              <div className={styles.playerList}>
                <div className={styles.chipList}>
                  {participants.map(p => (
                    <span key={p.id} className={styles.chip}>
                      {p.label}
                      <button className={styles.chipRemove} onClick={() => remove(p.id)}>×</button>
                    </span>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <>
              <span className={styles.sectionLabel}>Lag ({participants.length})</span>
              <div className={styles.playerList}>
                <div className={styles.teamList}>
                  {participants.map(t => (
                    <div key={t.id} className={styles.teamCard}>
                      <div className={styles.teamCardHeader}>
                        <input value={t.label} onChange={e => updateLabel(t.id, e.target.value)} placeholder="Lagnavn" />
                        <button className={styles.removeBtn} onClick={() => remove(t.id)}>×</button>
                      </div>
                      <div className={styles.teamMembers}>
                        {t.members.map((m, i) => (
                          <input key={i} value={m} onChange={e => updateMember(t.id, i, e.target.value)} placeholder={`Spiller ${i + 1}`} />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <button className={styles.addBtn} onClick={addTeam}>+ Legg til lag</button>
            </>
          )}
        </div>
      </div>

      {/* Footer — always visible, outside the scrollable body */}
      <div className={styles.setupFooter}>
        <button className={styles.generateBtn} disabled={!canGenerate}
          onClick={() => onGenerate(participants, teamSize, format, perMatch, advancePer, ffaLoserBracket, revealMode, tournamentName, thirdPlace, swissMaxRounds)}>
          Generer bracket →
        </button>
      </div>
    </div>
  );
}

// ── Bracket screen ────────────────────────────────────────────────────────────

function BracketScreen({ participants, teamSize, perMatch, revealMode, tournamentName, thirdPlace, matches: initMatches, onReset }: {
  participants: Participant[];
  teamSize: number;
  perMatch: number;
  revealMode: boolean;
  tournamentName: string;
  thirdPlace: boolean;
  matches: BMatch[];
  onReset: () => void;
}) {
  const [matches, setMatches] = useState(initMatches);
  const [revealed, setRevealed] = useState<Set<string>>(() => new Set());

  const handleWinner = useCallback((matchId: string, pid: string) => {
    setMatches(prev => applyWinner(prev, matchId, pid));
  }, []);

  const handleReveal = useCallback((pid: string) => {
    setRevealed(prev => new Set([...prev, pid]));
  }, []);

  const isDoubleElim = matches.some(m => m.bracket === 'L' || m.bracket === 'GF');

  const wbMatches = matches.filter(m => m.bracket === 'W' && !m.ghost);
  const lbMatches = matches.filter(m => m.bracket === 'L' && !m.ghost);
  const gfMatches = matches.filter(m => m.bracket === 'GF');
  const tpMatch = matches.find(m => m.bracket === '3P');
  const thirdPlaceWinner = tpMatch?.winners[0] ? participants.find(p => p.id === tpMatch.winners[0]) : null;

  const wbRounds = groupByRound(wbMatches);
  const lbRounds = groupByRound(lbMatches);

  const gfrMatch = matches.find(m => m.bracket === 'GFR' && !m.ghost);

  let gfWinnerId: string | null = null;
  if (gfrMatch) {
    gfWinnerId = gfrMatch.winners[0] ?? null;
  } else if (gfMatches.length > 0) {
    gfWinnerId = gfMatches[0].winners[0] ?? null;
  } else if (!isDoubleElim && wbRounds.length > 0) {
    gfWinnerId = wbRounds[wbRounds.length - 1].find(m => m.winners.length >= m.advancePer)?.winners[0] ?? null;
  }

  const champion = gfWinnerId ? participants.find(p => p.id === gfWinnerId) : null;

  const modeName = teamSize === 1
    ? (perMatch === 2 ? '1v1' : `FFA (${perMatch} per kamp)`)
    : (perMatch === 2 ? `${teamSize}v${teamSize}` : `Lag-FFA`);

  return (
    <div className={styles.bracketPage}>
      <div className={styles.bracketHeader}>
        <div>
          <div className={styles.bracketTitle}>{tournamentName || 'Turnering'} — {modeName}</div>
          <div className={styles.bracketMeta}>{participants.length} {teamSize > 1 ? 'lag' : 'deltakere'} · {isDoubleElim ? 'Dobbel eliminasjon' : 'Enkel eliminasjon'}</div>
        </div>
        <button className={styles.resetBtn} onClick={onReset}>← Tilbake</button>
      </div>

      <div className={styles.bracketScroll}>
      <div className={styles.bracketInner}>

        {/* Winner bracket — GF and GFR appear as extra columns to the right */}
        <div className={`${styles.bracketSection} ${isDoubleElim && lbRounds.length > 0 ? styles.wbSection : ''}`}>
          {isDoubleElim && <div className={styles.bracketSectionLabel}>Vinner-bracket</div>}
          <div className={styles.roundHeader}>
            {wbRounds.map((_, i) => (
              <div key={i} className={styles.roundHeaderCell}>
                {!isDoubleElim && i === wbRounds.length - 1 && !thirdPlace ? 'Finale' : `Runde ${i + 1}`}
              </div>
            ))}
            {gfMatches.length > 0 && <div className={styles.roundHeaderCell}>Grand Final</div>}
            {gfrMatch && <div className={styles.roundHeaderCell}>Reset</div>}
          </div>
          <div className={styles.bracketRounds}>
            {wbRounds.map((round, i) => (
              <RoundCol key={i} matches={round} participants={participants} onWinner={handleWinner} revealMode={revealMode} revealed={revealed} onReveal={handleReveal} />
            ))}
            {gfMatches.length > 0 && (
              <RoundCol matches={gfMatches} participants={participants} onWinner={handleWinner} revealMode={revealMode} revealed={revealed} onReveal={handleReveal} />
            )}
            {gfrMatch && (
              <RoundCol matches={[gfrMatch]} participants={participants} onWinner={handleWinner} revealMode={revealMode} revealed={revealed} onReveal={handleReveal} />
            )}
          </div>
        </div>

        {/* Loser bracket — below WB, separated by a line */}
        {isDoubleElim && lbRounds.length > 0 && (
          <div className={`${styles.bracketSection} ${styles.lbSection}`}>
            <div className={styles.bracketSectionLabel}>Taper-bracket</div>
            <div className={styles.roundHeader}>
              {lbRounds.map((_, i) => <div key={i} className={styles.roundHeaderCell}>L-Runde {i + 1}</div>)}
            </div>
            <div className={styles.bracketRounds}>
              {lbRounds.map((round, i) => (
                <RoundCol key={i} matches={round} participants={participants} onWinner={handleWinner} revealMode={revealMode} revealed={revealed} onReveal={handleReveal} />
              ))}
            </div>
          </div>
        )}

        {/* 3rd place match */}
        {thirdPlace && tpMatch && (
          <div className={`${styles.bracketSection} ${styles.lbSection}`}>
            <div className={styles.bracketSectionLabel}>3. plass</div>
            <div className={styles.bracketRounds}>
              <RoundCol matches={[tpMatch]} participants={participants} onWinner={handleWinner} revealMode={revealMode} revealed={revealed} onReveal={handleReveal} />
            </div>
          </div>
        )}

        {/* Champion popup */}
        {champion && (
          <div className={styles.champOverlay} onClick={onReset}>
            <div className={styles.champCard} onClick={e => e.stopPropagation()}>
              <span className={styles.champCrown}>🏆</span>
              <span className={styles.champLabel}>Vinner</span>
              <span className={styles.champName}>{champion.label}</span>
              {champion.members.length > 1 && (
                <span className={styles.champMembers}>{champion.members.join(' & ')}</span>
              )}
              {thirdPlaceWinner && (
                <span className={styles.champMembers} style={{ marginTop: 8, fontSize: 13 }}>🥉 3. plass: {thirdPlaceWinner.label}</span>
              )}
              <button className={styles.champBtn} onClick={onReset}>Ny turnering</button>
            </div>
          </div>
        )}
      </div>
      </div>
    </div>
  );
}

function groupByRound(matches: BMatch[]): BMatch[][] {
  if (!matches.length) return [];
  const max = Math.max(...matches.map(m => m.round));
  return Array.from({ length: max + 1 }, (_, r) =>
    matches.filter(m => m.round === r).sort((a, b) => a.idx - b.idx)
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export function TournamentPage() {
  const [state, setState] = useState<
    | { phase: 'setup' }
    | {
        phase: 'bracket';
        format: FormatType;
        participants: Participant[];
        teamSize: number;
        perMatch: number;
        advancePer: number;
        revealMode: boolean;
        tournamentName: string;
        thirdPlace: boolean;
        matches: BMatch[];
        rrMatches: RRMatch[];
        swissMaxRounds: number;
        swissCurrentRound: number;
      }
  >({ phase: 'setup' });

  const handleGenerate = useCallback((
    participants: Participant[], teamSize: number, format: FormatType,
    perMatch: number, advancePer: number, ffaLoserBracket: boolean,
    revealMode: boolean, tournamentName: string, thirdPlace: boolean, swissMaxRounds: number
  ) => {
    let matches: BMatch[] = [];
    let rrMatches: RRMatch[] = [];
    if (format === 'round-robin') {
      rrMatches = buildRoundRobin(participants);
    } else if (format === 'swiss') {
      rrMatches = buildSwissRound(participants, [], 0);
    } else if (format === 'double-elim') {
      matches = buildDoubleElim(participants);
    } else if (format === 'ffa') {
      matches = ffaLoserBracket && (perMatch - advancePer) >= 2
        ? buildFfaWithLB(participants, perMatch, advancePer)
        : buildSingleElim(participants, perMatch, advancePer);
    } else {
      matches = buildSingleElim(participants, 2, 1, thirdPlace);
    }
    setState({ phase: 'bracket', format, participants, teamSize, perMatch, advancePer, revealMode, tournamentName, thirdPlace, matches, rrMatches, swissMaxRounds, swissCurrentRound: 0 });
  }, []);

  const handleNextSwissRound = useCallback(() => {
    setState(prev => {
      if (prev.phase !== 'bracket' || prev.format !== 'swiss') return prev;
      const next = prev.swissCurrentRound + 1;
      const newMatches = buildSwissRound(prev.participants, prev.rrMatches, next);
      return { ...prev, swissCurrentRound: next, rrMatches: [...prev.rrMatches, ...newMatches] };
    });
  }, []);

  const handleRRWinner = useCallback((matchId: string, winnerId: string) => {
    setState(prev => {
      if (prev.phase !== 'bracket') return prev;
      return { ...prev, rrMatches: prev.rrMatches.map(m => m.id === matchId ? { ...m, winnerId: winnerId || null } : m) };
    });
  }, []);

  const handleReset = useCallback(() => setState({ phase: 'setup' }), []);

  return (
    <AppLayout>
      <div className={styles.page}>
        {state.phase === 'setup' && (
          <div className={styles.setupWrapper}>
            <SetupScreen onGenerate={handleGenerate} />
          </div>
        )}
        {state.phase === 'bracket' && (state.format === 'round-robin' || state.format === 'swiss') && (
          <RRSwissBracketScreen
            participants={state.participants}
            format={state.format}
            tournamentName={state.tournamentName}
            teamSize={state.teamSize}
            matches={state.rrMatches}
            swissMaxRounds={state.swissMaxRounds}
            swissCurrentRound={state.swissCurrentRound}
            onWinner={handleRRWinner}
            onNextSwissRound={handleNextSwissRound}
            onReset={handleReset}
          />
        )}
        {state.phase === 'bracket' && state.format !== 'round-robin' && state.format !== 'swiss' && (
          <BracketScreen
            participants={state.participants}
            teamSize={state.teamSize}
            perMatch={state.perMatch}
            revealMode={state.revealMode}
            tournamentName={state.tournamentName}
            thirdPlace={state.thirdPlace}
            matches={state.matches}
            onReset={handleReset}
          />
        )}
      </div>
    </AppLayout>
  );
}
