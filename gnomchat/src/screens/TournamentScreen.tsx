import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/theme/useTheme';
import { Button, Card, Chip, Field, IconButton, Screen, T, ToggleRow } from '@/components/ui';
import {
  GUTTAN, applyWinner, buildDoubleElim, buildFfaWithLB, buildFromNames, buildRoundRobin, buildSingleElim, buildSwissRound,
  computeStandings, flattenToNames, genId, shuffle, type BMatch, type FormatType, type Participant, type RRMatch,
} from '@/utils/tournamentEngine.generated';

// The website's tournament tool (pages/TournamentPage.tsx) with the same engine.
const FORMATS: Array<{ key: FormatType; label: string; hint: string }> = [
  { key: 'single-elim', label: 'Utslag', hint: 'Taper du, er du ute.' },
  { key: 'double-elim', label: 'Dobbel utslag', hint: 'Du må tape to ganger for å ryke ut.' },
  { key: 'ffa', label: 'Alle mot alle', hint: 'Flere per kamp; de beste går videre.' },
  { key: 'round-robin', label: 'Serie', hint: 'Alle møter alle én gang.' },
  { key: 'swiss', label: 'Sveitsisk', hint: 'Like gode møtes, runde for runde.' },
];
const STORAGE_KEY = 'tournament_setup';

type Setup = { name: string; format: FormatType; teamSize: number; perMatch: number; advancePer: number; thirdPlace: boolean; ffaLoserBracket: boolean; swissMaxRounds: number; participants: Participant[] };
type Running = Setup & { matches: BMatch[]; rrMatches: RRMatch[]; swissRound: number };

const defaultSetup = (): Setup => ({
  name: '', format: 'single-elim', teamSize: 1, perMatch: 4, advancePer: 1, thirdPlace: false, ffaLoserBracket: true, swissMaxRounds: 4,
  participants: GUTTAN.map((n) => ({ id: genId(), label: n, members: [n] })),
});

function Stepper({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (value: number) => void }) {
  return (
    <View style={styles.stepper}>
      <T style={{ flex: 1 }}>{label}</T>
      <IconButton icon="remove-circle-outline" label={`Færre ${label}`} disabled={value <= min} onPress={() => onChange(value - 1)} />
      <T weight={800} size={17} style={{ width: 28, textAlign: 'center' }}>{value}</T>
      <IconButton icon="add-circle-outline" label={`Flere ${label}`} disabled={value >= max} onPress={() => onChange(value + 1)} />
    </View>
  );
}

function SetupView({ initial, onStart }: { initial: Setup; onStart: (setup: Setup) => void }) {
  const { tokens } = useTheme();
  const [setup, setSetup] = useState(initial);
  const [draft, setDraft] = useState('');
  const set = (patch: Partial<Setup>) => setSetup((current) => ({ ...current, ...patch }));
  useEffect(() => { void AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(setup)).catch(() => {}); }, [setup]);

  const regroup = (teamSize: number) => set({ teamSize, participants: buildFromNames(flattenToNames(setup.participants), teamSize) });
  const canStart = setup.format === 'ffa' ? setup.participants.length >= setup.perMatch + 1 : setup.participants.length >= 2;

  return (
    <Screen>
      <Field label="Navn på turneringen" value={setup.name} onChangeText={(name) => set({ name })} placeholder="Turnering" maxLength={60} />
      <Card>
        <T weight={700}>Format</T>
        <View style={styles.wrap}>{FORMATS.map((option) => <Chip key={option.key} label={option.label} selected={setup.format === option.key} onPress={() => set({ format: option.key })} />)}</View>
        <T size={12} muted>{FORMATS.find((option) => option.key === setup.format)?.hint}</T>
        <Stepper label="Per lag" value={setup.teamSize} min={1} max={6} onChange={regroup} />
        {setup.format === 'ffa' ? (
          <>
            <Stepper label="Per kamp" value={setup.perMatch} min={3} max={12} onChange={(perMatch) => set({ perMatch, advancePer: Math.min(setup.advancePer, perMatch - 1) })} />
            <Stepper label="Går videre" value={setup.advancePer} min={1} max={setup.perMatch - 1} onChange={(advancePer) => set({ advancePer })} />
            {setup.perMatch - setup.advancePer >= 2 ? <ToggleRow title="Taper-bracket" subtitle="Tapere får en ny sjanse" value={setup.ffaLoserBracket} onChange={(ffaLoserBracket) => set({ ffaLoserBracket })} /> : null}
          </>
        ) : null}
        {setup.format === 'single-elim' ? <ToggleRow title="Bronsefinale" subtitle="Kamp om tredjeplassen" value={setup.thirdPlace} onChange={(thirdPlace) => set({ thirdPlace })} /> : null}
        {setup.format === 'swiss' ? <Stepper label="Runder" value={setup.swissMaxRounds} min={1} max={12} onChange={(swissMaxRounds) => set({ swissMaxRounds })} /> : null}
      </Card>
      <Card>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <T weight={700} style={{ flex: 1 }}>{setup.teamSize > 1 ? 'Lag' : 'Deltakere'} ({setup.participants.length})</T>
          <Button small variant="ghost" title="Stokk" icon="shuffle" onPress={() => set({ participants: setup.teamSize > 1 ? buildFromNames(shuffle(flattenToNames(setup.participants)), setup.teamSize) : shuffle(setup.participants) })} />
          <Button small variant="ghost" title="Gutta" onPress={() => set({ participants: buildFromNames(GUTTAN, setup.teamSize) })} />
        </View>
        {setup.participants.map((participant) => (
          <View key={participant.id} style={[styles.participant, { borderColor: tokens.border }]}>
            <T style={{ flex: 1 }}>{participant.label}{setup.teamSize > 1 ? <T size={12} muted>{`  ${participant.members.filter(Boolean).join(', ')}`}</T> : null}</T>
            <IconButton icon="close" size={18} label={`Fjern ${participant.label}`} onPress={() => set({ participants: setup.participants.filter((p) => p.id !== participant.id) })} />
          </View>
        ))}
        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-end' }}>
          <Field value={draft} onChangeText={setDraft} placeholder={setup.teamSize > 1 ? 'Navn (fordeles på lag)' : 'Legg til deltaker'} maxLength={40} style={{ flex: 1 }} />
          <Button small icon="add" title="Legg til" disabled={!draft.trim()} onPress={() => {
            const names = [...flattenToNames(setup.participants), draft.trim()];
            set({ participants: setup.teamSize > 1 ? buildFromNames(names, setup.teamSize) : [...setup.participants, { id: genId(), label: draft.trim(), members: [draft.trim()] }] });
            setDraft('');
          }} />
        </View>
      </Card>
      <Button title="Start turneringen" icon="trophy" disabled={!canStart} onPress={() => onStart(setup)} />
      {!canStart ? <T size={12} muted style={{ textAlign: 'center' }}>{setup.format === 'ffa' ? `Trenger minst ${setup.perMatch + 1} deltakere.` : 'Trenger minst to deltakere.'}</T> : null}
    </Screen>
  );
}

function MatchCard({ match, participants, onWinner }: { match: BMatch; participants: Participant[]; onWinner: (matchId: string, pid: string) => void }) {
  const { tokens, radius } = useTheme();
  const name = (pid: string | null) => (!pid ? 'TBD' : pid.startsWith('__bye') ? 'Bye' : participants.find((p) => p.id === pid)?.label ?? pid);
  const real = match.slots.filter((slot) => slot.pid && !slot.isBye);
  useEffect(() => {
    if (match.slots.every((slot) => slot.pid !== null) && real.length === 1 && match.winners.length === 0) onWinner(match.id, real[0].pid!);
  }, [match, real, onWinner]);
  const canPick = real.length >= 2;
  const done = match.winners.length >= match.advancePer;
  return (
    <View style={[styles.match, { borderColor: done ? tokens.success : tokens.border, borderRadius: radius.md, backgroundColor: tokens.bgCard }]}>
      {match.slots.filter((slot) => !slot.isBye).map((slot, index) => {
        const winner = slot.pid !== null && match.winners.includes(slot.pid);
        const disabled = !canPick || !slot.pid || (!winner && done);
        return (
          <Pressable key={index} disabled={disabled} onPress={() => slot.pid && onWinner(match.id, slot.pid)} style={[styles.slot, { backgroundColor: winner ? tokens.accentMuted : 'transparent' }, index ? { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: tokens.border } : null]}>
            <T weight={winner ? 800 : 500} muted={!slot.pid} style={{ flex: 1 }}>{name(slot.pid)}</T>
            {winner ? <Ionicons name="checkmark-circle" size={18} color={tokens.accent} /> : null}
          </Pressable>
        );
      })}
    </View>
  );
}

const BRACKET_LABEL: Record<BMatch['bracket'], string> = { W: 'Vinner-bracket', L: 'Taper-bracket', GF: 'Grand final', GFR: 'Grand final (reset)', '3P': 'Bronsefinale' };

function BracketView({ run, onChange, onReset }: { run: Running; onChange: (matches: BMatch[]) => void; onReset: () => void }) {
  const onWinner = useCallback((matchId: string, pid: string) => onChange(applyWinner(run.matches, matchId, pid)), [run.matches, onChange]);
  const sections = useMemo(() => {
    const visible = run.matches.filter((match) => !match.ghost);
    return (['W', 'L', '3P', 'GF', 'GFR'] as const).map((bracket) => {
      const matches = visible.filter((match) => match.bracket === bracket);
      const rounds = [...new Set(matches.map((match) => match.round))].sort((a, b) => a - b).map((round) => matches.filter((m) => m.round === round).sort((a, b) => a.idx - b.idx));
      return { bracket, rounds };
    }).filter((section) => section.rounds.length);
  }, [run.matches]);
  const isDouble = run.matches.some((match) => match.bracket === 'L' || match.bracket === 'GF');
  const gfr = run.matches.find((match) => match.bracket === 'GFR' && !match.ghost);
  const gf = run.matches.find((match) => match.bracket === 'GF');
  const wb = sections.find((section) => section.bracket === 'W')?.rounds ?? [];
  const championId = gfr ? gfr.winners[0] : gf ? gf.winners[0] : !isDouble ? wb[wb.length - 1]?.find((match) => match.winners.length >= match.advancePer)?.winners[0] : undefined;
  const champion = championId ? run.participants.find((p) => p.id === championId) : null;

  return (
    <Screen>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <View style={{ flex: 1 }}><T weight={800} size={20}>{run.name || 'Turnering'}</T><T size={12} muted>{run.participants.length} {run.teamSize > 1 ? 'lag' : 'deltakere'} · {FORMATS.find((f) => f.key === run.format)?.label}</T></View>
        <Button small variant="secondary" title="Ny" icon="arrow-back" onPress={onReset} />
      </View>
      {champion ? <Card style={{ alignItems: 'center' }}><T size={30}>🏆</T><T weight={800} size={22}>{champion.label}</T><T muted>Vinner!</T></Card> : null}
      <T size={12} muted>Trykk på vinneren i hver kamp. Trykk igjen for å angre.</T>
      {sections.map((section) => (
        <View key={section.bracket} style={{ gap: 8 }}>
          {isDouble || section.bracket !== 'W' ? <T weight={700}>{BRACKET_LABEL[section.bracket]}</T> : null}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12 }}>
            {section.rounds.map((round, index) => (
              <View key={index} style={{ width: 200, gap: 8, justifyContent: 'space-around' }}>
                <T size={12} muted weight={700}>{section.bracket === 'W' && !isDouble && index === section.rounds.length - 1 ? 'Finale' : `Runde ${index + 1}`}</T>
                {round.map((match) => <MatchCard key={match.id} match={match} participants={run.participants} onWinner={onWinner} />)}
              </View>
            ))}
          </ScrollView>
        </View>
      ))}
    </Screen>
  );
}

function LeagueView({ run, onChange, onNextRound, onReset }: { run: Running; onChange: (matches: RRMatch[]) => void; onNextRound: () => void; onReset: () => void }) {
  const { tokens, radius } = useTheme();
  const standings = computeStandings(run.participants, run.rrMatches);
  const rounds = [...new Set(run.rrMatches.map((match) => match.round))].sort((a, b) => a - b);
  const name = (pid: string | null) => (pid ? run.participants.find((p) => p.id === pid)?.label ?? pid : 'Fri runde');
  const roundDone = run.rrMatches.filter((match) => match.round === run.swissRound).every((match) => match.winnerId || match.pidB === null);
  return (
    <Screen>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <View style={{ flex: 1 }}><T weight={800} size={20}>{run.name || 'Turnering'}</T><T size={12} muted>{FORMATS.find((f) => f.key === run.format)?.label}{run.format === 'swiss' ? ` · runde ${run.swissRound + 1} av ${run.swissMaxRounds}` : ''}</T></View>
        <Button small variant="secondary" title="Ny" icon="arrow-back" onPress={onReset} />
      </View>
      <Card>
        <T weight={700}>Tabell</T>
        {standings.map((row, index) => (
          <View key={row.id} style={styles.standing}><T weight={700} style={{ width: 24 }}>{index + 1}.</T><T style={{ flex: 1 }}>{row.label}</T><T weight={700}>{row.wins}–{row.losses}</T></View>
        ))}
      </Card>
      {rounds.map((round) => (
        <View key={round} style={{ gap: 6 }}>
          <T weight={700}>Runde {round + 1}</T>
          {run.rrMatches.filter((match) => match.round === round).map((match) => (
            <View key={match.id} style={[styles.rr, { borderColor: tokens.border, borderRadius: radius.md, backgroundColor: tokens.bgCard }]}>
              {[match.pidA, match.pidB].map((pid, index) => (
                <Pressable key={index} disabled={!pid || match.pidB === null} onPress={() => onChange(run.rrMatches.map((m) => (m.id === match.id ? { ...m, winnerId: m.winnerId === pid ? null : pid } : m)))} style={[styles.rrSide, { backgroundColor: match.winnerId && match.winnerId === pid ? tokens.accentMuted : 'transparent' }]}>
                  <T weight={match.winnerId === pid ? 800 : 500} muted={!pid} numberOfLines={1}>{name(pid)}</T>
                </Pressable>
              ))}
            </View>
          ))}
        </View>
      ))}
      {run.format === 'swiss' && run.swissRound + 1 < run.swissMaxRounds ? <Button title="Neste runde" disabled={!roundDone} onPress={onNextRound} /> : null}
    </Screen>
  );
}

export function TournamentScreen() {
  const [initial, setInitial] = useState<Setup | null>(null);
  const [run, setRun] = useState<Running | null>(null);

  useEffect(() => {
    void AsyncStorage.getItem(STORAGE_KEY).then((stored) => {
      const parsed = stored ? (JSON.parse(stored) as Partial<Setup>) : null;
      setInitial(parsed && Array.isArray(parsed.participants) ? { ...defaultSetup(), ...parsed } : defaultSetup());
    }).catch(() => setInitial(defaultSetup()));
  }, []);

  const start = (setup: Setup) => {
    let matches: BMatch[] = [];
    let rrMatches: RRMatch[] = [];
    if (setup.format === 'round-robin') rrMatches = buildRoundRobin(setup.participants);
    else if (setup.format === 'swiss') rrMatches = buildSwissRound(setup.participants, [], 0);
    else if (setup.format === 'double-elim') matches = buildDoubleElim(setup.participants);
    else if (setup.format === 'ffa') matches = setup.ffaLoserBracket && setup.perMatch - setup.advancePer >= 2 ? buildFfaWithLB(setup.participants, setup.perMatch, setup.advancePer) : buildSingleElim(setup.participants, setup.perMatch, setup.advancePer);
    else matches = buildSingleElim(setup.participants, 2, 1, setup.thirdPlace);
    setInitial(setup);
    setRun({ ...setup, matches, rrMatches, swissRound: 0 });
  };

  if (!initial) return null;
  if (!run) return <SetupView initial={initial} onStart={start} />;
  if (run.format === 'round-robin' || run.format === 'swiss') {
    return <LeagueView run={run} onChange={(rrMatches) => setRun({ ...run, rrMatches })} onReset={() => setRun(null)} onNextRound={() => {
      const next = run.swissRound + 1;
      setRun({ ...run, swissRound: next, rrMatches: [...run.rrMatches, ...buildSwissRound(run.participants, run.rrMatches, next)] });
    }} />;
  }
  return <BracketView run={run} onChange={(matches) => setRun((current) => (current ? { ...current, matches } : current))} onReset={() => setRun(null)} />;
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  stepper: { flexDirection: 'row', alignItems: 'center' },
  participant: { flexDirection: 'row', alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, paddingVertical: 2 },
  match: { borderWidth: 1, overflow: 'hidden' },
  slot: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 9 },
  standing: { flexDirection: 'row', alignItems: 'center', paddingVertical: 3 },
  rr: { flexDirection: 'row', borderWidth: 1, overflow: 'hidden' },
  rrSide: { flex: 1, paddingHorizontal: 10, paddingVertical: 10 },
});
