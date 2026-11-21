import { useLayoutEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, TextInput, View } from 'react-native';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/theme/useTheme';
import { ThemedBackground } from '@/theme/ThemedBackground';
import { useMatrixSession, useMatrixStore } from '@/matrix/store';
import { MatrixLogin } from '@/components/chat/MatrixLogin';
import { MatrixAvatar } from '@/components/chat/MatrixAvatar';
import { HeaderActions } from '@/components/HeaderActions';
import { Badge, Chip, Empty, IconButton, T } from '@/components/ui';
import type { TabParamList } from '@/navigation/types';
import type { RoomSummary } from '@/matrix/protocol.generated';

type Filter = 'all' | 'unread' | 'dm' | 'rooms';

const STATUS_TEXT: Record<string, string> = {
  stopped: 'Ikke tilkoblet', starting: 'Starter …', crypto: 'Klargjør kryptering …', syncing: 'Synkroniserer …', online: '', offline: 'Frakoblet – viser lagrede meldinger', error: 'Feil i chatten',
};

function timeLabel(ts: number) {
  if (!ts || ts < 0) return '';
  const date = new Date(ts);
  const today = new Date();
  if (date.toDateString() === today.toDateString()) return date.toLocaleTimeString('nb-NO', { hour: '2-digit', minute: '2-digit' });
  if (today.getTime() - ts < 6 * 86400_000) return date.toLocaleDateString('nb-NO', { weekday: 'short' });
  return date.toLocaleDateString('nb-NO', { day: 'numeric', month: 'short' });
}

function RoomRow({ room }: { room: RoomSummary }) {
  const { tokens } = useTheme();
  const navigation = useNavigation();
  const open = () => (room.isSpace ? navigation.navigate('ChatSpace', { roomId: room.roomId, title: room.name }) : navigation.navigate('ChatRoom', { roomId: room.roomId, title: room.name }));
  const unread = room.membership === 'invite' ? 1 : room.unread;
  return (
    <Pressable onPress={open} style={({ pressed }) => [styles.row, pressed && { backgroundColor: tokens.bgHover }]}>
      <MatrixAvatar name={room.name} avatar={room.avatar} size={48} square={room.isSpace} />
      <View style={{ flex: 1, gap: 2 }}>
        <View style={styles.rowTop}>
          {room.encrypted ? <Ionicons name="lock-closed" size={11} color={tokens.textMuted} /> : null}
          <T weight={unread ? 800 : 600} numberOfLines={1} style={{ flex: 1 }}>{room.name}</T>
          <T size={11} muted>{timeLabel(room.lastTs)}</T>
        </View>
        <View style={styles.rowTop}>
          <T size={13} muted={!unread} numberOfLines={1} style={{ flex: 1 }}>
            {room.membership === 'invite' ? `${room.inviter ? `${room.inviter} inviterte deg` : 'Du er invitert'}` : room.preview}
          </T>
          {room.highlight > 0 ? <T size={12} weight={800} color={tokens.error}>@</T> : null}
          <Badge count={unread} />
        </View>
      </View>
    </Pressable>
  );
}

/** Chat: every Matrix room, DM and space you're in, newest activity first. */
export function ChatListScreen({ navigation }: BottomTabScreenProps<TabParamList, 'ChatTab'>) {
  const { tokens, radius, font } = useTheme();
  const session = useMatrixSession((s) => s.session);
  const rooms = useMatrixStore((s) => s.rooms);
  const status = useMatrixStore((s) => s.status);
  const statusDetail = useMatrixStore((s) => s.statusDetail);
  const engineError = useMatrixStore((s) => s.engineError);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const nav = useNavigation();

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          {session ? <IconButton icon="create-outline" label="Ny samtale" onPress={() => nav.navigate('ChatNew')} /> : null}
          {session ? <IconButton icon="settings-outline" label="Chatinnstillinger" onPress={() => nav.navigate('ChatSettings')} /> : null}
          <HeaderActions />
        </View>
      ),
    });
  }, [navigation, nav, session]);

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rooms.filter((room) => {
      if (q && !room.name.toLowerCase().includes(q)) return false;
      if (filter === 'unread') return room.unread > 0 || room.membership === 'invite';
      if (filter === 'dm') return room.isDirect;
      if (filter === 'rooms') return !room.isDirect;
      return true;
    });
  }, [rooms, search, filter]);

  if (!session) return <MatrixLogin />;

  const statusText = engineError ?? (status === 'error' ? statusDetail || STATUS_TEXT.error : STATUS_TEXT[status]);

  return (
    <ThemedBackground>
      <FlatList
        data={shown}
        keyExtractor={(room) => room.roomId}
        renderItem={({ item }) => <RoomRow room={item} />}
        ItemSeparatorComponent={() => <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: tokens.border, marginLeft: 76 }} />}
        ListHeaderComponent={
          <View style={{ padding: 12, gap: 10 }}>
            {statusText ? <T size={12} muted style={{ textAlign: 'center' }}>{statusText}</T> : null}
            <View style={[styles.search, { backgroundColor: tokens.bgSecondary, borderRadius: radius.md }]}>
              <Ionicons name="search" size={16} color={tokens.textMuted} />
              <TextInput value={search} onChangeText={setSearch} placeholder="Søk i samtaler" placeholderTextColor={tokens.textMuted} style={{ flex: 1, color: tokens.textPrimary, fontFamily: font(400), paddingVertical: 8 }} />
            </View>
            <View style={{ flexDirection: 'row', gap: 6 }}>
              <Chip label="Alle" selected={filter === 'all'} onPress={() => setFilter('all')} />
              <Chip label="Uleste" selected={filter === 'unread'} onPress={() => setFilter('unread')} />
              <Chip label="Direkte" selected={filter === 'dm'} onPress={() => setFilter('dm')} />
              <Chip label="Rom" selected={filter === 'rooms'} onPress={() => setFilter('rooms')} />
            </View>
          </View>
        }
        ListEmptyComponent={<Empty icon="chatbubbles-outline" title={rooms.length ? 'Ingen samtaler passer' : status === 'online' ? 'Ingen samtaler ennå' : 'Henter samtaler …'} text={rooms.length ? undefined : 'Start en direktemelding eller bli med i et rom.'} />}
        contentContainerStyle={{ paddingBottom: 40 }}
      />
    </ThemedBackground>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 10 },
  rowTop: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  search: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 10 },
});
