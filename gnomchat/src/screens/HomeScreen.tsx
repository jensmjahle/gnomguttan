import { useMemo, useState } from 'react';
import { Alert, FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { ThemedBackground } from '@/theme/ThemedBackground';
import { useTheme } from '@/theme/useTheme';
import { qk } from '@/data/queryClient';
import { useCommunityEvents } from '@/data/events';
import { BLOCKED_MESSAGE, hasBlockingObligation } from '@/data/obligations';
import { loadFeedPage } from '@/services/feed';
import { appApi } from '@/services/appApi';
import { ALL_CATEGORIES, CATEGORY_LABELS, useFeedFilterStore, visibleTypesParam } from '@/store/feedFilterStore';
import { FeedCard } from '@/components/feed/FeedCard';
import { ObligationBanner } from '@/components/ObligationBanner';
import { Button, Card, Chip, Empty, ErrorBox, IconButton, Loading, T } from '@/components/ui';
import { Sheet } from '@/components/Sheet';
import { getEventDate, getEventTimeLabel } from '@/utils/communityEvents';
import { errorText } from '@/services/appApi';
import type { OverheardQuote } from '@/types';

function UpcomingEvents() {
  const { tokens, radius } = useTheme();
  const navigation = useNavigation();
  const { data = [] } = useCommunityEvents();
  const upcoming = useMemo(() => {
    const now = Date.now() - 6 * 3600_000;
    return data.filter((event) => event.status !== 'draft' && getEventDate(event).getTime() >= now).sort((a, b) => getEventDate(a).getTime() - getEventDate(b).getTime()).slice(0, 8);
  }, [data]);
  if (!upcoming.length) return null;
  return (
    <View style={{ gap: 6 }}>
      <T weight={700} size={13} muted style={{ textTransform: 'uppercase', letterSpacing: 0.6 }}>Kommer snart</T>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
        {upcoming.map((event) => (
          <Pressable key={event.id} onPress={() => navigation.navigate('EventDetail', { eventId: event.id, title: event.title })} style={[styles.eventChip, { backgroundColor: tokens.bgCard, borderColor: tokens.border, borderRadius: radius.md }]}>
            <T weight={700} numberOfLines={1}>{event.title}</T>
            <T size={12} muted numberOfLines={1}>{getEventTimeLabel(event)}</T>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

function OverheardTeaser() {
  const navigation = useNavigation();
  const { data = [] } = useQuery({ queryKey: qk.overheard, queryFn: () => appApi.get<OverheardQuote[]>('/overheard'), staleTime: 5 * 60_000 });
  const [index] = useState(() => Math.random());
  if (!data.length) return null;
  const quote = data[Math.floor(index * data.length)];
  return (
    <Card onPress={() => navigation.navigate('Quotes')}>
      <T size={12} muted weight={700}>OVERHØRT</T>
      <T size={16} style={{ fontStyle: 'italic' }}>«{quote.text}»</T>
      <T size={13} muted>— {quote.author}</T>
    </Card>
  );
}

/** Hjem: the website's front page — feed, coming events, overheard and to-dos. */
export function HomeScreen() {
  const { tokens } = useTheme();
  const navigation = useNavigation();
  const enabled = useFeedFilterStore((s) => s.enabled);
  const toggle = useFeedFilterStore((s) => s.toggle);
  const enableAll = useFeedFilterStore((s) => s.enableAll);
  const types = visibleTypesParam(enabled);
  const [filterOpen, setFilterOpen] = useState(false);
  const filtered = Object.values(enabled).some((on) => !on);

  const feed = useInfiniteQuery({
    queryKey: qk.feed(types),
    queryFn: ({ pageParam }) => loadFeedPage(types, pageParam),
    initialPageParam: undefined as number | undefined,
    getNextPageParam: (last) => (last.hasMore && last.items.length ? last.items[last.items.length - 1].sortAt ?? last.items[last.items.length - 1].createdAt : undefined),
    enabled: types.length > 0,
  });
  const items = useMemo(() => {
    const seen = new Set<string>();
    return (feed.data?.pages ?? []).flatMap((page) => page.items).filter((item) => (seen.has(item.id) ? false : (seen.add(item.id), true)));
  }, [feed.data]);

  const newStatus = () => {
    if (hasBlockingObligation()) { Alert.alert('Låst', BLOCKED_MESSAGE); return; }
    navigation.navigate('Statusrapport');
  };

  const header = (
    <View style={{ gap: 12 }}>
      <ObligationBanner />
      <UpcomingEvents />
      <OverheardTeaser />
      <View style={styles.feedHead}>
        <T weight={800} size={20} style={{ flex: 1 }}>Feed</T>
        <IconButton icon={filtered ? 'funnel' : 'funnel-outline'} label="Filtrer feed" color={filtered ? tokens.accent : undefined} onPress={() => setFilterOpen(true)} />
        <Button small title="Statusrapport" icon="add" onPress={newStatus} />
      </View>
      {feed.error && !items.length ? <ErrorBox message={errorText(feed.error, 'Kunne ikke laste feeden.')} onRetry={() => void feed.refetch()} /> : null}
    </View>
  );

  return (
    <ThemedBackground>
      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: 12, gap: 12, paddingBottom: 40 }}
        ListHeaderComponent={header}
        renderItem={({ item }) => <FeedCard item={item} />}
        onEndReachedThreshold={0.6}
        onEndReached={() => { if (feed.hasNextPage && !feed.isFetchingNextPage) void feed.fetchNextPage(); }}
        ListEmptyComponent={feed.isLoading ? <Loading label="Henter feed …" /> : types.length === 0 ? <Empty title="Alt er filtrert bort" text="Slå på noen kategorier i filteret." /> : <Empty title="Ingen innlegg ennå" />}
        ListFooterComponent={feed.isFetchingNextPage ? <Loading /> : null}
        refreshControl={<RefreshControl refreshing={feed.isRefetching && !feed.isFetchingNextPage} onRefresh={() => void feed.refetch()} tintColor={tokens.accent} colors={[tokens.accent]} />}
      />
      <Sheet visible={filterOpen} onClose={() => setFilterOpen(false)} title="Vis i feeden">
        <View style={styles.chips}>
          {ALL_CATEGORIES.map((category) => <Chip key={category} label={CATEGORY_LABELS[category]} selected={enabled[category]} onPress={() => toggle(category)} />)}
        </View>
        {filtered ? <Button variant="ghost" title="Vis alt" onPress={enableAll} /> : null}
      </Sheet>
    </ThemedBackground>
  );
}

const styles = StyleSheet.create({
  feedHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  eventChip: { padding: 10, width: 170, borderWidth: StyleSheet.hairlineWidth, gap: 2 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});
