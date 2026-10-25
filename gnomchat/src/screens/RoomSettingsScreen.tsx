import { useCallback, useState } from 'react';
import { View, Text, Pressable, ScrollView, Alert, ActivityIndicator } from 'react-native';
import { useFocusEffect, useRoute, useNavigation, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { useTheme } from '@/theme/useTheme';
import { ThemedBackground } from '@/theme/ThemedBackground';
import { MatrixAvatar } from '@/components/MatrixAvatar';
import { MatrixUserProfile } from '@/components/MatrixUserProfile';
import { MatrixField, MatrixButton, MatrixToggle, MatrixNotice } from '@/components/MatrixForms';
import { matrixCall } from '@/services/matrix';
import type { MatrixRoomDetails } from '@/types/matrix';
import type { RootStackParamList } from '@/navigation/types';
export function RoomSettingsScreen() {
  const { roomId } = useRoute<RouteProp<RootStackParamList, 'RoomSettings'>>().params;
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>(); const { tokens, font } = useTheme();
  const [data, setData] = useState<MatrixRoomDetails | null>(null); const [error, setError] = useState(''); const [notice, setNotice] = useState(''); const [busy, setBusy] = useState(false);
  const [name, setName] = useState(''); const [topic, setTopic] = useState(''); const [joinRule, setJoinRule] = useState('invite'); const [history, setHistory] = useState('shared');
  const [invitee, setInvitee] = useState(''); const [member, setMember] = useState<string | null>(null);
  const load = useCallback(async () => { try { const value = await matrixCall<MatrixRoomDetails>('roomDetails', { id: roomId }); setData(value); setName(value.name); setTopic(value.topic); setJoinRule(value.joinRule); setHistory(value.history); setError(''); } catch (reason) { setError(reason instanceof Error ? reason.message : 'Kunne ikke hente rommet.'); } }, [roomId]);
  useFocusEffect(useCallback(() => { void load(); }, [load]));
  async function run(operation: () => Promise<void>) { if (busy) return; setBusy(true); setError(''); setNotice(''); try { await operation(); } catch (reason) { setError(reason instanceof Error ? reason.message : 'Kunne ikke endre rommet.'); } finally { setBusy(false); } }
  const can = (key: string) => !!data?.permissions[key];
  const heading = (title: string) => <Text style={{ color: tokens.textPrimary, fontSize: 18, fontFamily: font(700), marginTop: 10 }}>{title}</Text>;
  return <ThemedBackground><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 18, gap: 16, paddingBottom: 50 }}>
    <MatrixNotice text={error} error /><MatrixNotice text={notice} />
    {!data ? <><ActivityIndicator color={tokens.accent} /><MatrixButton title="Prøv igjen" secondary onPress={() => void load()} /></> : <>
      <View style={{ flexDirection: 'row', gap: 14, alignItems: 'center' }}><MatrixAvatar name={data.name} mxc={data.avatar} size={64} /><View style={{ flex: 1 }}><Text style={{ color: tokens.textPrimary, fontFamily: font(700), fontSize: 22 }}>{data.name}</Text><MatrixNotice text={`${data.members.length} medlemmer${data.encrypted ? ' · Kryptert' : ''}`} /></View></View>
      <MatrixButton title="Endre rombilde" secondary disabled={busy || !can('avatar')} onPress={() => void run(async () => { const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.75 }); if (result.canceled || !result.assets[0]) return; const asset = result.assets[0]; if ((asset.fileSize || 0) > 5 * 1024 * 1024) throw new Error('Velg et bilde under 5 MB.'); const base64 = await FileSystem.readAsStringAsync(asset.uri, { encoding: FileSystem.EncodingType.Base64 }); setData(await matrixCall('roomUpdate', { id: roomId, avatar: { base64, mimetype: asset.mimeType || 'image/jpeg' } })); setNotice('Rombildet er oppdatert.'); })} />
      {heading('Rominnstillinger')}
      <MatrixField label="Romnavn" value={name} onChangeText={setName} editable={!busy && can('name')} maxLength={200} /><MatrixField label="Beskrivelse" value={topic} onChangeText={setTopic} multiline editable={!busy && can('topic')} maxLength={2000} />
      <MatrixNotice text="Hvem kan bli med?" />
      {[['invite', 'Bare inviterte'], ['public', 'Alle med romadressen']].map(([value, label]) => <MatrixButton key={value} title={`${joinRule === value ? '✓ ' : ''}${label}`} secondary disabled={busy || !can('join_rules')} onPress={() => setJoinRule(value)} />)}
      <MatrixNotice text="Hvem kan lese historikken?" />
      {[['joined', 'Fra de ble med'], ['invited', 'Fra de ble invitert'], ['shared', 'Alle medlemmer, også nye'], ['world_readable', 'Alle, også uten medlemskap']].map(([value, label]) => <MatrixButton key={value} title={`${history === value ? '✓ ' : ''}${label}`} secondary disabled={busy || !can('history_visibility')} onPress={() => setHistory(value)} />)}
      <MatrixButton title={busy ? 'Lagrer …' : 'Lagre rominnstillinger'} disabled={busy || !name.trim()} onPress={() => void run(async () => { const patch = { ...(name !== data.name ? { name } : {}), ...(topic !== data.topic ? { topic } : {}), ...(joinRule !== data.joinRule ? { joinRule } : {}), ...(history !== data.history ? { history } : {}) }; setData(await matrixCall('roomUpdate', { id: roomId, ...patch })); setNotice('Rominnstillingene er lagret.'); })} />
      <MatrixToggle title="Demp varsler fra dette rommet" value={data.muted} disabled={busy} onChange={muted => void run(async () => { setData(await matrixCall('mute', { id: roomId, muted })); })} />
      {!data.encrypted && !data.space && can('encryption') && <MatrixButton secondary title="Aktiver ende-til-ende-kryptering" disabled={busy} onPress={() => Alert.alert('Aktivere kryptering?', 'Kryptering kan ikke slås av igjen.', [{ text: 'Avbryt', style: 'cancel' }, { text: 'Aktiver', onPress: () => void run(async () => { setData(await matrixCall('roomUpdate', { id: roomId, enableEncryption: true })); }) }])} />}
      {heading('Inviter personer')}<MatrixField label="Matrix-ID" value={invitee} onChangeText={setInvitee} autoCapitalize="none" editable={!busy && data.canInvite} placeholder="@bruker:server.no" /><MatrixButton title="Send invitasjon" disabled={busy || !data.canInvite || !invitee.trim()} onPress={() => void run(async () => { setData(await matrixCall('invite', { id: roomId, userId: invitee.trim() })); setInvitee(''); setNotice('Invitasjonen er sendt.'); })} />
      {heading('Medlemmer')}{data.members.map(person => <Pressable key={person.id} onPress={() => setMember(person.id)} accessibilityLabel={`Åpne profilen til ${person.name}`} style={{ flexDirection: 'row', gap: 12, padding: 10, alignItems: 'center', backgroundColor: tokens.bgCard, borderRadius: 14 }}><MatrixAvatar name={person.name} mxc={person.avatar} /><View style={{ flex: 1 }}><Text style={{ color: tokens.textPrimary, fontFamily: font(600) }}>{person.name}</Text><MatrixNotice text={person.membership === 'invite' ? 'Invitert' : person.power >= 100 ? 'Administrator' : person.power >= 50 ? 'Moderator' : 'Medlem'} /></View><Text style={{ color: tokens.accent }}>›</Text></Pressable>)}
      {heading('Om rommet')}<Text selectable style={{ color: tokens.textMuted }}>{data.id}</Text><Text selectable style={{ color: tokens.textMuted }}>{data.alias || 'Ingen offentlig romadresse'}</Text>
      <MatrixButton title="Forlat rommet" secondary danger disabled={busy} onPress={() => Alert.alert('Forlate rommet?', data.name, [{ text: 'Avbryt', style: 'cancel' }, { text: 'Forlat', style: 'destructive', onPress: () => void run(async () => { await matrixCall('leave', { id: roomId }); navigation.popToTop(); }) }])} />
    </>}
  </ScrollView><MatrixUserProfile userId={member} onClose={() => setMember(null)} onDM={(id, title) => navigation.navigate('Chat', { roomId: id, title })} /></ThemedBackground>;
}
