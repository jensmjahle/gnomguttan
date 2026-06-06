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
  bracket: 'W' | 'L' | 'GF' | 'GFR' | '3P';
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

type FormatType = 'single-elim' | 'double-elim' | 'ffa' | 'round-robin' | 'swiss';

interface RRMatch {
  id: string;
  round: number;
  idx: number;
  pidA: string;
  pidB: string | null; // null = bye (auto-win for pidA)
  winnerId: string | null;
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
  // Grand Final Reset — activated only if LB player wins GF
  ms.push({ id: mk(), bracket: 'GFR', round: 0, idx: 0, slots: [tbd(), tbd()], winners: [], advancePer: 1, winTo: null, winSlot: 0, loseTo: null, loseSlot: 0, ghost: true });

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

function buildSingleElim(participants: Participant[], ppm: number, adv = 1, thirdPlace = false): BMatch[] {
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

    if (round === 0) {
      // Balanced R0: distribute evenly so the last group isn't tiny (e.g. 10→[4,3,3] not [4,4,2])
      const n = current.length;
      const M = Math.ceil(n / ppm);
      const base = Math.floor(n / M);
      const extras = n % M;
      let offset = 0;
      for (let i = 0; i < M; i++) {
        const size = i < extras ? base + 1 : base;
        const group = current.slice(offset, offset + size);
        offset += size;
        const effectiveAdv = Math.min(adv, group.length - 1);
        const id = mk();
        ms.push({ id, bracket: 'W', round, idx: i, slots: group.map(pid => ({ pid, isBye: false })), winners: [], advancePer: effectiveAdv, winTo: null, winSlot: 0, loseTo: null, loseSlot: 0 });
        rIds.push(id);
        for (let k = 0; k < effectiveAdv; k++) next.push(`adv_${id}_${k}`);
      }
    } else {
      for (let i = 0; i < current.length; i += ppm) {
        const group = current.slice(i, i + ppm);
        const effectiveAdv = group.length === 1 ? 1 : Math.min(adv, group.length - 1);
        const id = mk();
        ms.push({ id, bracket: 'W', round, idx: i / ppm, slots: group.map(pid => ({ pid, isBye: false })), winners: [], advancePer: effectiveAdv, winTo: null, winSlot: 0, loseTo: null, loseSlot: 0 });
        rIds.push(id);
        for (let k = 0; k < effectiveAdv; k++) next.push(`adv_${id}_${k}`);
      }
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

  // 3rd-place match: semifinal losers play for bronze (1v1 only, needs ≥2 rounds)
  if (thirdPlace && ppm === 2 && roundIds.length >= 2) {
    const semis = roundIds[roundIds.length - 2];
    if (semis.length === 2) {
      const tpId = mk();
      ms.push({ id: tpId, bracket: '3P', round: 0, idx: 0, slots: [tbd(), tbd()], winners: [], advancePer: 1, winTo: null, winSlot: 0, loseTo: null, loseSlot: 0 });
      gm(ms, semis[0]).loseTo = tpId; gm(ms, semis[0]).loseSlot = 0;
      gm(ms, semis[1]).loseTo = tpId; gm(ms, semis[1]).loseSlot = 1;
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

  // Helper: create LB matches from sources using sequential slot assignment.
  // source k → match floor(k/ppm), slot k%ppm. LB advances (listed first in pairs of adv)
  // stay together so a single LB match's advances land in consecutive slots of the same next match.
  type Src = { type: 'lb'; id: string; winnerIdx: number } | { type: 'wb'; id: string; loserIdx: number };

  function makeRound(round: number, sources: Src[]): string[] {
    if (sources.length === 0) return [];
    const M = Math.ceil(sources.length / ppm);
    const ids: string[] = [];
    for (let i = 0; i < M; i++) {
      const id = mkId();
      ms.push({ id, bracket: 'L', round, idx: i, slots: Array(ppm).fill(null).map(tbd), winners: [], advancePer: adv, winTo: null, winSlot: 0, loseTo: null, loseSlot: 0 });
      ids.push(id);
    }
    // Sequential assignment: source k → match floor(k/ppm), slot k%ppm
    sources.forEach((src, k) => {
      const matchId = ids[Math.floor(k / ppm)];
      const slot = k % ppm;
      if (src.type === 'lb') {
        if (src.winnerIdx === 0) { gm(ms, src.id).winTo = matchId; gm(ms, src.id).winSlot = slot; }
        // winnerIdx > 0: applyWinner handles via winSlot + idx
      } else {
        const wbM = gm(ms, src.id);
        if (src.loserIdx === 0) { wbM.loseTo = matchId;  wbM.loseSlot  = slot; }
        else                    { wbM.loseTo2 = matchId; wbM.loseSlot2 = slot; }
      }
    });
    // Pad under-filled matches with byes; clamp advancePer to real player count
    for (let i = 0; i < M; i++) {
      const inMatch = sources.filter((_, k) => Math.floor(k / ppm) === i).length;
      const lm = gm(ms, ids[i]);
      for (let s = inMatch; s < ppm; s++) lm.slots[s] = { pid: '__bye_ghost', isBye: true };
      lm.advancePer = inMatch >= 2 ? Math.min(adv, inMatch - 1) : 1;
    }
    return ids;
  }

  // LB R0: ppm-sized matches.
  // If ppm divides evenly by loserPer: group ppm/loserPer WB matches per LB match.
  // Otherwise: 1 WB match per LB match, pad remaining slots with byes.
  const l0: string[] = [];
  const wbR0Real = wbRounds[0].filter(wbMId => {
    const wbM = gm(ms, wbMId);
    return (wbM.slots.filter(s => !s.isBye).length - wbM.advancePer) >= 2;
  });

  if (ppm % loserPer === 0) {
    // Exact fill: group (ppm/loserPer) WB matches per LB match
    const wbPerLB = ppm / loserPer;
    for (let i = 0; i < wbR0Real.length; i += wbPerLB) {
      const id = mkId();
      ms.push({ id, bracket: 'L', round: 0, idx: l0.length, slots: Array(ppm).fill(null).map(tbd), winners: [], advancePer: adv, winTo: null, winSlot: 0, loseTo: null, loseSlot: 0 });
      l0.push(id);
      for (let j = 0; j < wbPerLB && i + j < wbR0Real.length; j++) {
        const wbM = gm(ms, wbR0Real[i + j]);
        wbM.loseTo = id;
        wbM.loseSlot = j * loserPer; // each WB match's losers fill consecutive slots
      }
    }
  } else {
    // Pad with byes: 1 WB match per LB match. Use actual loser count (may be < loserPer for smaller WB matches).
    for (const wbMId of wbR0Real) {
      const id = mkId();
      const wbM = gm(ms, wbMId);
      const realLosers = wbM.slots.filter(s => !s.isBye).length - wbM.advancePer;
      const slots: Slot[] = Array(ppm).fill(null).map((_, s) => s < realLosers ? tbd() : { pid: '__bye_ghost', isBye: true });
      ms.push({ id, bracket: 'L', round: 0, idx: l0.length, slots, winners: [], advancePer: realLosers >= 2 ? Math.min(adv, realLosers - 1) : 1, winTo: null, winSlot: 0, loseTo: null, loseSlot: 0 });
      l0.push(id);
      wbM.loseTo = id;
      wbM.loseSlot = 0;
    }
  }
  lb.push(l0);

  // Carry small WB R0 matches (< 2 real losers) to next round
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

    // Each prev LB match contributes `adv` winner slots; WB losers contribute 1 each
    const sources: Src[] = [
      ...prev.flatMap(id => Array.from({ length: gm(ms, id).advancePer }, (_, wi) => ({ type: 'lb' as const, id, winnerIdx: wi }))),
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
    // Single LB survivor (adv=1 only): pass through without creating a match
    if (sources.length === 1 && sources[0].type === 'lb' && sources[0].winnerIdx === 0) {
      lb.push([sources[0].id]);
      break;
    }

    const curr = makeRound(lr, sources);
    if (curr.length === 0) break;
    lb.push(curr);
  }

  // Grand Final + Reset
  const gfId = mkId();
  ms.push({ id: gfId, bracket: 'GF', round: 0, idx: 0, slots: [tbd(), tbd()], winners: [], advancePer: 1, winTo: null, winSlot: 0, loseTo: null, loseSlot: 0 });
  const wbFinalId = wbRounds[wbRounds.length - 1][0];
  const lbFinalId = lb[lb.length - 1]?.[0];
  if (wbFinalId) { gm(ms, wbFinalId).winTo = gfId; gm(ms, wbFinalId).winSlot = 0; }
  if (lbFinalId) { gm(ms, lbFinalId).winTo = gfId; gm(ms, lbFinalId).winSlot = 1; }
  ms.push({ id: mkId(), bracket: 'GFR', round: 0, idx: 0, slots: [tbd(), tbd()], winners: [], advancePer: 1, winTo: null, winSlot: 0, loseTo: null, loseSlot: 0, ghost: true });

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

// ── Round Robin builder ───────────────────────────────────────────────────────

function buildRoundRobin(participants: Participant[]): RRMatch[] {
  const pids = [...participants.map(p => p.id)];
  if (pids.length % 2 === 1) pids.push('__bye_rr'); // add phantom bye for odd count
  const N = pids.length;
  const rotating = pids.slice(1);
  const ms: RRMatch[] = [];
  let mc = 0;

  for (let r = 0; r < N - 1; r++) {
    const row = [pids[0], ...rotating];
    let idx = 0;
    for (let i = 0; i < N / 2; i++) {
      const a = row[i];
      const b = row[N - 1 - i];
      if (a === '__bye_rr') { ms.push({ id: `rr${mc++}`, round: r, idx: idx++, pidA: b, pidB: null, winnerId: b }); continue; }
      if (b === '__bye_rr') { ms.push({ id: `rr${mc++}`, round: r, idx: idx++, pidA: a, pidB: null, winnerId: a }); continue; }
      ms.push({ id: `rr${mc++}`, round: r, idx: idx++, pidA: a, pidB: b, winnerId: null });
    }
    rotating.unshift(rotating.pop()!);
  }
  return ms;
}

// ── Swiss round builder ───────────────────────────────────────────────────────

function buildSwissRound(participants: Participant[], existing: RRMatch[], roundNum: number): RRMatch[] {
  const wins = new Map<string, number>();
  const hadBye = new Set<string>();
  const played = new Map<string, Set<string>>();
  for (const p of participants) { wins.set(p.id, 0); played.set(p.id, new Set()); }

  for (const m of existing) {
    if (m.pidB === null) { hadBye.add(m.pidA); if (m.winnerId) wins.set(m.pidA, (wins.get(m.pidA) ?? 0) + 1); }
    else {
      if (m.pidA && m.pidB) { played.get(m.pidA)?.add(m.pidB); played.get(m.pidB)?.add(m.pidA); }
      if (m.winnerId) wins.set(m.winnerId, (wins.get(m.winnerId) ?? 0) + 1);
    }
  }

  // Sort by wins desc, then name as tiebreak
  const sorted = [...participants].sort((a, b) => (wins.get(b.id) ?? 0) - (wins.get(a.id) ?? 0) || a.label.localeCompare(b.label));
  const used = new Set<string>();
  const pairings: [string, string | null][] = [];

  for (const p of sorted) {
    if (used.has(p.id)) continue;
    let found: string | null = null;
    // Prefer opponent not yet played, same win count first then adjacent
    for (const opp of sorted) {
      if (opp.id === p.id || used.has(opp.id) || played.get(p.id)?.has(opp.id)) continue;
      found = opp.id; break;
    }
    if (!found) {
      // Fallback: allow rematch rather than no match
      for (const opp of sorted) {
        if (opp.id === p.id || used.has(opp.id)) continue;
        found = opp.id; break;
      }
    }
    if (found) { pairings.push([p.id, found]); used.add(p.id); used.add(found); }
    else {
      // Bye: prefer player who hasn't had a bye yet
      if (!hadBye.has(p.id)) { pairings.push([p.id, null]); used.add(p.id); }
    }
  }
  // Any remaining unpaired get byes
  for (const p of sorted) {
    if (!used.has(p.id)) { pairings.push([p.id, null]); used.add(p.id); }
  }

  let mc = 0;
  return pairings.map(([a, b], i) => ({
    id: `sw${roundNum}_${mc++}`,
    round: roundNum, idx: i,
    pidA: a, pidB: b,
    winnerId: b === null ? a : null, // byes auto-resolve
  }));
}

// ── RR / Swiss standings ──────────────────────────────────────────────────────

function computeStandings(participants: Participant[], matches: RRMatch[]) {
  const wins = new Map<string, number>();
  const losses = new Map<string, number>();
  for (const p of participants) { wins.set(p.id, 0); losses.set(p.id, 0); }
  for (const m of matches) {
    if (!m.winnerId) continue;
    const loser = m.pidB !== null && m.winnerId === m.pidA ? m.pidB : m.pidB !== null ? m.pidA : null;
    wins.set(m.winnerId, (wins.get(m.winnerId) ?? 0) + 1);
    if (loser) losses.set(loser, (losses.get(loser) ?? 0) + 1);
  }
  return [...participants]
    .map(p => ({ ...p, wins: wins.get(p.id) ?? 0, losses: losses.get(p.id) ?? 0 }))
    .sort((a, b) => b.wins - a.wins || a.losses - b.losses || a.label.localeCompare(b.label));
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
    if (m.bracket === 'GF') {
      result = result.map(x => x.bracket === 'GFR'
        ? { ...x, ghost: true, slots: [{ pid: null, isBye: false }, { pid: null, isBye: false }], winners: [] }
        : x);
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

  // Grand Final Reset: activate if LB player (slot 1) wins GF
  const updated = result.find(x => x.id === matchId)!;
  if (updated.bracket === 'GF') {
    const lbPid = m.slots[1]?.pid;
    if (pid === lbPid) {
      const wbPid = m.slots[0]?.pid;
      const gfrM = result.find(x => x.bracket === 'GFR');
      if (gfrM && wbPid && lbPid) {
        result = result.map(x => x.id === gfrM.id ? {
          ...x, ghost: false,
          slots: [{ pid: wbPid, isBye: false }, { pid: lbPid, isBye: false }],
          winners: []
        } : x);
      }
    }
  }

  // Loser bracket: propagate losers once all WB winners are chosen
  if (updated.loseTo && updated.winners.length === updated.advancePer) {
    const losers = updated.slots.filter(s => s.pid && !updated.winners.includes(s.pid) && !s.isBye).map(s => s.pid!);

    const propagate = (toId: string, slot: number, loser: string | null) => {
      result = result.map(x => x.id === toId
        ? { ...x, slots: x.slots.map((s, i) => i === slot ? (loser ? { pid: loser, isBye: false } : { pid: '__bye_ghost', isBye: true }) : { ...s }) }
        : x);
    };

    // First loser (or bye if none); all further losers fill consecutive slots in loseTo
    propagate(updated.loseTo, updated.loseSlot, losers[0] ?? null);
    for (let li = 1; li < losers.length; li++) {
      if (li === 1 && updated.loseTo2 && updated.loseTo2 !== updated.loseTo) {
        propagate(updated.loseTo2, updated.loseSlot2 ?? 1, losers[li]);
      } else {
        propagate(updated.loseTo, updated.loseSlot + li, losers[li]);
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
        <button className={`${styles.rrTabBtn} ${activeTab === 'matches' ? styles.rrTabBtnActive : ''}`} onClick={() => setActiveTab('matches')}>Spillere</button>
      </div>
      <div className={styles.bracketScroll}>
        <div className={styles.rrLayout}>
          <div className={`${styles.rrStandings} ${activeTab !== 'standings' ? styles.rrHideMobile : ''}`}>
            <div className={styles.bracketSectionLabel}>Tabell</div>
            <StandingsTable participants={participants} matches={matches} />
          </div>
          <div className={`${styles.rrRounds} ${activeTab !== 'matches' ? styles.rrHideMobile : ''}`}>
            <div className={styles.bracketSectionLabel}>Spillere</div>
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

// ── Constants ─────────────────────────────────────────────────────────────────

const GUTTAN = ['Ari', 'Emil', 'Heine', 'Jens', 'Joachim', 'Magnus', 'Martin', 'Mikkel', 'Sondre', 'Torbjørn'];

let _uid = Date.now();
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
