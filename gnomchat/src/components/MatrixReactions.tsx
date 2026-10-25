import { useRef, useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/theme/useTheme';
import { matrixCall } from '@/services/matrix';
import { MatrixSheet, MatrixField, MatrixButton, MatrixNotice } from './MatrixForms';
import type { MatrixMessage } from '@/types/matrix';
export const REACTION_EMOJIS = ['👍', '❤️', '😂', '🎉', '😮', '😢', '🔥', '👏', '🍻', '💯', '🤔', '👎'];
export function MatrixReactionPicker({ visible, onClose, roomId, message }: { visible: boolean; onClose: () => void; roomId: string; message: MatrixMessage }) {
  const { tokens } = useTheme(); const [custom, setCustom] = useState(''); const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const lock = useRef(false);
  async function choose(key: string) { if (lock.current) return; lock.current = true; setBusy(true); setError(''); try { await matrixCall('react', { id: roomId, eventId: message.id, key: key.trim() }); onClose(); } catch (reason) { setError(reason instanceof Error ? reason.message : 'Kunne ikke endre reaksjonen.'); } finally { lock.current = false; setBusy(false); } }
  return <MatrixSheet title="Reager på meldingen" visible={visible} onClose={() => { if (!busy) onClose(); }}>
    <Text numberOfLines={2} style={{ color: tokens.textMuted }}>{message.body}</Text>
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>{REACTION_EMOJIS.map(emoji => { const mine = message.reactions.some(reaction => reaction.key === emoji && reaction.mine); return <Pressable accessibilityRole="button" accessibilityLabel={`${mine ? 'Fjern' : 'Legg til'} ${emoji}`} accessibilityState={{ selected: mine, disabled: busy }} disabled={busy} key={emoji} onPress={() => void choose(emoji)} style={({ pressed }) => ({ minWidth: 58, height: 56, alignItems: 'center', justifyContent: 'center', backgroundColor: mine ? tokens.bgHover : tokens.bgCard, borderColor: mine ? tokens.accent : tokens.border, borderWidth: mine ? 2 : 1, borderRadius: 18, opacity: pressed ? 0.6 : 1 })}><Text style={{ fontSize: 29 }}>{emoji}</Text></Pressable>; })}</View>
    <MatrixField label="Annen emoji" value={custom} onChangeText={setCustom} maxLength={32} editable={!busy} />
    <MatrixButton title={busy ? 'Lagrer …' : 'Bruk reaksjon'} disabled={busy || !custom.trim()} onPress={() => void choose(custom)} /><MatrixNotice text={error} error />
    <MatrixNotice text="Trykk på en reaksjon du allerede har valgt for å fjerne den." />
  </MatrixSheet>;
}
export function MatrixReactionBar({ roomId, message, showAdd = true }: { roomId: string; message: MatrixMessage; showAdd?: boolean }) {
  const { tokens, font } = useTheme(); const [picker, setPicker] = useState(false); const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const lock = useRef(false);
  if (message.redacted || message.pending || message.failed || (!showAdd && !message.reactions.length)) return null;
  async function toggle(key: string) { if (lock.current) return; lock.current = true; setBusy(true); setError(''); try { await matrixCall('react', { id: roomId, eventId: message.id, key }); } catch (reason) { setError(reason instanceof Error ? reason.message : 'Reaksjonen feilet.'); } finally { lock.current = false; setBusy(false); } }
  return <View style={{ marginTop: 4, gap: 4 }}><View style={styles.bar}>
    {message.reactions.map(reaction => <Pressable key={reaction.key} accessibilityRole="button" accessibilityLabel={`${reaction.key}, ${reaction.count} reaksjoner${reaction.mine ? ', valgt av deg' : ''}`} accessibilityState={{ selected: reaction.mine, disabled: busy }} disabled={busy} onPress={() => void toggle(reaction.key)} onLongPress={() => setPicker(true)} style={({ pressed }) => [styles.chip, { backgroundColor: reaction.mine ? tokens.bgHover : tokens.bgCard, borderColor: reaction.mine ? tokens.accent : tokens.border, opacity: pressed || busy ? 0.6 : 1 }]}><Text style={{ fontSize: 17 }}>{reaction.key}</Text><Text style={{ color: reaction.mine ? tokens.accent : tokens.textSecondary, fontFamily: font(700), fontSize: 12 }}>{reaction.count}</Text></Pressable>)}
    {showAdd && <Pressable accessibilityLabel="Legg til reaksjon" accessibilityRole="button" onPress={() => setPicker(true)} hitSlop={5} style={[styles.chip, { borderStyle: 'dashed', borderColor: tokens.border, backgroundColor: tokens.bgCard }]}><Ionicons name="happy-outline" color={tokens.textMuted} size={18} /><Ionicons name="add" color={tokens.textMuted} size={12} /></Pressable>}
  </View><MatrixNotice text={error} error /><MatrixReactionPicker visible={picker} onClose={() => setPicker(false)} message={message} roomId={roomId} /></View>;
}
const styles = StyleSheet.create({ bar: { flexDirection: 'row', flexWrap: 'wrap', gap: 5, alignItems: 'center' }, chip: { minWidth: 41, minHeight: 31, paddingHorizontal: 9, paddingVertical: 4, borderRadius: 18, borderWidth: 1, flexDirection: 'row', gap: 5, alignItems: 'center', justifyContent: 'center' } });
