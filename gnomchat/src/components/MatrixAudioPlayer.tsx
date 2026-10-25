import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { AppState, View, Text, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useVideoPlayer } from 'expo-video';
import { useTheme } from '@/theme/useTheme';
const time = (value: number) => `${Math.floor(Math.max(0, value) / 60)}:${String(Math.floor(Math.max(0, value)) % 60).padStart(2, '0')}`;
export function MatrixAudioPlayer({ uri }: { uri: string }) {
  const { tokens, font } = useTheme(); const [playing, setPlaying] = useState(false); const [position, setPosition] = useState(0); const [duration, setDuration] = useState(0); const [error, setError] = useState(''); const width = useRef(1);
  const player = useVideoPlayer(uri, value => { value.timeUpdateEventInterval = 0.25; });
  useFocusEffect(useCallback(() => () => { try { player.pause(); } catch { /* Already released on unmount. */ } }, [player]));
  useEffect(() => {
    const state = player.addListener('playingChange', value => setPlaying(value.isPlaying)); const clock = player.addListener('timeUpdate', value => setPosition(value.currentTime)); const source = player.addListener('sourceLoad', value => setDuration(value.duration));
    const status = player.addListener('statusChange', value => { if (value.status === 'error') setError('Kunne ikke spille av lydfilen.'); });
    const app = AppState.addEventListener('change', value => { if (value !== 'active') player.pause(); }); setDuration(player.duration || 0);
    return () => { state.remove(); clock.remove(); source.remove(); status.remove(); app.remove(); };
  }, [player]);
  return <View style={{ minWidth: 205, gap: 9, paddingVertical: 4 }}><View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
    <Pressable accessibilityRole="button" accessibilityLabel={playing ? 'Pause lydmelding' : 'Spill av lydmelding'} onPress={() => { if (playing) player.pause(); else { if (duration && position >= duration - 0.2) player.currentTime = 0; player.play(); } }} style={{ backgroundColor: tokens.accent, borderRadius: 23, width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}><Ionicons name={playing ? 'pause' : 'play'} size={23} color={tokens.accentFg} /></Pressable>
    <View style={{ flex: 1, gap: 5 }}><Text style={{ color: tokens.textPrimary, fontFamily: font(600), fontSize: 13 }}>Lydmelding</Text><Pressable accessibilityRole="adjustable" accessibilityLabel="Spol i lydmeldingen" accessibilityValue={{ min: 0, max: Math.round(duration), now: Math.round(position) }} accessibilityActions={[{ name: 'increment', label: 'Frem 10 sekunder' }, { name: 'decrement', label: 'Tilbake 10 sekunder' }]} onAccessibilityAction={event => { player.currentTime = Math.max(0, Math.min(duration, position + (event.nativeEvent.actionName === 'increment' ? 10 : -10))); }} onLayout={event => { width.current = event.nativeEvent.layout.width; }} onPress={event => { if (duration) player.currentTime = Math.max(0, Math.min(duration, event.nativeEvent.locationX / width.current * duration)); }} style={{ paddingVertical: 8 }}><View style={{ height: 5, borderRadius: 3, backgroundColor: tokens.border }}><View style={{ height: 5, borderRadius: 3, width: `${duration ? Math.min(100, position / duration * 100) : 0}%`, backgroundColor: tokens.accent }} /></View></Pressable><Text style={{ color: tokens.textMuted, fontSize: 11 }}>{time(position)} / {time(duration)}</Text></View>
  </View>{error ? <Pressable onPress={() => { setError(''); void player.replaceAsync(uri).catch(() => setError('Kunne ikke laste lydfilen.')); }}><Text style={{ color: tokens.error }}>{error} Trykk for å prøve igjen.</Text></Pressable> : null}</View>;
}
