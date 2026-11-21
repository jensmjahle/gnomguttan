import { useLayoutEffect, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useTheme } from '@/theme/useTheme';
import { ThemedBackground } from '@/theme/ThemedBackground';
import { qk, queryClient } from '@/data/queryClient';
import { loadNotifications, markAllNotificationsRead, openNotification } from '@/services/notifications';
import { describeNotification } from '@/utils/notificationText.generated';
import { formatRelativeTime } from '@/utils/relativeTime.generated';
import { Avatar } from '@/components/Avatar';
import { Button, Empty, ErrorBox, IconButton, Loading, T } from '@/components/ui';
import { errorText } from '@/services/appApi';
import type { RootStackParamList } from '@/navigation/types';
import type { AppNotification, NotificationPage } from '@/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Notifications'>;

function Item({ notification }: { notification: AppNotification }) {
  const { tokens, radius } = useTheme();
  const { actors, action, icon } = describeNotification(notification);
  const unread = notification.readAt === null;
  const first = notification.actors[0];
  return (
    <Pressable onPress={() => openNotification(notification)} style={({ pressed }) => [styles.item, { backgroundColor: unread ? tokens.accentMuted : tokens.bgCard, borderRadius: radius.md, opacity: pressed ? 0.8 : 1 }]}>
      <View>
        {first ? <Avatar uid={first.uid} name={first.name} avatarUpdatedAt={first.avatarUpdatedAt} size={38} /> : null}
        <View style={[styles.icon, { backgroundColor: tokens.bgCard }]}><T size={12}>{icon}</T></View>
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <T size={14}><T size={14} weight={700}>{actors}</T> {action}</T>
        {notification.snippet ? <T size={13} muted numberOfLines={2}>«{notification.snippet}»</T> : null}
        <T size={11} muted>{formatRelativeTime(notification.updatedAt)}</T>
      </View>
      {unread ? <View style={[styles.dot, { backgroundColor: tokens.accent }]} /> : null}
    </Pressable>
  );
}

export function NotificationsScreen({ navigation }: Props) {
  const { tokens } = useTheme();
  const { data, isLoading, error, refetch, isRefetching } = useQuery({ queryKey: qk.notifications, queryFn: () => loadNotifications() });
  const [more, setMore] = useState<AppNotification[]>([]);
  const [hasMore, setHasMore] = useState<boolean | null>(null);
  const items = [...(data?.items ?? []), ...more.filter((item) => !data?.items.some((other) => other.id === item.id))];

  useLayoutEffect(() => {
    navigation.setOptions({ headerRight: () => <IconButton icon="settings-outline" label="Varslingsinnstillinger" onPress={() => navigation.navigate('NotificationSettings')} /> });
  }, [navigation]);

  const loadMore = async () => {
    const last = items[items.length - 1];
    if (!last || hasMore === false) return;
    const page = await loadNotifications(last.updatedAt).catch(() => null);
    if (!page) return;
    setMore((current) => [...current, ...page.items]);
    setHasMore(page.hasMore);
  };

  const readAll = async () => {
    queryClient.setQueryData<NotificationPage>(qk.notifications, (page) => page && { ...page, unreadCount: 0, items: page.items.map((item) => ({ ...item, readAt: item.readAt ?? Date.now() })) });
    setMore((current) => current.map((item) => ({ ...item, readAt: item.readAt ?? Date.now() })));
    await markAllNotificationsRead().catch(() => {});
  };

  return (
    <ThemedBackground>
      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: 12, gap: 8, paddingBottom: 40 }}
        renderItem={({ item }) => <Item notification={item} />}
        ListHeaderComponent={
          <View style={{ gap: 8 }}>
            {error && !data ? <ErrorBox message={errorText(error)} onRetry={() => void refetch()} /> : null}
            {(data?.unreadCount ?? 0) > 0 ? <Button variant="ghost" small title="Merk alle som lest" icon="checkmark-done" onPress={() => void readAll()} /> : null}
          </View>
        }
        ListEmptyComponent={isLoading ? <Loading /> : <Empty icon="notifications-outline" title="Ingen varsler" text="Når noen nevner deg, svarer deg eller reagerer, dukker det opp her." />}
        onEndReached={() => { if ((data?.hasMore || hasMore) && hasMore !== false) void loadMore(); }}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => { setMore([]); setHasMore(null); void refetch(); }} tintColor={tokens.accent} colors={[tokens.accent]} />}
      />
    </ThemedBackground>
  );
}

const styles = StyleSheet.create({
  item: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10 },
  icon: { position: 'absolute', right: -4, bottom: -4, width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  dot: { width: 8, height: 8, borderRadius: 4 },
});
