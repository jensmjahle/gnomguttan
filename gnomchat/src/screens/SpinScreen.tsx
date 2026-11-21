import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, View } from 'react-native';
import Svg, { G, Path, Text as SvgText, Circle } from 'react-native-svg';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/theme/useTheme';
import { postWheelSpinResult } from '@/services/feed';
import { queryClient, qk } from '@/data/queryClient';
import { Button, Card, Field, Screen, T } from '@/components/ui';

const DEFAULT_OPTIONS = ['Ari', 'Emil', 'Heine', 'Jens', 'Joachim', 'Magnus', 'Martin', 'Mikkel', 'Sondre', 'Torbjørn'];
const STORAGE_KEY = 'spin_wheel_options';
const MAX_OPTIONS = 32;
const SIZE = 300;
const C = SIZE / 2;
const R = C - 6;

function point(angle: number, r = R) {
  const rad = ((angle - 90) * Math.PI) / 180;
  return { x: C + r * Math.cos(rad), y: C + r * Math.sin(rad) };
}
function segment(start: number, end: number) {
  const s = point(start);
  const e = point(end);
  return `M${C},${C} L${s.x},${s.y} A${R},${R} 0 ${end - start > 180 ? 1 : 0} 1 ${e.x},${e.y} Z`;
}

/** Lykkehjulet: spin for a winner and post it to the feed (like the website). */
export function SpinScreen() {
  const { tokens } = useTheme();
  const [options, setOptions] = useState<string[]>(DEFAULT_OPTIONS);
  const [draft, setDraft] = useState('');
  const [winner, setWinner] = useState<string | null>(null);
  const [spinning, setSpinning] = useState(false);
  const [posted, setPosted] = useState(false);
  const rotation = useRef(new Animated.Value(0)).current;
  const current = useRef(0);
  const hueOffset = useMemo(() => Math.random() * 360, []);

  useEffect(() => {
    void AsyncStorage.getItem(STORAGE_KEY).then((stored) => {
      const parsed = stored ? (JSON.parse(stored) as unknown) : null;
      if (Array.isArray(parsed) && parsed.every((value) => typeof value === 'string') && parsed.length) setOptions(parsed);
    }).catch(() => {});
  }, []);
  const save = (next: string[]) => { setOptions(next); void AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => {}); };

  const spin = () => {
    if (spinning || options.length < 2) return;
    setSpinning(true); setWinner(null); setPosted(false);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});
    const index = Math.floor(Math.random() * options.length);
    const slice = 360 / options.length;
    // The pointer is at the top: land the middle of the chosen slice there.
    const target = 360 - (index * slice + slice / 2) + (Math.random() - 0.5) * slice * 0.6;
    const base = current.current - (current.current % 360);
    const end = base + 360 * (5 + Math.floor(Math.random() * 3)) + target;
    current.current = end;
    Animated.timing(rotation, { toValue: end, duration: 4500, easing: Easing.bezier(0.17, 0.67, 0.12, 0.99), useNativeDriver: true }).start(() => {
      setSpinning(false);
      setWinner(options[index]);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      void postWheelSpinResult(options[index], options.length).then(() => { setPosted(true); void queryClient.invalidateQueries({ queryKey: qk.feedAll }); }).catch(() => {});
    });
  };

  const slice = 360 / Math.max(1, options.length);
  return (
    <Screen>
      <View style={{ alignItems: 'center' }}>
        <Ionicons name="caret-down" size={34} color={tokens.textPrimary} style={{ marginBottom: -12, zIndex: 2 }} />
        <Pressable onPress={spin} disabled={spinning}>
          <Animated.View style={{ transform: [{ rotate: rotation.interpolate({ inputRange: [0, 360], outputRange: ['0deg', '360deg'] }) }] }}>
            <Svg width={SIZE} height={SIZE}>
              <G>
                {options.map((option, index) => {
                  const start = index * slice;
                  const mid = point(start + slice / 2, R * 0.62);
                  return (
                    <G key={`${option}-${index}`}>
                      <Path d={options.length === 1 ? `M${C},${C - R} A${R},${R} 0 1 1 ${C - 0.01},${C - R} Z` : segment(start, start + slice)} fill={`hsl(${Math.round((hueOffset + (index * 360) / options.length) % 360)}, 68%, 55%)`} stroke="#fff" strokeWidth={1.5} />
                      <SvgText x={mid.x} y={mid.y} fill="#fff" fontSize={options.length > 16 ? 10 : 14} fontWeight="bold" textAnchor="middle" alignmentBaseline="middle" transform={`rotate(${start + slice / 2 - 90}, ${mid.x}, ${mid.y})`}>
                        {option.length > 12 ? `${option.slice(0, 12)}…` : option}
                      </SvgText>
                    </G>
                  );
                })}
                <Circle cx={C} cy={C} r={16} fill="#fff" />
              </G>
            </Svg>
          </Animated.View>
        </Pressable>
      </View>
      {winner ? (
        <Card style={{ alignItems: 'center' }}>
          <T size={13} muted>Vinneren er</T>
          <T weight={800} size={28}>🎉 {winner.toUpperCase()} 🎉</T>
          <T size={12} muted>{posted ? 'Lagt ut i feeden.' : 'Legges ut i feeden …'}</T>
        </Card>
      ) : null}
      <Button title={spinning ? 'Spinner …' : 'Spinn hjulet'} icon="sync" disabled={spinning || options.length < 2} onPress={spin} />
      <Card>
        <T weight={700}>Alternativer ({options.length})</T>
        <View style={styles.options}>
          {options.map((option, index) => (
            <Pressable key={`${option}-${index}`} disabled={spinning} onPress={() => save(options.filter((_, i) => i !== index))} style={[styles.option, { backgroundColor: tokens.bgSecondary }]}>
              <T size={13}>{option}</T>
              <Ionicons name="close" size={14} color={tokens.textMuted} />
            </Pressable>
          ))}
        </View>
        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-end' }}>
          <Field value={draft} onChangeText={setDraft} placeholder="Legg til …" maxLength={40} style={{ flex: 1 }} onSubmitEditing={() => { if (draft.trim() && options.length < MAX_OPTIONS) { save([...options, draft.trim()]); setDraft(''); } }} />
          <Button small icon="add" title="Legg til" disabled={!draft.trim() || options.length >= MAX_OPTIONS} onPress={() => { save([...options, draft.trim()]); setDraft(''); }} />
        </View>
        <Button variant="ghost" small title="Tilbakestill til gutta" onPress={() => save(DEFAULT_OPTIONS)} />
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  options: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  option: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999 },
});
