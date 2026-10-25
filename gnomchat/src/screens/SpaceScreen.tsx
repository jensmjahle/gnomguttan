import { useCallback, useState } from 'react';
import { FlatList, View, Text, Pressable } from 'react-native';
import { useFocusEffect, useRoute, useNavigation, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTheme } from '@/theme/useTheme';
import { ThemedBackground } from '@/theme/ThemedBackground';
import { MatrixAvatar } from '@/components/MatrixAvatar';
import { MatrixSheet, MatrixButton, MatrixNotice } from '@/components/MatrixForms';
import { useMatrixMobileStore } from '@/store/matrixMobileStore';
import { matrixCall } from '@/services/matrix';
import type { RootStackParamList } from '@/navigation/types';
import type { MatrixRoomDetails } from '@/types/matrix';
export function SpaceScreen() {
  const { roomId } = useRoute<RouteProp<RootStackParamList, 'Space'>>().params; const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { tokens, font } = useTheme(); const rooms = useMatrixMobileStore(s => s.rooms);
  const [items, setItems] = useState<any[]>([]); const [next, setNext] = useState<string>(); const [mayAdd, setMayAdd] = useState(false); const [adding, setAdding] = useState(false); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const load = useCallback(async (from?: string) => { setBusy(true); setError(''); try { const [result, details] = await Promise.all([matrixCall<any>('spaceRooms', { id: roomId, from }), matrixCall<MatrixRoomDetails>('roomDetails', { id: roomId })]); const children = result.rooms.filter((room: any) => room.room_id !== roomId); setItems(old => from ? [...old, ...children.filter((room: any) => !old.some(item => item.room_id === room.room_id))] : children); setNext(result.next_batch); setMayAdd(details.mayAddChild); } catch (reason) { setError(reason instanceof Error ? reason.message : 'Kunne ikke hente rommene.'); } finally { setBusy(false); } }, [roomId]);
  useFocusEffect(useCallback(() => { void load(); }, [load]));
  return <ThemedBackground><View style={{ padding: 16, gap: 12 }}><MatrixButton title="Space-innstillinger og medlemmer" secondary onPress={() => navigation.navigate('RoomSettings', { roomId })} />{mayAdd && <MatrixButton title="Legg til rom i spacet" onPress={() => setAdding(true)} />}<MatrixNotice text={error} error /></View>
    <FlatList data={items} keyExtractor={item => item.room_id} refreshing={busy} onRefresh={() => void load()} ListEmptyComponent={<MatrixNotice text={busy ? 'Henter rom …' : 'Dette spacet har ingen rom ennå.'} />} ListFooterComponent={next ? <MatrixButton title="Vis flere rom" disabled={busy} onPress={() => void load(next)} /> : null} renderItem={({ item }) => <Pressable disabled={busy} onPress={() => { setBusy(true); void matrixCall('join', { id: item.room_id }).then(() => { if (item.room_type === 'm.space') navigation.push('Space', { roomId: item.room_id, title: item.name || 'Space' }); else navigation.navigate('Chat', { roomId: item.room_id, title: item.name || 'Samtale' }); }).catch(reason => setError(reason.message)).finally(() => setBusy(false)); }} style={{ flexDirection: 'row', gap: 12, padding: 16, margin: 8, borderRadius: 16, backgroundColor: tokens.bgCard }}><MatrixAvatar name={item.name || item.room_id} mxc={item.avatar_url} /><View style={{ flex: 1 }}><Text style={{ color: tokens.textPrimary, fontFamily: font(600) }}>{item.name || item.room_id}</Text><MatrixNotice text={item.topic || (item.room_type === 'm.space' ? 'Space' : 'Åpne rom')} /></View></Pressable>} />
    <MatrixSheet title="Legg til rom" visible={adding} onClose={() => { if (!busy) setAdding(false); }}>{rooms.filter(room => room.membership === 'join' && !room.space && room.id !== roomId).map(room => <MatrixButton key={room.id} title={room.name} secondary disabled={busy} onPress={() => { setBusy(true); void matrixCall('addSpaceRoom', { id: roomId, childId: room.id }).then(() => { setAdding(false); return load(); }).catch(reason => setError(reason.message)).finally(() => setBusy(false)); }} />)}<MatrixNotice text={error} error /></MatrixSheet>
  </ThemedBackground>;
}
