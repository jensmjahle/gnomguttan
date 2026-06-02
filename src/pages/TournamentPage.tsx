import { useState, useCallback, useEffect, useId } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import styles from './TournamentPage.module.css';

// ── Types ─────────────────────────────────────────────────────────────────────

interface Participant {
  id: string;
  label: string;
  members: string[]; // length 2 for 2v2, length 1 otherwise
}

interface Slot {
  pid: string | null;
  isBye: boolean;
}

interface BMatch {
  id: string;
  bracket: 'W' | 'L' | 'GF';
  round: number;
  idx: number;
  slots: Slot[];
  winners: string[];
  advancePer: number;
  winTo: string | null;
  winSlot: number;
  loseTo: string | null;
  loseSlot: number;
}

// ── Utils ─────────────────────────────────────────────────────────────────────

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function nextPow2(n: number) {
  let p = 1;
  while (p < n) p *= 2;
  return p;
}

function gm(list: BMatch[], id: string) {
  return list.find(m => m.id === id)!;
}

// ── Bracket generators ────────────────────────────────────────────────────────

function buildDoubleElim(participants: Participant[]): BMatch[] {
  const n = nextPow2(participants.length);
  const pids = shuffle(participants).map(p => p.id);
  while (pids.length < n) pids.push(`__bye${pids.length}`);

  const isBye = (id: string) => id.startsWith('__bye');
  const ms: BMatch[] = [];
  let mc = 0;
  const mk = () => `m${mc++}`;
  const sl = (pid: string): Slot => ({ pid, isBye: isBye(pid) });
  const tbd = (): Slot => ({ pid: null, isBye: false });

  const k = Math.log2(n);
  if (k < 1) return [];

  if (k === 1) {
    ms.push({ id: mk(), bracket: 'GF', round: 0, idx: 0, slots: [sl(pids[0]), sl(pids[1])], winners: [], advancePer: 1, winTo: null, winSlot: 0, loseTo: null, loseSlot: 0 });
    return ms;
  }

  const wb: string[][] = [];

  // WB R0
  const r0: string[] = [];
  for (let i = 0; i < n; i += 2) {
    const id = mk();
    const m: BMatch = { id, bracket: 'W', round: 0, idx: i / 2, slots: [sl(pids[i]), sl(pids[i + 1])], winners: [], advancePer: 1, winTo: null, winSlot: 0, loseTo: null, loseSlot: 0 };
    if (isBye(pids[i]) && !isBye(pids[i + 1])) m.winners = [pids[i + 1]];
    if (isBye(pids[i + 1]) && !isBye(pids[i])) m.winners = [pids[i]];
    ms.push(m);
    r0.push(id);
  }
  wb.push(r0);

  for (let r = 1; r < k; r++) {
    const prev = wb[r - 1];
    const curr: string[] = [];
    for (let i = 0; i < prev.length; i += 2) {
      const id = mk();
      ms.push({ id, bracket: 'W', round: r, idx: i / 2, slots: [tbd(), tbd()], winners: [], advancePer: 1, winTo: null, winSlot: 0, loseTo: null, loseSlot: 0 });
      curr.push(id);
      gm(ms, prev[i]).winTo = id; gm(ms, prev[i]).winSlot = 0;
      gm(ms, prev[i + 1]).winTo = id; gm(ms, prev[i + 1]).winSlot = 1;
    }
    wb.push(curr);
  }

  // LB
  const lb: string[][] = [];
  const l0: string[] = [];
  for (let i = 0; i < wb[0].length; i += 2) {
    const id = mk();
    ms.push({ id, bracket: 'L', round: 0, idx: i / 2, slots: [tbd(), tbd()], winners: [], advancePer: 1, winTo: null, winSlot: 0, loseTo: null, loseSlot: 0 });
    l0.push(id);
    gm(ms, wb[0][i]).loseTo = id; gm(ms, wb[0][i]).loseSlot = 0;
    gm(ms, wb[0][i + 1]).loseTo = id; gm(ms, wb[0][i + 1]).loseSlot = 1;
  }
  lb.push(l0);

  let wbF = 1;
  for (let lr = 1; lr < 2 * (k - 1); lr++) {
    const prev = lb[lr - 1];
    const curr: string[] = [];
    const isFeed = lr % 2 === 1;
    if (isFeed) {
      const wbl = wb[wbF++];
      for (let i = 0; i < prev.length; i++) {
        const id = mk();
        ms.push({ id, bracket: 'L', round: lr, idx: i, slots: [tbd(), tbd()], winners: [], advancePer: 1, winTo: null, winSlot: 0, loseTo: null, loseSlot: 0 });
        curr.push(id);
        gm(ms, prev[i]).winTo = id; gm(ms, prev[i]).winSlot = 0;
        if (wbl[i]) { gm(ms, wbl[i]).loseTo = id; gm(ms, wbl[i]).loseSlot = 1; }
      }
    } else {
      for (let i = 0; i < prev.length; i += 2) {
        const id = mk();
        ms.push({ id, bracket: 'L', round: lr, idx: i / 2, slots: [tbd(), tbd()], winners: [], advancePer: 1, winTo: null, winSlot: 0, loseTo: null, loseSlot: 0 });
        curr.push(id);
        gm(ms, prev[i]).winTo = id; gm(ms, prev[i]).winSlot = 0;
        gm(ms, prev[i + 1]).winTo = id; gm(ms, prev[i + 1]).winSlot = 1;
      }
    }
    lb.push(curr);
  }

  const gfId = mk();
  ms.push({ id: gfId, bracket: 'GF', round: 0, idx: 0, slots: [tbd(), tbd()], winners: [], advancePer: 1, winTo: null, winSlot: 0, loseTo: null, loseSlot: 0 });
  gm(ms, wb[k - 1][0]).winTo = gfId; gm(ms, wb[k - 1][0]).winSlot = 0;
  gm(ms, lb[lb.length - 1][0]).winTo = gfId; gm(ms, lb[lb.length - 1][0]).winSlot = 1;

  return ms;
}

function buildSingleElim(participants: Participant[], ppm: number, adv = 1): BMatch[] {
  const ms: BMatch[] = [];
  let mc = 0;
  const mk = () => `m${mc++}`;
  const tbd = (): Slot => ({ pid: null, isBye: false });

  let current = shuffle(participants).map(p => p.id);
  let round = 0;
  const roundIds: string[][] = [];

  while (current.length > 1) {
    const rIds: string[] = [];
    const next: string[] = [];
    for (let i = 0; i < current.length; i += ppm) {
      const group = current.slice(i, i + ppm);
      const id = mk();
      ms.push({ id, bracket: 'W', round, idx: i / ppm, slots: group.map(pid => ({ pid, isBye: false })), winners: [], advancePer: adv, winTo: null, winSlot: 0, loseTo: null, loseSlot: 0 });
      rIds.push(id);
      next.push(`tbd_${id}`);
    }
    roundIds.push(rIds);
    current = next;
    round++;
  }

  // Link rounds
  for (let r = 0; r < roundIds.length - 1; r++) {
    for (let i = 0; i < roundIds[r].length; i++) {
      const nextMatchIdx = Math.floor(i / ppm);
      const nextSlot = i % ppm;
      if (roundIds[r + 1][nextMatchIdx]) {
        const nm = gm(ms, roundIds[r + 1][nextMatchIdx]);
        if (nm.slots.length <= nextSlot) nm.slots.push(tbd());
        else nm.slots[nextSlot] = tbd();
        gm(ms, roundIds[r][i]).winTo = roundIds[r + 1][nextMatchIdx];
        gm(ms, roundIds[r][i]).winSlot = nextSlot;
      }
    }
    // Fix next round slot counts
    for (const id of roundIds[r + 1]) {
      const feeders = ms.filter(m => m.winTo === id);
      gm(ms, id).slots = feeders.map(() => tbd());
    }
  }

  return ms;
}

// ── Winner propagation ────────────────────────────────────────────────────────

function clearDown(ms: BMatch[], matchId: string): BMatch[] {
  const m = ms.find(x => x.id === matchId);
  if (!m || m.winners.length === 0) return ms;
  let result = ms;
  if (m.winTo) {
    result = result.map(x => x.id === m.winTo
      ? { ...x, slots: x.slots.map((s, i) => i >= m.winSlot && i < m.winSlot + m.winners.length ? { pid: null, isBye: false } : { ...s }), winners: [] }
      : x);
    result = clearDown(result, m.winTo);
  }
  if (m.loseTo) {
    result = result.map(x => x.id === m.loseTo
      ? { ...x, slots: x.slots.map((s, i) => i === m.loseSlot ? { pid: null, isBye: false } : { ...s }), winners: [] }
      : x);
    result = clearDown(result, m.loseTo);
  }
  return result;
}

function applyWinner(ms: BMatch[], matchId: string, pid: string): BMatch[] {
  const m = ms.find(x => x.id === matchId)!;
  const alreadyWinner = m.winners.includes(pid);

  if (alreadyWinner) {
    // Deselect: remove this winner and clear downstream from its slot
    const idx = m.winners.indexOf(pid);
    let result = ms;
    if (m.winTo) {
      const slot = m.winSlot + idx;
      result = result.map(x => x.id === m.winTo
        ? { ...x, slots: x.slots.map((s, i) => i === slot ? { pid: null, isBye: false } : { ...s }), winners: [] }
        : x);
      result = clearDown(result, m.winTo);
    }
    result = result.map(x => x.id === matchId ? { ...x, winners: x.winners.filter(w => w !== pid) } : x);
    return result;
  }

  if (m.winners.length >= m.advancePer) return ms; // already at capacity

  const idx = m.winners.length;
  let result = ms.map(x => x.id === matchId ? { ...x, winners: [...x.winners, pid] } : x);

  if (m.winTo) {
    result = result.map(x => x.id === m.winTo
      ? { ...x, slots: x.slots.map((s, i) => i === m.winSlot + idx ? { pid, isBye: false } : { ...s }) }
      : x);
  }

  // Loser bracket: propagate the single non-winner once all WB winners are chosen
  const updated = result.find(x => x.id === matchId)!;
  if (updated.loseTo && updated.winners.length === updated.advancePer && updated.advancePer === 1) {
    const loser = updated.slots.find(s => s.pid && !updated.winners.includes(s.pid) && !s.isBye)?.pid ?? null;
    if (loser) {
      result = result.map(x => x.id === updated.loseTo
        ? { ...x, slots: x.slots.map((s, i) => i === updated.loseSlot ? { pid: loser, isBye: false } : { ...s }) }
        : x);
    }
  }

  return result;
}

// ── Match card ────────────────────────────────────────────────────────────────

function MatchCard({ match, participants, onWinner }: {
  match: BMatch;
  participants: Participant[];
  onWinner: (matchId: string, pid: string) => void;
}) {
  const getName = (pid: string | null) => {
    if (!pid) return 'TBD';
    if (pid.startsWith('__bye')) return 'Bye';
    return participants.find(p => p.id === pid)?.label ?? pid;
  };

  const filledNonBye = match.slots.filter(s => s.pid && !s.isBye).length;
  const canPick = filledNonBye >= 2;
  const isDone = match.winners.length >= match.advancePer;

  return (
    <div className={`${styles.match} ${isDone ? styles.matchDone : ''}`}>
      {match.slots.map((slot, i) => {
        const isWinner = slot.pid !== null && match.winners.includes(slot.pid);
        const isTbd = slot.pid === null;
        const isBye = slot.isBye;
        const atCapacity = match.winners.length >= match.advancePer;
        const disabled = !canPick || isTbd || isBye || (!isWinner && atCapacity);

        return (
          <button
            key={i}
            className={[
              styles.matchSlot,
              isWinner ? styles.matchSlotWinner : '',
              isBye ? styles.matchSlotBye : '',
              isTbd ? styles.matchSlotTbd : '',
            ].filter(Boolean).join(' ')}
            onClick={() => !disabled && slot.pid && onWinner(match.id, slot.pid)}
            disabled={disabled}
            title={disabled ? undefined : `Set ${getName(slot.pid)} as winner`}
          >
            <span className={styles.slotName}>{getName(slot.pid)}</span>
            {isWinner && <span className={styles.winnerMark}>✓</span>}
          </button>
        );
      })}
    </div>
  );
}

// ── Round column ──────────────────────────────────────────────────────────────

function RoundCol({ matches, participants, onWinner }: {
  matches: BMatch[];
  participants: Participant[];
  onWinner: (matchId: string, pid: string) => void;
}) {
  return (
    <div className={styles.round}>
      {matches.map(m => (
        <div key={m.id} className={styles.matchWrap}>
          <MatchCard match={m} participants={participants} onWinner={onWinner} />
        </div>
      ))}
    </div>
  );
}

// ── Constants ─────────────────────────────────────────────────────────────────

const GUTTAN = ['Ari', 'Emil', 'Heine', 'Jens', 'Joachim', 'Magnus', 'Martin', 'Mikkel', 'Sondre', 'Torbjørn'];

let _uid = 0;
const genId = () => `p${++_uid}`;

function flattenToNames(participants: Participant[]): string[] {
  return participants.flatMap(p => p.members.filter(m => m.trim()));
}

function buildFromNames(names: string[], teamSize: number): Participant[] {
  if (teamSize === 1) return names.map(n => ({ id: genId(), label: n, members: [n] }));
  const teams: Participant[] = [];
  for (let i = 0; i < names.length; i += teamSize) {
    const group = names.slice(i, i + teamSize);
    const filled = [...group];
    while (filled.length < teamSize) filled.push('');
    const label = group.length >= 2 ? `${group[0]} & ${group[1]}` : group[0];
    teams.push({ id: genId(), label, members: filled });
  }
  return teams;
}

// ── Setup screen ──────────────────────────────────────────────────────────────

const STORAGE_KEY = 'tournament_setup';

function loadSaved(): { teamSize: number; perMatch: number; loserBracket: boolean; advancePer: number; participants: Participant[] } | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function SetupScreen({ onGenerate }: { onGenerate: (participants: Participant[], teamSize: number, perMatch: number, loserBracket: boolean, advancePer: number) => void }) {
  const saved = loadSaved();
  const [teamSize, setTeamSize] = useState(saved?.teamSize ?? 1);
  const [perMatch, setPerMatch] = useState(saved?.perMatch ?? 2);
  const [loserBracket, setLoserBracket] = useState(saved?.loserBracket ?? true);
  const [advancePer, setAdvancePer] = useState<number>(saved?.advancePer ?? 1);
  const [name, setName] = useState('');
  const [participants, setParticipants] = useState<Participant[]>(saved?.participants ?? []);
  const inputId = useId();

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ teamSize, perMatch, loserBracket, advancePer, participants }));
    } catch { /* ignore */ }
  }, [teamSize, perMatch, loserBracket, participants]);

  const isDoubleElim = perMatch === 2 && loserBracket;

  const elimLabel = isDoubleElim ? 'Dobbel eliminasjon' : 'Enkel eliminasjon';
  const modeLabel = teamSize === 1
    ? (perMatch === 2 ? `1v1 · ${elimLabel}` : `FFA — ${perMatch} per kamp · Enkel eliminasjon`)
    : (perMatch === 2 ? `${teamSize}v${teamSize} · ${elimLabel}` : `Lag-FFA — ${perMatch} lag per kamp · Enkel eliminasjon`);

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

  const canGenerate = participants.length >= (isDoubleElim ? 2 : perMatch + 1);

  return (
    <div className={styles.setup}>
      <div className={styles.setupTitleRow}>
        <h1 className={styles.setupTitle}>Turnering</h1>
        <div className={styles.setupTitleActions}>
          {participants.length >= 2 && (
            <button className={styles.guttanBtn} onClick={randomize} title="Randomiser lag">
              🔀 Randomiser
            </button>
          )}
          <button className={styles.guttanBtn} onClick={resetToGuttan} title="Reset til Gnomguttan-medlemmer">
            <img src="/logo.png" alt="" className={styles.guttanLogo} />
            Reset til Guttan
          </button>
        </div>
      </div>

      <div className={styles.setupBody}>
        {/* Left — settings */}
        <div className={styles.setupLeft}>
          <div className={styles.inputsRow}>
            <div className={styles.inputGroup}>
              <span className={styles.sectionLabel}>Per lag</span>
              <input
                type="number" min={1} max={4} value={teamSize}
                className={styles.numInput}
                onChange={e => handleTeamSizeChange(Math.min(4, Math.max(1, Number(e.target.value) || 1)))}
              />
              <span className={styles.numHint}>{teamSize === 1 ? 'Solo' : `${teamSize}v${teamSize}`}</span>
            </div>

            <div className={styles.inputGroup}>
              <span className={styles.sectionLabel}>Per kamp</span>
              <input
                type="number" min={2} max={8} value={perMatch}
                className={styles.numInput}
                onChange={e => setPerMatch(Math.min(8, Math.max(2, Number(e.target.value) || 2)))}
              />
              <span className={styles.numHint}>{perMatch === 2 ? 'Duell' : `${perMatch}-kamp`}</span>
            </div>

            {perMatch > 2 && (
              <div className={styles.inputGroup}>
                <span className={styles.sectionLabel}>Avanserer</span>
                <input
                  type="number" min={1} max={perMatch - 1} value={advancePer}
                  className={styles.numInput}
                  onChange={e => setAdvancePer(Math.min(perMatch - 1, Math.max(1, Number(e.target.value) || 1)))}
                />
                <span className={styles.numHint}>av {perMatch}</span>
              </div>
            )}
          </div>

          <div className={styles.section}>
            <span className={styles.sectionLabel}>Bracket-type</span>
            <label className={styles.toggleRow}>
              <button
                type="button"
                className={`${styles.toggle} ${loserBracket && perMatch === 2 ? styles.toggleOn : ''}`}
                onClick={() => setLoserBracket(v => !v)}
                disabled={perMatch > 2}
                style={{ opacity: perMatch > 2 ? 0.4 : 1 }}
              >
                <span className={styles.toggleKnob} />
              </button>
              <span className={styles.toggleLabel}>
                Taperbrakett{perMatch > 2 ? ' (kun i duell-modus)' : ''}
              </span>
            </label>
          </div>

          <div className={styles.generateRow}>
            <span className={styles.hint}>{modeLabel}</span>
            <button className={styles.generateBtn} disabled={!canGenerate} onClick={() => onGenerate(participants, teamSize, perMatch, loserBracket, advancePer)}>
              Generer bracket →
            </button>
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
              {participants.length > 0 && (
                <div className={styles.chipList}>
                  {participants.map(p => (
                    <span key={p.id} className={styles.chip}>
                      {p.label}
                      <button className={styles.chipRemove} onClick={() => remove(p.id)}>×</button>
                    </span>
                  ))}
                </div>
              )}
            </>
          ) : (
            <>
              <span className={styles.sectionLabel}>Lag ({participants.length})</span>
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
              <button className={styles.addBtn} onClick={addTeam}>+ Legg til lag</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Bracket screen ────────────────────────────────────────────────────────────

function BracketScreen({ participants, teamSize, perMatch, loserBracket, matches: initMatches, onReset }: {
  participants: Participant[];
  teamSize: number;
  perMatch: number;
  loserBracket: boolean;
  matches: BMatch[];
  onReset: () => void;
}) {
  const [matches, setMatches] = useState(initMatches);

  const handleWinner = useCallback((matchId: string, pid: string) => {
    setMatches(prev => applyWinner(prev, matchId, pid));
  }, []);

  const isDoubleElim = perMatch === 2 && loserBracket;

  const wbMatches = matches.filter(m => m.bracket === 'W');
  const lbMatches = matches.filter(m => m.bracket === 'L');
  const gfMatches = matches.filter(m => m.bracket === 'GF');

  const wbRounds = groupByRound(wbMatches);
  const lbRounds = groupByRound(lbMatches);

  const gfWinnerId = gfMatches[0]?.winners[0] ?? null;
  const champion = gfWinnerId ? participants.find(p => p.id === gfWinnerId) : null;

  const modeName = teamSize === 1
    ? (perMatch === 2 ? '1v1' : `FFA (${perMatch} per kamp)`)
    : (perMatch === 2 ? `${teamSize}v${teamSize}` : `Lag-FFA`);

  return (
    <div className={styles.bracketPage}>
      <div className={styles.bracketHeader}>
        <div>
          <div className={styles.bracketTitle}>Turnering — {modeName}</div>
          <div className={styles.bracketMeta}>{participants.length} {teamSize > 1 ? 'lag' : 'deltakere'} · {isDoubleElim ? 'Dobbel eliminasjon' : 'Enkel eliminasjon'}</div>
        </div>
        <button className={styles.resetBtn} onClick={onReset}>← Tilbake</button>
      </div>

      <div className={styles.bracketScroll}>
        {/* Winner bracket */}
        <div className={styles.bracketSection}>
          <div className={styles.bracketSectionLabel}>{isDoubleElim ? 'Vinner-bracket' : 'Bracket'}</div>
          <div className={styles.roundHeader}>
            {wbRounds.map((_, i) => <div key={i} className={styles.roundHeaderCell}>Runde {i + 1}</div>)}
          </div>
          <div className={styles.bracketRounds}>
            {wbRounds.map((round, i) => (
              <RoundCol key={i} matches={round} participants={participants} onWinner={handleWinner} />
            ))}
          </div>
        </div>

        {/* Loser bracket */}
        {isDoubleElim && lbRounds.length > 0 && (
          <div className={styles.bracketSection}>
            <div className={styles.bracketSectionLabel}>Taper-bracket</div>
            <div className={styles.roundHeader}>
              {lbRounds.map((_, i) => <div key={i} className={styles.roundHeaderCell}>L-Runde {i + 1}</div>)}
            </div>
            <div className={styles.bracketRounds}>
              {lbRounds.map((round, i) => (
                <RoundCol key={i} matches={round} participants={participants} onWinner={handleWinner} />
              ))}
            </div>
          </div>
        )}

        {/* Grand Final */}
        {gfMatches.length > 0 && (
          <div className={styles.bracketSection}>
            <div className={styles.bracketSectionLabel}>Grand Final</div>
            <div className={styles.bracketRounds}>
              <RoundCol matches={gfMatches} participants={participants} onWinner={handleWinner} />
            </div>
          </div>
        )}

        {/* Champion */}
        {champion && (
          <div className={styles.champion}>
            <span className={styles.championCrown}>🏆</span>
            <span className={styles.championLabel}>Vinner</span>
            <span className={styles.championName}>{champion.label}</span>
            {champion.members.length > 1 && (
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{champion.members.join(' & ')}</span>
            )}
          </div>
        )}
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
    | { phase: 'bracket'; participants: Participant[]; teamSize: number; perMatch: number; loserBracket: boolean; advancePer: number; matches: BMatch[] }
  >({ phase: 'setup' });

  const handleGenerate = useCallback((participants: Participant[], teamSize: number, perMatch: number, loserBracket: boolean, advancePer: number) => {
    const useDouble = perMatch === 2 && loserBracket;
    const matches = useDouble
      ? buildDoubleElim(participants)
      : buildSingleElim(participants, perMatch, advancePer);
    setState({ phase: 'bracket', participants, teamSize, perMatch, loserBracket, advancePer, matches });
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
        {state.phase === 'bracket' && (
          <BracketScreen
            participants={state.participants}
            teamSize={state.teamSize}
            perMatch={state.perMatch}
            loserBracket={state.loserBracket}
            matches={state.matches}
            onReset={handleReset}
          />
        )}
      </div>
    </AppLayout>
  );
}
