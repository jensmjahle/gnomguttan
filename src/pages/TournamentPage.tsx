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
  loseTo2?: string | null;  // second loser destination (FFA double-elim)
  loseSlot2?: number;
  ghost?: boolean;
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
  const realPids = shuffle(participants).map(p => p.id);
  // Real players first, byes at the end — maximises Round 1 real matches
  const pids = [...realPids];
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
    if (isBye(pids[i]) && isBye(pids[i + 1])) { m.winners = [pids[i]]; m.ghost = true; }
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

  // Propagate WB R0 bye auto-wins into WB R1 slots and ghost the bye matches
  for (const matchId of wb[0]) {
    const m = gm(ms, matchId);
    if (m.winners.length > 0 && m.winTo) {
      const w = m.winners[0];
      gm(ms, m.winTo).slots[m.winSlot] = { pid: w, isBye: isBye(w) };
      m.ghost = true;
    }
  }

  // Cascade: ghost any WB R1+ match whose all slots are byes, propagating a bye forward
  let cascading = true;
  while (cascading) {
    cascading = false;
    for (const round of wb.slice(1)) {
      for (const matchId of round) {
        const m = gm(ms, matchId);
        if (m.ghost) continue;
        if (m.slots.every(s => s.pid !== null && s.isBye)) {
          m.ghost = true;
          m.winners = [m.slots[0].pid!];
          if (m.winTo) gm(ms, m.winTo).slots[m.winSlot] = { pid: m.winners[0], isBye: true };
          cascading = true;
        }
      }
    }
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

  // Mark ghost LB matches — those reachable only via bye auto-wins, never by real players
  const hasRealLosers = (id: string) => ms.find(x => x.id === id)!.slots.filter(s => !s.isBye).length >= 2;
  const ghosts = new Set<string>();
  let changed = true;
  while (changed) {
    changed = false;
    for (const m of ms) {
      if (m.bracket !== 'L' || ghosts.has(m.id)) continue;
      const wbIn  = ms.filter(x => x.bracket === 'W' && x.loseTo  === m.id);
      const lbIn  = ms.filter(x => x.bracket === 'L' && x.winTo   === m.id);
      if (wbIn.every(x => !hasRealLosers(x.id)) && lbIn.every(x => ghosts.has(x.id))) {
        ghosts.add(m.id); changed = true;
      }
    }
  }
  for (const m of ms) { if (ghosts.has(m.id)) m.ghost = true; }

  // For non-ghost LB matches whose LB or WB feeder is a ghost, replace that slot with a bye
  for (const m of ms) {
    if (m.bracket !== 'L' || m.ghost) continue;
    // Ghost LB winners feeding this match
    for (const src of ms.filter(x => x.bracket === 'L' && x.ghost && x.winTo === m.id)) {
      m.slots[src.winSlot] = { pid: `__bye_ghost`, isBye: true };
    }
    // Ghost WB matches whose loser would feed this LB match
    for (const src of ms.filter(x => x.bracket === 'W' && x.ghost && x.loseTo === m.id)) {
      m.slots[src.loseSlot] = { pid: `__bye_ghost`, isBye: true };
    }
  }

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
      // Can't advance more than group.length - 1 (need at least 1 loser per match)
      const effectiveAdv = group.length === 1 ? 1 : Math.min(adv, group.length - 1);
      const id = mk();
      ms.push({ id, bracket: 'W', round, idx: i / ppm, slots: group.map(pid => ({ pid, isBye: false })), winners: [], advancePer: effectiveAdv, winTo: null, winSlot: 0, loseTo: null, loseSlot: 0 });
      rIds.push(id);
      // Push one placeholder per advancing slot, not just one per match
      for (let k = 0; k < effectiveAdv; k++) next.push(`adv_${id}_${k}`);
    }
    roundIds.push(rIds);
    current = next;
    round++;
  }

  // Link rounds — track cumulative advancing-slot index to find the correct next match + start slot
  for (let r = 0; r < roundIds.length - 1; r++) {
    let advSlotIndex = 0;
    for (const matchId of roundIds[r]) {
      const m = gm(ms, matchId);
      const nextMatchIdx = Math.floor(advSlotIndex / ppm);
      const nextSlotStart = advSlotIndex % ppm;
      if (roundIds[r + 1][nextMatchIdx]) {
        m.winTo = roundIds[r + 1][nextMatchIdx];
        m.winSlot = nextSlotStart;
      }
      advSlotIndex += m.advancePer;
    }
    // Set next-round match slots to match total incoming advances
    for (const id of roundIds[r + 1]) {
      const totalSlots = ms.filter(m => m.winTo === id).reduce((sum, m) => sum + m.advancePer, 0);
      gm(ms, id).slots = Array(Math.max(totalSlots, 1)).fill(null).map(tbd);
    }
  }

  return ms;
}

// ── FFA double-elim builder ───────────────────────────────────────────────────
// Works for any loserPer = ppm - adv >= 2.
// Each LB match has loserPer slots with advancePer = 1.

function buildFfaWithLB(participants: Participant[], ppm: number, adv: number): BMatch[] {
  const loserPer = ppm - adv;
  if (loserPer < 2) return buildSingleElim(participants, ppm, adv);

  const ms = buildSingleElim(participants, ppm, adv);
  const tbd = (): Slot => ({ pid: null, isBye: false });

  // Group WB matches by round
  const wbRounds: string[][] = [];
  for (const m of ms.filter(m => m.bracket === 'W')) {
    while (wbRounds.length <= m.round) wbRounds.push([]);
    wbRounds[m.round].push(m.id);
  }

  let mc = ms.length;
  const mkId = () => `lb${mc++}`;
  const lb: string[][] = [];

  // Helper: create LB matches from sources using column-based slot assignment.
  // Column 0 of each match = first M sources, column 1 = next M, etc.
  // This ensures LB winners (listed first) spread across matches before WB losers.
  type Src = { type: 'lb'; id: string } | { type: 'wb'; id: string; loserIdx: number };

  function makeRound(round: number, sources: Src[]): string[] {
    if (sources.length === 0) return [];
    const M = Math.ceil(sources.length / loserPer);
    const ids: string[] = [];
    for (let i = 0; i < M; i++) {
      const id = mkId();
      ms.push({ id, bracket: 'L', round, idx: i, slots: Array(loserPer).fill(null).map(tbd), winners: [], advancePer: 1, winTo: null, winSlot: 0, loseTo: null, loseSlot: 0 });
      ids.push(id);
    }
    // Column-based assignment: source k → slot floor(k/M), match (k % M)
    sources.forEach((src, k) => {
      const matchId = ids[k % M];
      const slot = Math.floor(k / M);
      if (src.type === 'lb') {
        gm(ms, src.id).winTo = matchId;
        gm(ms, src.id).winSlot = slot;
      } else {
        const wbM = gm(ms, src.id);
        if (src.loserIdx === 0) { wbM.loseTo = matchId;  wbM.loseSlot  = slot; }
        else                    { wbM.loseTo2 = matchId; wbM.loseSlot2 = slot; }
      }
    });
    // Pad any short last match with byes
    const lastId = ids[M - 1];
    const lastM = gm(ms, lastId);
    const filled = sources.length - (M - 1) * loserPer; // sources in the last match
    for (let s = filled; s < loserPer; s++) lastM.slots[s] = { pid: '__bye_ghost', isBye: true };
    return ids;
  }

  // LB R0: one match per WB R0 match — all loserPer losers face each other directly
  // Group by WB match: each WB match's losers form their own LB match
  const l0: string[] = [];
  let wbIdx = 0;
  for (const wbMId of wbRounds[0]) {
    const wbM = gm(ms, wbMId);
    const losers = wbM.slots.filter(s => !s.isBye).length - wbM.advancePer;
    if (losers >= 2) {
      const id = mkId();
      ms.push({ id, bracket: 'L', round: 0, idx: l0.length, slots: Array(loserPer).fill(null).map(tbd), winners: [], advancePer: 1, winTo: null, winSlot: 0, loseTo: null, loseSlot: 0 });
      l0.push(id);
      wbM.loseTo = id;
      wbM.loseSlot = 0; // all losers → consecutive slots 0..loserPer-1
    }
    wbIdx++;
  }
  lb.push(l0);

  // Carry single-loser WB R0 matches to next round
  let extraSrcs: Src[] = wbRounds[0]
    .filter(wbMId => {
      const wbM = gm(ms, wbMId);
      return (wbM.slots.filter(s => !s.isBye).length - wbM.advancePer) < 2;
    })
    .flatMap(wbMId => {
      const wbM = gm(ms, wbMId);
      const losers = wbM.slots.filter(s => !s.isBye).length - wbM.advancePer;
      return Array.from({ length: losers }, (_, k) => ({ type: 'wb' as const, id: wbMId, loserIdx: k }));
    });

  let wbFeed = 1;
  while (lb[lb.length - 1].length > 1 || wbFeed < wbRounds.length || extraSrcs.length > 0) {
    const lr = lb.length;
    const prev = lb[lr - 1];

    const sources: Src[] = [
      ...prev.map(id => ({ type: 'lb' as const, id })),
      ...extraSrcs,
    ];
    extraSrcs = [];

    if (wbFeed < wbRounds.length) {
      const wbl = wbRounds[wbFeed++];
      for (const wbMId of wbl) {
        const wbM = gm(ms, wbMId);
        const losers = wbM.slots.filter(s => !s.isBye).length - wbM.advancePer;
        for (let k = 0; k < losers; k++) sources.push({ type: 'wb', id: wbMId, loserIdx: k });
      }
    }

    if (sources.length === 0) break;
    if (sources.length === 1 && sources[0].type === 'lb') {
      lb.push([sources[0].id]); // single survivor passes through
      break;
    }

    const curr = makeRound(lr, sources);
    if (curr.length === 0) break;
    lb.push(curr);
  }

  // Grand Final: WB Final winner vs LB Final winner
  const gfId = mkId();
  ms.push({ id: gfId, bracket: 'GF', round: 0, idx: 0, slots: [tbd(), tbd()], winners: [], advancePer: 1, winTo: null, winSlot: 0, loseTo: null, loseSlot: 0 });
  const wbFinalId = wbRounds[wbRounds.length - 1][0];
  const lbFinalId = lb[lb.length - 1][0];
  if (wbFinalId) { gm(ms, wbFinalId).winTo = gfId; gm(ms, wbFinalId).winSlot = 0; }
  if (lbFinalId) { gm(ms, lbFinalId).winTo = gfId; gm(ms, lbFinalId).winSlot = 1; }

  // Mark ghost LB matches (those fed only by bye sources)
  const isRealWBSource = (id: string) => ms.find(x => x.id === id)!.slots.filter(s => !s.isBye).length >= 2;
  const ghosts = new Set<string>();
  let changed = true;
  while (changed) {
    changed = false;
    for (const m of ms) {
      if (m.bracket !== 'L' || ghosts.has(m.id)) continue;
      const wbIn = ms.filter(x => x.bracket === 'W' && (x.loseTo === m.id || x.loseTo2 === m.id));
      const lbIn = ms.filter(x => x.bracket === 'L' && x.winTo === m.id);
      if (wbIn.every(x => !isRealWBSource(x.id)) && lbIn.every(x => ghosts.has(x.id))) {
        ghosts.add(m.id); changed = true;
      }
    }
  }
  for (const m of ms) { if (ghosts.has(m.id)) m.ghost = true; }

  // Replace ghost-fed slots with byes
  for (const m of ms) {
    if (m.bracket !== 'L' || m.ghost) continue;
    for (const src of ms.filter(x => x.bracket === 'L' && x.ghost && x.winTo === m.id))
      m.slots[src.winSlot] = { pid: '__bye_ghost', isBye: true };
    for (const src of ms.filter(x => x.bracket === 'W' && x.ghost && x.loseTo === m.id))
      m.slots[src.loseSlot] = { pid: '__bye_ghost', isBye: true };
    for (const src of ms.filter(x => x.bracket === 'W' && x.ghost && x.loseTo2 === m.id))
      m.slots[src.loseSlot2 ?? 1] = { pid: '__bye_ghost', isBye: true };
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

  // Loser bracket: propagate losers once all WB winners are chosen
  const updated = result.find(x => x.id === matchId)!;
  if (updated.loseTo && updated.winners.length === updated.advancePer) {
    const losers = updated.slots.filter(s => s.pid && !updated.winners.includes(s.pid) && !s.isBye).map(s => s.pid!);

    const propagate = (toId: string, slot: number, loser: string | null) => {
      result = result.map(x => x.id === toId
        ? { ...x, slots: x.slots.map((s, i) => i === slot ? (loser ? { pid: loser, isBye: false } : { pid: '__bye_ghost', isBye: true }) : { ...s }) }
        : x);
    };

    // First loser: goes to loseTo at loseSlot
    propagate(updated.loseTo, updated.loseSlot, losers[0] ?? null);

    // Second loser: routes to loseTo2 if set, otherwise consecutive slot in same match
    if (losers.length >= 2 || updated.loseTo2) {
      if (updated.loseTo2) {
        propagate(updated.loseTo2, updated.loseSlot2 ?? 1, losers[1] ?? null);
      } else if (losers[1]) {
        propagate(updated.loseTo, updated.loseSlot + 1, losers[1]);
      }
    }
  }

  // Cascade: auto-resolve any match that now has all slots filled but only 1 real player
  for (const m of result) {
    if (m.winners.length > 0 || m.ghost) continue;
    const real = m.slots.filter(s => s.pid && !s.isBye);
    if (m.slots.every(s => s.pid !== null) && real.length === 1) {
      return applyWinner(result, m.id, real[0].pid!);
    }
  }

  return result;
}

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
          style={{ minHeight: `calc(${match.slots.filter(s => !s.isBye).length} * clamp(36px, 3.5vw, 52px))` }}
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

function loadSaved(): { teamSize: number; perMatch: number; loserBracket: boolean; advancePer: number; revealMode: boolean; participants: Participant[] } | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function SetupScreen({ onGenerate }: { onGenerate: (participants: Participant[], teamSize: number, perMatch: number, loserBracket: boolean, advancePer: number, revealMode: boolean) => void }) {
  const saved = loadSaved();
  const [teamSize, setTeamSize] = useState(saved?.teamSize ?? 1);
  const [perMatch, setPerMatch] = useState(saved?.perMatch ?? 2);
  const [loserBracket, setLoserBracket] = useState(saved?.loserBracket ?? true);
  const [advancePer, setAdvancePer] = useState<number>(saved?.advancePer ?? 1);
  const [revealMode, setRevealMode] = useState(saved?.revealMode ?? false);
  const [name, setName] = useState('');
  const [participants, setParticipants] = useState<Participant[]>(saved?.participants ?? []);
  const inputId = useId();

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ teamSize, perMatch, loserBracket, advancePer, revealMode, participants }));
    } catch { /* ignore */ }
  }, [teamSize, perMatch, loserBracket, participants]);

  const ffaLBAvailable = perMatch > 2 && (perMatch - advancePer) >= 2;
  const isDoubleElim = loserBracket && (perMatch === 2 || ffaLBAvailable);

  const elimLabel = isDoubleElim ? 'Dobbel eliminasjon' : 'Enkel eliminasjon';
  const modeLabel = teamSize === 1
    ? (perMatch === 2 ? `1v1 · ${elimLabel}` : `FFA — ${perMatch} per kamp · ${elimLabel}`)
    : (perMatch === 2 ? `${teamSize}v${teamSize} · ${elimLabel}` : `Lag-FFA — ${perMatch} lag per kamp · ${elimLabel}`);

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
              Randomiser
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
                className={`${styles.toggle} ${isDoubleElim ? styles.toggleOn : ''}`}
                onClick={() => setLoserBracket(v => !v)}
                disabled={perMatch > 2 && !ffaLBAvailable}
                style={{ opacity: perMatch > 2 && !ffaLBAvailable ? 0.4 : 1 }}
              >
                <span className={styles.toggleKnob} />
              </button>
              <span className={styles.toggleLabel}>
                Taperbrakett{perMatch > 2 && !ffaLBAvailable ? ' (trenger ≥2 tapere per kamp)' : ''}
              </span>
            </label>
          </div>

          <div className={styles.section}>
            <span className={styles.sectionLabel}>Reveal-modus</span>
            <label className={styles.toggleRow}>
              <button
                type="button"
                className={`${styles.toggle} ${revealMode ? styles.toggleOn : ''}`}
                onClick={() => setRevealMode(v => !v)}
              >
                <span className={styles.toggleKnob} />
              </button>
              <span className={styles.toggleLabel}>Skjul navn</span>
            </label>
          </div>

          <div className={styles.generateRow}>
            <span className={styles.hint}>{modeLabel}</span>
            <button className={styles.generateBtn} disabled={!canGenerate} onClick={() => onGenerate(participants, teamSize, perMatch, loserBracket, advancePer, revealMode)}>
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
    </div>
  );
}

// ── Bracket screen ────────────────────────────────────────────────────────────

function BracketScreen({ participants, teamSize, perMatch, revealMode, matches: initMatches, onReset }: {
  participants: Participant[];
  teamSize: number;
  perMatch: number;
  revealMode: boolean;
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

  const wbRounds = groupByRound(wbMatches);
  const lbRounds = groupByRound(lbMatches);

  const gfWinnerId = gfMatches[0]?.winners[0]
    // Single-elim: champion is the winner of the last WB round's final match
    ?? (!isDoubleElim && wbRounds.length > 0
        ? wbRounds[wbRounds.length - 1].find(m => m.winners.length >= m.advancePer)?.winners[0]
        : undefined)
    ?? null;
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
      <div className={styles.bracketInner}>
        {/* Winner bracket */}
        <div className={styles.bracketSection}>
          {isDoubleElim && <div className={styles.bracketSectionLabel}>Vinner-bracket</div>}
          <div className={styles.roundHeader}>
            {wbRounds.map((_, i) => <div key={i} className={styles.roundHeaderCell}>Runde {i + 1}</div>)}
          </div>
          <div className={styles.bracketRounds}>
            {wbRounds.map((round, i) => (
              <RoundCol key={i} matches={round} participants={participants} onWinner={handleWinner} revealMode={revealMode} revealed={revealed} onReveal={handleReveal} />
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
                <RoundCol key={i} matches={round} participants={participants} onWinner={handleWinner} revealMode={revealMode} revealed={revealed} onReveal={handleReveal} />
              ))}
            </div>
          </div>
        )}

        {/* Grand Final */}
        {gfMatches.length > 0 && (
          <div className={styles.bracketSection}>
            <div className={styles.bracketSectionLabel}>Grand Final</div>
            <div className={styles.bracketRounds}>
              <RoundCol matches={gfMatches} participants={participants} onWinner={handleWinner} revealMode={revealMode} revealed={revealed} onReveal={handleReveal} />
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
    | { phase: 'bracket'; participants: Participant[]; teamSize: number; perMatch: number; loserBracket: boolean; advancePer: number; revealMode: boolean; matches: BMatch[] }
  >({ phase: 'setup' });

  const handleGenerate = useCallback((participants: Participant[], teamSize: number, perMatch: number, loserBracket: boolean, advancePer: number, revealMode: boolean) => {
    let matches: BMatch[];
    if (perMatch === 2 && loserBracket) {
      matches = buildDoubleElim(participants);
    } else if (perMatch > 2 && loserBracket && (perMatch - advancePer) >= 2) {
      matches = buildFfaWithLB(participants, perMatch, advancePer);
    } else {
      matches = buildSingleElim(participants, perMatch, advancePer);
    }
    setState({ phase: 'bracket', participants, teamSize, perMatch, loserBracket, advancePer, revealMode, matches });
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
            revealMode={state.revealMode}
            matches={state.matches}
            onReset={handleReset}
          />
        )}
      </div>
    </AppLayout>
  );
}
