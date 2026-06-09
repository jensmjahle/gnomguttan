import { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, SectionList, Pressable, RefreshControl, ActivityIndicator } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Avatar } from '@/components/Avatar';
import { GroupAvatar } from '@/components/GroupAvatar';
import { useTheme } from '@/theme/useTheme';
import { ThemedBackground } from '@/theme/ThemedBackground';
import { vocechatService } from '@/services/vocechat';
import { useChatStore, groupThreadKey, dmThreadKey, lastActivityOf } from '@/store/chatStore';
import { useAuthStore } from '@/store/authStore';
import type { RootStackParamList } from '@/navigation/types';
import type { Group, UserInfo } from '@/types';

type Nav = NativeStackNavigationProp<RootStackParamList, 'Channels'>;

interface ChannelRow {
  kind: 'group' | 'dm';
  id: number;
  name: string;
  avatarUpdatedAt?: number;
  threadKey: ReturnType<typeof groupThreadKey>;
}

export function ChannelListScreen() {
  const navigation = useNavigation<Nav>();
  const { tokens, font } = useTheme();
  const myUid = useAuthStore((s) => s.user?.uid);

  const groups = useChatStore((s) => s.groups);
  const messages = useChatStore((s) => s.messages);
  const setGroups = useChatStore((s) => s.setGroups);
  const cacheUsers = useChatStore((s) => s.cacheUsers);
  const [dmUsers, setDmUsers] = useState<UserInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const [groupList, users] = await Promise.all([
        vocechatService.getGroups(),
        vocechatService.listUsers().catch(() => [] as UserInfo[]),
      ]);
      setGroups(groupList);
      cacheUsers(users);
      const dms = users.filter((u) => u.uid !== myUid && !u.is_bot);
      setDmUsers(dms);

      // Prefetch each thread's latest message (limit 1) in the background so the
      // list can sort by recency immediately. Non-destructive: prependHistory
      // merges into whatever the SSE stream may already have added.
      const { prependHistory } = useChatStore.getState();
      groupList.forEach((g) => {
        vocechatService
          .getGroupHistory(g.gid, undefined, 1)
          .then((h) => h.length && prependHistory(groupThreadKey(g.gid), h))
          .catch(() => {});
      });
      dms.forEach((u) => {
        vocechatService
          .getUserHistory(u.uid, undefined, 1)
          .then((h) => h.length && prependHistory(dmThreadKey(u.uid), h))
          .catch(() => {});
      });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [setGroups, cacheUsers, myUid]);

  useEffect(() => {
    void load();
  }, [load]);

  // Sort by most recent activity first; threads with no known messages keep a
  // stable alphabetical order at the bottom. Recency updates live as the SSE
  // stream and opened chats fill the message store.
  const byRecency = (rows: ChannelRow[]) =>
    [...rows].sort((a, b) => {
      const diff = lastActivityOf(messages, b.threadKey) - lastActivityOf(messages, a.threadKey);
      return diff !== 0 ? diff : a.name.localeCompare(b.name);
    });

  const sections = [
    {
      title: 'Channels',
      data: byRecency(
        groups.map((g: Group): ChannelRow => ({
          kind: 'group',
          id: g.gid,
          name: g.name,
          avatarUpdatedAt: g.avatar_updated_at,
          threadKey: groupThreadKey(g.gid),
        })),
      ),
    },
    {
      title: 'Direct messages',
      data: byRecency(
        dmUsers.map((u): ChannelRow => ({
          kind: 'dm',
          id: u.uid,
          name: u.name,
          avatarUpdatedAt: u.avatar_updated_at,
          threadKey: dmThreadKey(u.uid),
        })),
      ),
    },
  ];

  const openRow = (row: ChannelRow) => {
    if (row.kind === 'group') {
      navigation.navigate('Chat', { threadKey: row.threadKey, title: row.name, gid: row.id });
    } else {
      navigation.navigate('Chat', { threadKey: row.threadKey, title: row.name, uid: row.id });
    }
  };

  return (
    <ThemedBackground>
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={tokens.accent} />
        </View>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(item) => `${item.kind}:${item.id}`}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                void load();
              }}
              tintColor={tokens.accent}
            />
          }
          renderSectionHeader={({ section }) =>
            section.data.length ? (
              <Text style={[styles.sectionHeader, { color: tokens.textSecondary, fontFamily: font(700), backgroundColor: tokens.bgSecondary }]}>
                {section.title}
              </Text>
            ) : null
          }
          renderItem={({ item }) => (
            <Pressable
              onPress={() => openRow(item)}
              style={({ pressed }) => [
                styles.rowItem,
                { backgroundColor: pressed ? tokens.bgHover : tokens.bgCard, borderColor: tokens.border },
              ]}
            >
              {item.kind === 'dm' ? (
                <Avatar uid={item.id} name={item.name} avatarUpdatedAt={item.avatarUpdatedAt} size={40} />
              ) : (
                <GroupAvatar gid={item.id} avatarUpdatedAt={item.avatarUpdatedAt} size={40} />
              )}
              <Text style={[styles.rowName, { color: tokens.textPrimary, fontFamily: font(500) }]} numberOfLines={1}>
                {item.name}
              </Text>
            </Pressable>
          )}
        />
      )}
    </ThemedBackground>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  list: { paddingBottom: 24 },
  sectionHeader: { fontSize: 13, paddingHorizontal: 16, paddingVertical: 6, textTransform: 'uppercase', letterSpacing: 0.5 },
  rowItem: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  groupIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  rowName: { fontSize: 16, flex: 1 },
});
