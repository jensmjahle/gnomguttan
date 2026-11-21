import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/theme/useTheme';
import { postKrokodilResult } from '@/services/feed';
import { queryClient, qk } from '@/data/queryClient';
import { Button, Card, Field, Screen, T } from '@/components/ui';

// Pass-the-phone Krokodil, same rules as the website: players take turns pressing
// a lower tooth, and whoever presses the hidden trap tooth gets bitten.
const DEFAULT_PLAYERS = ['Ari', 'Emil', 'Heine', 'Jens', 'Joachim', 'Magnus', 'Martin', 'Mikkel', 'Sondre', 'Torbjørn'];
const TOOTH_COUNT = 13;
const STORAGE_KEY = 'krokodil_players';

export function KrokodilScreen() {
  const { tokens } = useTheme();
  const [players, setPlayers] = useState(DEFAULT_PLAYERS);
  const [turn, setTurn] = useState(0);
  const [pressed, setPressed] = useState<Set<number>>(new Set());
  const [loser, setLoser] = useState<{ name: string; presses: number } | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [posted, setPosted] = useState(false);
  const trap = useRef(Math.floor(Math.random() * TOOTH_COUNT));
  const jaw = useRef(new Animated.Value(0)).current;
  const shake = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    void AsyncStorage.getItem(STORAGE_KEY).then((stored) => {
      const parsed = stored ? (JSON.parse(stored) as unknown) : null;
      if (Array.isArray(parsed) && parsed.length >= 2 && parsed.every((p) => typeof p === 'string')) setPlayers(parsed);
    }).catch(() => {});
  }, []);
  const savePlayers = (next: string[]) => { setPlayers(next); void AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => {}); };

  const restart = (first = 0) => {
    trap.current = Math.floor(Math.random() * TOOTH_COUNT);
    setPressed(new Set()); setLoser(null); setPosted(false); setTurn(first);
    Animated.timing(jaw, { toValue: 0, duration: 400, useNativeDriver: true }).start();
  };

  const press = (index: number) => {
    if (loser || pressed.has(index) || editing) return;
    const name = players[turn % players.length];
    const count = pressed.size + 1;
    setPressed(new Set([...pressed, index]));
    if (index === trap.current) {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      Animated.sequence([
        Animated.timing(jaw, { toValue: 1, duration: 120, easing: Easing.in(Easing.quad), useNativeDriver: true }),
        Animated.sequence([0, 1, 2, 3].map((i) => Animated.timing(shake, { toValue: i % 2 ? -1 : 1, duration: 50, useNativeDriver: true }))),
        Animated.timing(shake, { toValue: 0, duration: 50, useNativeDriver: true }),
      ]).start();
      setLoser({ name, presses: count });
      void postKrokodilResult(name, players.length, count).then(() => { setPosted(true); void queryClient.invalidateQueries({ queryKey: qk.feedAll }); }).catch(() => {});
      return;
    }
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    Animated.sequence([
      Animated.timing(jaw, { toValue: 0.15, duration: 80, useNativeDriver: true }),
      Animated.timing(jaw, { toValue: 0, duration: 160, useNativeDriver: true }),
    ]).start();
    setTurn((value) => (value + 1) % players.length);
  };

  const current = players[turn % players.length];
  const next = players[(turn + 1) % players.length];

  return (
    <Screen>
      <Card style={{ alignItems: 'center' }}>
        {loser ? (
          <>
            <T weight={800} size={24} color={tokens.error}>🐊 {loser.name.toUpperCase()} BLE BITT!</T>
            <T muted>På trykk nr. {loser.presses}. {posted ? 'Lagt ut i feeden.' : ''}</T>
          </>
        ) : (
          <>
            <T size={13} muted>Din tur</T>
            <T weight={800} size={26}>{current}</T>
            <T size={12} muted>Deretter: {next}</T>
          </>
        )}
      </Card>

      <Animated.View style={[styles.croc, { backgroundColor: '#3f8f3a', transform: [{ translateX: shake.interpolate({ inputRange: [-1, 1], outputRange: [-8, 8] }) }] }]}>
        <Animated.View style={[styles.upperJaw, { backgroundColor: '#357a31', transform: [{ translateY: jaw.interpolate({ inputRange: [0, 1], outputRange: [-70, 0] }) }] }]}>
          <View style={styles.eyes}><View style={styles.eye}><View style={styles.pupil} /></View><View style={styles.eye}><View style={styles.pupil} /></View></View>
          <View style={styles.upperTeeth}>{Array.from({ length: TOOTH_COUNT }, (_, i) => <View key={i} style={styles.upperTooth} />)}</View>
        </Animated.View>
        <View style={[styles.mouth, { backgroundColor: '#b33a3a' }]}>
          <View style={styles.teeth}>
            {Array.from({ length: TOOTH_COUNT }, (_, index) => (
              <Pressable key={index} onPress={() => press(index)} disabled={Boolean(loser) || pressed.has(index)} accessibilityLabel={`Tann ${index + 1}`}
                style={[styles.tooth, pressed.has(index) && styles.toothDown, loser && index === trap.current && { backgroundColor: '#fca5a5' }]} />
            ))}
          </View>
        </View>
      </Animated.View>

      {loser ? <Button title="Spill igjen" icon="refresh" onPress={() => restart((players.indexOf(loser.name) + 1) % players.length)} /> : <T size={13} muted style={{ textAlign: 'center' }}>Trykk på en tann og send telefonen videre.</T>}

      <Card>
        <Pressable onPress={() => setEditing(!editing)} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Ionicons name="people-outline" size={18} color={tokens.accent} />
          <T weight={700} style={{ flex: 1 }}>Spillere ({players.length})</T>
          <Ionicons name={editing ? 'chevron-up' : 'chevron-down'} size={18} color={tokens.textMuted} />
        </Pressable>
        {editing ? (
          <>
            <View style={styles.players}>
              {players.map((player, index) => (
                <Pressable key={`${player}-${index}`} disabled={players.length <= 2} onPress={() => { savePlayers(players.filter((_, i) => i !== index)); restart(); }} style={[styles.player, { backgroundColor: tokens.bgSecondary }]}>
                  <T size={13}>{player}</T><Ionicons name="close" size={13} color={tokens.textMuted} />
                </Pressable>
              ))}
            </View>
            <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-end' }}>
              <Field value={draft} onChangeText={setDraft} placeholder="Ny spiller" maxLength={30} style={{ flex: 1 }} />
              <Button small icon="add" title="Legg til" disabled={!draft.trim() || players.length >= 32} onPress={() => { savePlayers([...players, draft.trim()]); setDraft(''); restart(); }} />
            </View>
          </>
        ) : null}
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  croc: { height: 230, borderRadius: 30, overflow: 'hidden', justifyContent: 'flex-end' },
  upperJaw: { position: 'absolute', top: 0, left: 0, right: 0, height: 120, borderBottomLeftRadius: 40, borderBottomRightRadius: 40, zIndex: 2, justifyContent: 'space-between' },
  eyes: { flexDirection: 'row', justifyContent: 'space-around', paddingTop: 14 },
  eye: { width: 30, height: 30, borderRadius: 15, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  pupil: { width: 12, height: 18, borderRadius: 6, backgroundColor: '#111' },
  upperTeeth: { flexDirection: 'row', justifyContent: 'space-evenly', paddingHorizontal: 10 },
  upperTooth: { width: 14, height: 14, backgroundColor: '#fff', borderBottomLeftRadius: 7, borderBottomRightRadius: 7, marginBottom: -6 },
  mouth: { height: 110, margin: 12, marginTop: 0, borderRadius: 20, justifyContent: 'flex-end', paddingBottom: 12 },
  teeth: { flexDirection: 'row', justifyContent: 'space-evenly', paddingHorizontal: 6 },
  tooth: { width: 20, height: 34, backgroundColor: '#fff', borderTopLeftRadius: 10, borderTopRightRadius: 10 },
  toothDown: { height: 14, backgroundColor: '#e5e7eb' },
  players: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  player: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999 },
});
