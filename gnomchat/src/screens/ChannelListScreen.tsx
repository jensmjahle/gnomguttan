import { useEffect, useState } from 'react';
import { View, Text, TextInput, Modal, Switch, StyleSheet, SectionList, Pressable, RefreshControl, ActivityIndicator, Alert } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTheme } from '@/theme/useTheme';
import { ThemedBackground } from '@/theme/ThemedBackground';
import { MatrixLoginScreen } from './MatrixLoginScreen';
import { useMatrixMobileStore } from '@/store/matrixMobileStore';
import { matrixCall } from '@/services/matrix';
import type { RootStackParamList } from '@/navigation/types';
import type { MatrixRoom } from '@/types/matrix';
import { MatrixAvatar } from '@/components/MatrixAvatar';

export function ChannelListScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList, 'Channels'>>();
  const { tokens, font } = useTheme();
  const session = useMatrixMobileStore(s => s.session);
  const hydrated = useMatrixMobileStore(s => s.hydrated);
  const rooms = useMatrixMobileStore(s => s.rooms);
  const status = useMatrixMobileStore(s => s.status);
  const error = useMatrixMobileStore(s => s.error);
  const pendingRoom = useMatrixMobileStore(s => s.pendingRoom);
  const [refreshing, setRefreshing] = useState(false);
  const [adding, setAdding] = useState(false);
  const [target, setTarget] = useState('');
  const [encrypted, setEncrypted] = useState(true);
  const [joining, setJoining] = useState(false);
  useEffect(() => {
    if (!session || !pendingRoom || status !== 'Tilkoblet') return;
    const room = rooms.find(item => item.id === pendingRoom);
    navigation.navigate('Chat', { roomId: pendingRoom, title: room?.name || 'Samtale' });
    useMatrixMobileStore.setState({ pendingRoom: null });
  }, [pendingRoom, session, status, rooms, navigation]);
  if (!hydrated) return <ThemedBackground><View style={styles.center}><ActivityIndicator color={tokens.accent} /></View></ThemedBackground>;
  if (!session) return <MatrixLoginScreen />;
  async function open(room: MatrixRoom) {
    if (room.membership === 'invite') {
      Alert.alert('Invitasjon', `Bli med i ${room.name}?`, [
        { text: 'Avbryt', style: 'cancel' },
        { text: 'Bli med', onPress: () => void matrixCall('join', { id: room.id }).catch(reason => Alert.alert('Kunne ikke bli med', reason.message)) },
      ]); return;
    }
    navigation.navigate('Chat', { roomId: room.id, title: room.name });
  }
  return <ThemedBackground>
    <Pressable onPress={() => setAdding(true)} style={{ padding: 16 }}><Text style={{ color: tokens.accent, fontFamily: font(600) }}>＋ Ny samtale eller bli med i rom</Text></Pressable>
    <Modal visible={adding} transparent animationType="fade" onRequestClose={() => setAdding(false)}>
      <View style={{ flex: 1, justifyContent: 'center', padding: 24, backgroundColor: 'rgba(0,0,0,0.5)' }}>
        <View style={{ backgroundColor: tokens.bgCard, borderColor: tokens.border, borderWidth: 1, borderRadius: 12, padding: 24, gap: 16 }}>
          <Text style={{ color: tokens.textPrimary, fontFamily: font(700), fontSize: 18 }}>Ny samtale</Text>
          <TextInput value={target} onChangeText={setTarget} autoCapitalize="none" autoCorrect={false} placeholder="@bruker:server eller #rom:server" placeholderTextColor={tokens.textMuted} style={{ color: tokens.textPrimary, borderWidth: 1, borderColor: tokens.border, borderRadius: 8, padding: 12 }} />
          {target.startsWith('@') && <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}><Text style={{ color: tokens.textPrimary }}>Kryptert samtale</Text><Switch value={encrypted} onValueChange={setEncrypted} /></View>}
          <Pressable disabled={joining || !target.trim()} onPress={() => {
            setJoining(true); void matrixCall<string>('conversation', { target: target.trim(), encrypted }).then(id => {
              setAdding(false); setTarget(''); navigation.navigate('Chat', { roomId: id, title: target });
            }).catch(reason => Alert.alert('Kunne ikke åpne samtalen', reason.message)).finally(() => setJoining(false));
          }}><Text style={{ color: tokens.accent, fontFamily: font(600) }}>{joining ? 'Venter …' : 'Åpne samtale'}</Text></Pressable>
          <Pressable onPress={() => setAdding(false)}><Text style={{ color: tokens.textMuted }}>Avbryt</Text></Pressable>
        </View>
      </View>
    </Modal>
    {(status !== 'Tilkoblet' || error) && <View style={{ padding: 12 }}><Text style={{ color: error ? tokens.error : tokens.textMuted }}>{error || status}</Text></View>}
    <SectionList sections={[{ title: 'Channels', data: rooms.filter(room => !room.direct) }, { title: 'Direct messages', data: rooms.filter(room => room.direct) }]}
      keyExtractor={item => item.id} contentContainerStyle={styles.list}
      ListEmptyComponent={<View style={styles.center}><Text style={{ color: tokens.textMuted }}>{status === 'Tilkoblet' ? 'Ingen samtaler ennå.' : status}</Text></View>}
      refreshControl={<RefreshControl refreshing={refreshing} tintColor={tokens.accent} onRefresh={() => {
        setRefreshing(true); void matrixCall('refresh').catch(reason => Alert.alert('Matrix', reason.message)).finally(() => setRefreshing(false));
      }} />}
      renderSectionHeader={({ section }) => section.data.length ? <Text style={[styles.sectionHeader, { color: tokens.textSecondary, fontFamily: font(700), backgroundColor: tokens.bgSecondary }]}>{section.title}</Text> : null}
      renderItem={({ item }) => <Pressable onPress={() => void open(item)} style={({ pressed }) => [styles.rowItem, { backgroundColor: pressed ? tokens.bgHover : tokens.bgCard, borderColor: tokens.border }]}>
        <MatrixAvatar name={item.name} mxc={item.avatar} size={40} />
        <View style={{ flex: 1 }}><Text numberOfLines={1} style={[styles.rowName, { color: tokens.textPrimary, fontFamily: font(item.unread ? 700 : 500) }]}>{item.name}</Text>
          {item.membership === 'invite' && <Text style={{ color: tokens.accent, fontSize: 12 }}>Invitasjon</Text>}
        </View>
        {item.unread > 0 && <View style={[styles.unreadDot, { backgroundColor: tokens.accent }]} />}
      </Pressable>} />
  </ThemedBackground>;
}
const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }, list: { paddingBottom: 24 },
  sectionHeader: { fontSize: 13, paddingHorizontal: 16, paddingVertical: 6, textTransform: 'uppercase', letterSpacing: 0.5 },
  rowItem: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  avatar: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' }, rowName: { fontSize: 16, flex: 1 }, unreadDot: { width: 10, height: 10, borderRadius: 5 },
});
