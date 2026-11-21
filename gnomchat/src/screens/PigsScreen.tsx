import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import * as Haptics from 'expo-haptics';
import { useTheme } from '@/theme/useTheme';
import { postPigsRoundScore } from '@/services/feed';
import { queryClient, qk } from '@/data/queryClient';
import { Button, Card, Screen, T } from '@/components/ui';

// Same rules and odds as the website's PigsWidget (Kern 2006).
type PigPosition = 'dot_up' | 'dot_down' | 'trotter' | 'razorback' | 'snouter' | 'leaning_jowler';
const PROBABILITIES: [PigPosition, number][] = [
  ['dot_up', 0.3017], ['dot_down', 0.3497], ['trotter', 0.0884], ['razorback', 0.2237], ['snouter', 0.0304], ['leaning_jowler', 0.0061],
];
const OINKER_PROB = 23 / 6000;
const SCORES: Record<PigPosition, Record<PigPosition, number>> = {
  dot_up: { dot_up: 1, dot_down: 0, trotter: 5, razorback: 5, snouter: 10, leaning_jowler: 15 },
  dot_down: { dot_up: 0, dot_down: 1, trotter: 5, razorback: 5, snouter: 10, leaning_jowler: 15 },
  trotter: { dot_up: 5, dot_down: 5, trotter: 20, razorback: 10, snouter: 15, leaning_jowler: 20 },
  razorback: { dot_up: 5, dot_down: 5, trotter: 10, razorback: 20, snouter: 15, leaning_jowler: 20 },
  snouter: { dot_up: 10, dot_down: 10, trotter: 15, razorback: 15, snouter: 40, leaning_jowler: 25 },
  leaning_jowler: { dot_up: 15, dot_down: 15, trotter: 20, razorback: 20, snouter: 25, leaning_jowler: 60 },
};
const IMAGES: Record<PigPosition, number> = {
  dot_up: require('../../assets/pigs/sideflesk-prikk.gif'),
  dot_down: require('../../assets/pigs/sideflesk-ikke-prikk.gif'),
  trotter: require('../../assets/pigs/labber.gif'),
  razorback: require('../../assets/pigs/svinerygg.gif'),
  snouter: require('../../assets/pigs/tryne.gif'),
  leaning_jowler: require('../../assets/pigs/lyttegris.gif'),
};
const NAMES: Record<PigPosition, string> = {
  dot_up: 'Sideflesk (prikk)', dot_down: 'Sideflesk', trotter: 'Labber', razorback: 'Svinerygg', snouter: 'Tryne', leaning_jowler: 'Lyttegris',
};
const SIDERS = new Set<PigPosition>(['dot_up', 'dot_down']);
const ALL = Object.keys(NAMES) as PigPosition[];

function roll(): PigPosition {
  const r = Math.random();
  let acc = 0;
  for (const [pos, prob] of PROBABILITIES) { acc += prob; if (r < acc) return pos; }
  return 'dot_down';
}
function combo(p1: PigPosition, p2: PigPosition) {
  if (SCORES[p1][p2] === 0) return 'Grisebom!';
  if (p1 === p2) return SIDERS.has(p1) ? 'Sideflesk' : `Dobbel ${NAMES[p1]}!`;
  const specials = [p1, p2].filter((p) => !SIDERS.has(p));
  return specials.length === 1 ? NAMES[specials[0]] : `${NAMES[p1]} + ${NAMES[p2]}`;
}

type Result = { kind: 'good' | 'pigout' | 'oinker'; label: string; points: number | null };

function Pig({ position, spin, x, y }: { position: PigPosition; spin: Animated.Value; x: number; y: number }) {
  return (
    <Animated.View style={[styles.pig, { left: `${x}%`, top: `${y}%`, transform: [
      { translateY: spin.interpolate({ inputRange: [0, 1], outputRange: [-220, 0] }) },
      { rotate: spin.interpolate({ inputRange: [0, 1], outputRange: ['-540deg', '0deg'] }) },
    ] }]}>
      <Image source={IMAGES[position]} style={{ width: 90, height: 90 }} contentFit="contain" />
    </Animated.View>
  );
}

export function PigsScreen() {
  const { tokens } = useTheme();
  const [pigs, setPigs] = useState<{ p1: PigPosition; p2: PigPosition; x1: number; y1: number; x2: number; y2: number } | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [throwing, setThrowing] = useState(false);
  const [turn, setTurn] = useState(0);
  const [total, setTotal] = useState(0);
  const [banked, setBanked] = useState<number | null>(null);
  const [posted, setPosted] = useState(false);
  const [posting, setPosting] = useState(false);
  const spin = useRef(new Animated.Value(1)).current;
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const throwPigs = () => {
    if (throwing) return;
    setThrowing(true); setResult(null); setBanked(null);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    const oinker = Math.random() < OINKER_PROB;
    const p1 = roll();
    const p2 = roll();
    const cx = 30 + Math.random() * 25;
    setPigs(oinker
      ? { p1: ALL[Math.floor(Math.random() * 6)], p2: ALL[Math.floor(Math.random() * 6)], x1: cx - 5, y1: 30, x2: cx + 5, y2: 34 }
      : { p1, p2, x1: 5 + Math.random() * 25, y1: 15 + Math.random() * 40, x2: 52 + Math.random() * 20, y2: 15 + Math.random() * 40 });
    spin.setValue(0);
    Animated.timing(spin, { toValue: 1, duration: 900, easing: Easing.out(Easing.bounce), useNativeDriver: true }).start();
    timers.current.push(setTimeout(() => {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      if (oinker) { setResult({ kind: 'oinker', label: 'Griseri!', points: null }); setTurn(0); setTotal(0); }
      else {
        const score = SCORES[p1][p2];
        if (score === 0) { setResult({ kind: 'pigout', label: combo(p1, p2), points: null }); setTurn(0); }
        else { setResult({ kind: 'good', label: combo(p1, p2), points: score }); setTurn((value) => value + score); }
      }
      setThrowing(false);
    }, 1000));
  };

  const bank = () => {
    if (!turn) return;
    setBanked(turn); setTotal((value) => value + turn); setTurn(0); setResult(null); setPosted(false);
  };

  const post = async () => {
    if (banked === null) return;
    setPosting(true);
    try { await postPigsRoundScore(banked); setPosted(true); void queryClient.invalidateQueries({ queryKey: qk.feedAll }); }
    finally { setPosting(false); }
  };

  const bannerColor = result?.kind === 'good' ? tokens.success : result?.kind === 'pigout' ? tokens.warning : tokens.error;

  return (
    <Screen>
      <T weight={800} size={22}>Kast grisene</T>
      <T muted>Ta å kast grisene da. Spar poengene før du får grisebom!</T>
      <View style={[styles.table, { backgroundColor: '#2f6b3a', borderColor: '#6b4423' }]}>
        {pigs ? (
          <>
            <Pig position={pigs.p1} spin={spin} x={pigs.x1} y={pigs.y1} />
            <Pig position={pigs.p2} spin={spin} x={pigs.x2} y={pigs.y2} />
          </>
        ) : <T color="#fff" style={{ textAlign: 'center', marginTop: 90 }}>Kast grisene på bordet</T>}
      </View>
      {result ? (
        <Card style={{ borderColor: bannerColor, borderWidth: 2, alignItems: 'center' }}>
          <T weight={800} size={22} color={bannerColor}>{result.label}</T>
          <T>{result.kind === 'good' ? `+${result.points} poeng` : result.kind === 'pigout' ? 'Du mister rundens poeng' : 'Grisene kolliderte – du mister alt!'}</T>
        </Card>
      ) : null}
      {banked !== null ? (
        <Card style={{ alignItems: 'center' }}>
          <T weight={700}>Du sparte {banked} poeng!</T>
          <Button small variant={posted ? 'secondary' : 'primary'} title={posted ? 'Lagt ut i feeden ✓' : 'Del i feeden'} busy={posting} disabled={posted} onPress={() => void post()} />
        </Card>
      ) : null}
      <View style={styles.scores}>
        <Card style={{ flex: 1, alignItems: 'center' }}><T size={12} muted>Denne runden</T><T weight={800} size={28}>{turn}</T></Card>
        <Card style={{ flex: 1, alignItems: 'center' }}><T size={12} muted>Totalt</T><T weight={800} size={28}>{total}</T></Card>
      </View>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Button title={throwing ? 'Kaster …' : 'Kast'} icon="dice" disabled={throwing} onPress={throwPigs} style={{ flex: 2 }} />
        <Button variant="secondary" title="Spar" icon="save-outline" disabled={throwing || turn === 0 || result?.kind !== 'good'} onPress={bank} style={{ flex: 1 }} />
      </View>
      <Button variant="ghost" title="Nytt spill" onPress={() => { setTurn(0); setTotal(0); setResult(null); setPigs(null); setBanked(null); }} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  table: { height: 240, borderRadius: 18, borderWidth: 8, overflow: 'hidden' },
  pig: { position: 'absolute' },
  scores: { flexDirection: 'row', gap: 8 },
});
