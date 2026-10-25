import { useEffect, useMemo, useState } from 'react';
import { View, Text, TextInput, StyleSheet, FlatList, Pressable, RefreshControl, ActivityIndicator, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTheme } from '@/theme/useTheme';
import { ThemedBackground } from '@/theme/ThemedBackground';
import { MatrixLoginScreen } from './MatrixLoginScreen';
import { MatrixNewConversation } from '@/components/MatrixNewConversation';
import { useMatrixMobileStore } from '@/store/matrixMobileStore';
import { matrixCall } from '@/services/matrix';
import type { RootStackParamList } from '@/navigation/types';
import type { MatrixRoom } from '@/types/matrix';
import { MatrixAvatar } from '@/components/MatrixAvatar';
export function ChannelListScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList, 'Channels'>>(); const { tokens, font } = useTheme();
  const session = useMatrixMobileStore(s => s.session); const hydrated = useMatrixMobileStore(s => s.hydrated); const rooms = useMatrixMobileStore(s => s.rooms);
  const status = useMatrixMobileStore(s => s.status); const error = useMatrixMobileStore(s => s.error); const pendingRoom = useMatrixMobileStore(s => s.pendingRoom);
  const [refreshing, setRefreshing] = useState(false); const [adding, setAdding] = useState(false); const [search, setSearch] = useState('');
  const filtered = useMemo(() => rooms.filter(room => `${room.name} ${room.topic || ''}`.toLocaleLowerCase('nb-NO').includes(search.toLocaleLowerCase('nb-NO'))), [rooms, search]);
  function open(id: string, title: string, space = false) { if (space) navigation.navigate('Space', { roomId: id, title }); else navigation.navigate('Chat', { roomId: id, title }); }
  useEffect(() => { if (!session || !pendingRoom || status !== 'Tilkoblet') return; const room = rooms.find(item => item.id === pendingRoom); open(pendingRoom, room?.name || 'Samtale', room?.space); useMatrixMobileStore.setState({ pendingRoom: null }); }, [pendingRoom, session, status, rooms]);
  if (!hydrated) return <ThemedBackground><View style={styles.center}><ActivityIndicator color={tokens.accent} /></View></ThemedBackground>;
  if (!session) return <MatrixLoginScreen />;
  function openRoom(room: MatrixRoom) {
    if (room.membership === 'invite') { Alert.alert('Invitasjon', `Bli med i ${room.name}?`, [{ text: 'Avbryt', style: 'cancel' }, { text: 'Avslå', style: 'destructive', onPress: () => void matrixCall('leave', { id: room.id }).catch(reason => Alert.alert('Matrix', reason.message)) }, { text: 'Bli med', onPress: () => void matrixCall('join', { id: room.id }).then(() => open(room.id, room.name, room.space)).catch(reason => Alert.alert('Matrix', reason.message)) }]); return; } open(room.id, room.name, room.space);
  }
  return <ThemedBackground>
    <View style={{ flexDirection: 'row', padding: 14, gap: 10, alignItems: 'center' }}><View style={{ flex: 1, flexDirection: 'row', gap: 8, alignItems: 'center', paddingHorizontal: 12, backgroundColor: tokens.bgCard, borderRadius: 18, borderWidth: 1, borderColor: tokens.border }}><Ionicons name="search" size={18} color={tokens.textMuted} /><TextInput accessibilityLabel="Søk i samtaler" placeholder="Søk i samtaler" value={search} onChangeText={setSearch} placeholderTextColor={tokens.textMuted} style={{ flex: 1, paddingVertical: 12, color: tokens.textPrimary, fontFamily: font(400) }} /></View><Pressable onPress={() => setAdding(true)} accessibilityLabel="Ny samtale eller rom" style={{ backgroundColor: tokens.accent, padding: 12, borderRadius: 18 }}><Ionicons name="add" size={24} color={tokens.accentFg} /></Pressable></View>
    <MatrixNewConversation visible={adding} onClose={() => setAdding(false)} onOpen={open} />
    {(status !== 'Tilkoblet' || error) && <View style={{ padding: 12 }}><Text style={{ color: error ? tokens.error : tokens.textMuted }}>{error || status}</Text></View>}
    <FlatList data={filtered} keyExtractor={item => item.id} contentContainerStyle={styles.list} ListEmptyComponent={<View style={styles.center}><Text style={{ color: tokens.textMuted }}>{search ? 'Ingen samtaler matcher søket.' : status === 'Tilkoblet' ? 'Ingen samtaler ennå. Trykk + for å starte.' : status}</Text></View>}
      refreshControl={<RefreshControl refreshing={refreshing} tintColor={tokens.accent} onRefresh={() => { setRefreshing(true); void matrixCall('refresh').catch(reason => Alert.alert('Matrix', reason.message)).finally(() => setRefreshing(false)); }} />}
      renderItem={({ item }) => <Pressable onPress={() => openRoom(item)} style={({ pressed }) => [styles.rowItem, { backgroundColor: pressed ? tokens.bgHover : tokens.bgCard, borderColor: tokens.border }]}><MatrixAvatar name={item.name} mxc={item.avatar} size={46} /><View style={{ flex: 1, gap: 4 }}><View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>{item.space && <Ionicons name="albums-outline" size={14} color={tokens.textMuted} />}<Text numberOfLines={1} style={{ flex: 1, color: tokens.textPrimary, fontSize: 16, fontFamily: font(item.unread ? 700 : 500) }}>{item.name}</Text></View><Text numberOfLines={1} style={{ color: item.membership === 'invite' ? tokens.accent : tokens.textMuted, fontSize: 13 }}>{item.membership === 'invite' ? 'Du er invitert' : item.space ? item.topic || 'Rom i dette spacet' : item.preview || item.topic || 'Start samtalen'}</Text></View>{item.unread > 0 && <View style={{ minWidth: 23, height: 23, paddingHorizontal: 6, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: tokens.accent }}><Text style={{ color: tokens.accentFg, fontSize: 12, fontFamily: font(700) }}>{item.unread > 99 ? '99+' : item.unread}</Text></View>}</Pressable>} />
  </ThemedBackground>;
}
const styles = StyleSheet.create({ center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }, list: { paddingBottom: 24 }, rowItem: { flexDirection: 'row', alignItems: 'center', gap: 12, marginHorizontal: 12, marginBottom: 6, borderRadius: 18, padding: 14, borderWidth: StyleSheet.hairlineWidth } });
