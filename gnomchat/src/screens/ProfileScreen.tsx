import { useLayoutEffect, useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useTheme } from '@/theme/useTheme';
import { qk } from '@/data/queryClient';
import { useAuthStore } from '@/store/authStore';
import { useFeedFilterStore, visibleTypesParam } from '@/store/feedFilterStore';
import { getProfile, getProfileEvents, getQuotesAbout, loadProfileFeed } from '@/services/profiles';
import { errorText } from '@/services/appApi';
import { PROFILE_FIELDS, formatFieldValue } from '@/utils/profileFields.generated';
import { formatRelativeTime } from '@/utils/relativeTime.generated';
import { Avatar } from '@/components/Avatar';
import { FeedCard } from '@/components/feed/FeedCard';
import { Button, Card, Divider, ErrorBox, IconButton, Loading, Row, Screen, Section, T } from '@/components/ui';
import type { RootStackParamList } from '@/navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Profile'>;

/** Someone's profile (or your own): bio, details, quotes about them, events and posts. */
export function ProfileScreen({ navigation, route }: Props) {
  const { tokens } = useTheme();
  const me = useAuthStore((s) => s.user);
  const uid = route.params?.uid ?? me?.uid ?? 0;
  const own = uid === me?.uid;
  const types = visibleTypesParam(useFeedFilterStore((s) => s.enabled));
  const profile = useQuery({ queryKey: qk.profile(uid), queryFn: () => getProfile(uid), enabled: uid > 0 });
  const quotes = useQuery({ queryKey: qk.profileQuotes(uid), queryFn: () => getQuotesAbout(uid), enabled: uid > 0 });
  const events = useQuery({ queryKey: qk.profileEvents(uid), queryFn: () => getProfileEvents(uid), enabled: uid > 0 });
  const posts = useInfiniteQuery({
    queryKey: ['profileFeed', uid, types],
    queryFn: ({ pageParam }) => loadProfileFeed(uid, types, pageParam),
    initialPageParam: undefined as number | undefined,
    getNextPageParam: (last) => (last.hasMore ? last.items[last.items.length - 1]?.createdAt : undefined),
    enabled: uid > 0 && types.length > 0,
  });
  const [quoteIndex, setQuoteIndex] = useState(0);
  const items = useMemo(() => (posts.data?.pages ?? []).flatMap((page) => page.items), [posts.data]);

  useLayoutEffect(() => {
    navigation.setOptions({
      title: profile.data?.name ?? 'Profil',
      headerRight: own ? () => <IconButton icon="create-outline" label="Rediger profil" onPress={() => navigation.navigate('ProfileEdit')} /> : undefined,
    });
  }, [navigation, own, profile.data?.name]);

  const p = profile.data;
  if (!p) return <Screen>{profile.error ? <ErrorBox message={errorText(profile.error, 'Fant ikke profilen.')} onRetry={() => void profile.refetch()} /> : <Loading />}</Screen>;

  const quoteList = quotes.data?.quotes ?? [];
  const quote = quoteList.length ? quoteList[quoteIndex % quoteList.length] : null;
  const fields = PROFILE_FIELDS.filter((def) => p.fields?.[def.key]);

  return (
    <Screen refreshing={profile.isRefetching} onRefresh={() => { void profile.refetch(); void quotes.refetch(); void events.refetch(); void posts.refetch(); }} onScroll={({ nativeEvent }) => {
      if (nativeEvent.layoutMeasurement.height + nativeEvent.contentOffset.y > nativeEvent.contentSize.height - 400 && posts.hasNextPage && !posts.isFetchingNextPage) void posts.fetchNextPage();
    }} scrollEventThrottle={300}>
      <Card style={{ alignItems: 'center', gap: 6, paddingVertical: 20 }}>
        <Avatar uid={p.uid} name={p.name} avatarUpdatedAt={p.avatarUpdatedAt} size={96} />
        <T weight={800} size={24}>{p.name}</T>
        {p.fullName ? <T muted>{p.fullName}</T> : null}
        {p.bio ? <T style={{ textAlign: 'center' }}>{p.bio}</T> : null}
        <T size={12} muted>{p.isAdmin ? 'Administrator · ' : ''}{p.lastSeenAt ? `Sist sett ${formatRelativeTime(p.lastSeenAt)}` : ''}</T>
        {own ? <Button small variant="secondary" icon="create-outline" title="Rediger profil" onPress={() => navigation.navigate('ProfileEdit')} /> : null}
      </Card>

      {fields.length || p.email ? (
        <Section title="Detaljer">
          {p.email ? <Row title="E-post" subtitle={p.email} chevron={false} /> : null}
          {fields.map((def, index) => <View key={def.key}>{index || p.email ? <Divider /> : null}<Row title={def.label} subtitle={formatFieldValue(def, p.fields[def.key]!)} chevron={false} /></View>)}
        </Section>
      ) : null}

      {quote ? (
        <Card>
          <T size={12} muted weight={700}>SITATER OM {(quotes.data?.firstName ?? p.name).toUpperCase()}</T>
          <T size={17} style={{ fontStyle: 'italic' }}>«{quote.text}»</T>
          <T size={13} muted>— {quote.author}</T>
          {quoteList.length > 1 ? <Pressable onPress={() => setQuoteIndex((i) => i + 1)}><T size={13} color={tokens.accent} weight={600}>Neste sitat ({(quoteIndex % quoteList.length) + 1}/{quoteList.length})</T></Pressable> : null}
        </Card>
      ) : null}

      {events.data && (events.data.upcoming.length || events.data.previous.length) ? (
        <Section title="Arrangementer">
          {[...events.data.upcoming.map((e) => ({ ...e, upcoming: true })), ...events.data.previous.slice(0, 5).map((e) => ({ ...e, upcoming: false }))].map((event, index) => (
            <View key={event.id}>
              {index ? <Divider /> : null}
              <Row icon={event.upcoming ? 'calendar' : 'time-outline'} title={event.title} subtitle={`${event.startsAt ? new Date(event.startsAt).toLocaleDateString('nb-NO', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Tidspunkt foreslås'}${event.organizer ? ' · arrangør' : ''} · ${event.coming} kommer`} onPress={() => navigation.navigate('EventDetail', { eventId: event.id, title: event.title })} />
            </View>
          ))}
        </Section>
      ) : null}

      <T weight={800} size={18}>Innlegg</T>
      {items.map((item) => <FeedCard key={item.id} item={item} />)}
      {posts.isLoading || posts.isFetchingNextPage ? <Loading /> : null}
      {!posts.isLoading && !items.length ? <T muted>Ingen innlegg ennå.</T> : null}
    </Screen>
  );
}
