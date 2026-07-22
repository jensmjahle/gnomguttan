import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  SectionList,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ThemedBackground } from '@/theme/ThemedBackground';
import { useTheme } from '@/theme/useTheme';
import { useAuthStore } from '@/store/authStore';
import { loadCommunityEvents, respondToCommunityEvent } from '@/services/communityEvents';
import {
  EVENT_TYPES,
  formatDateTime,
  getEventDate,
  getEventTimeLabel,
  getEventTypeLabel,
} from '@/utils/communityEvents';
import type { CalendarStackParamList } from '@/navigation/types';
import type { CommunityEvent, EventRsvpStatus } from '@/types';

type Navigation = NativeStackNavigationProp<CalendarStackParamList, 'Calendar'>;
type Filter = 'all' | 'unanswered' | (typeof EVENT_TYPES)[number];

const RSVP_OPTIONS: Array<{ value: EventRsvpStatus; label: string }> = [
  { value: 'coming', label: 'Kommer' },
  { value: 'maybe', label: 'Kanskje' },
  { value: 'cannot', label: 'Kan ikke' },
];

const FILTERS: Array<{ value: Filter; label: string }> = [
  { value: 'all', label: 'Alle' },
  { value: 'unanswered', label: 'Ubesvart' },
  ...EVENT_TYPES.map((value) => ({ value, label: value })),
];

function startOfDay(value: Date): Date {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate());
}

function addDays(value: Date, days: number): Date {
  const next = new Date(value);
  next.setDate(next.getDate() + days);
  return next;
}

function isSameDay(left: Date, right: Date): boolean {
  return left.getFullYear() === right.getFullYear()
    && left.getMonth() === right.getMonth()
    && left.getDate() === right.getDate();
}

function sortByDate(left: CommunityEvent, right: CommunityEvent): number {
  return getEventDate(left).getTime() - getEventDate(right).getTime() || right.createdAt - left.createdAt;
}

export function CalendarScreen() {
  const navigation = useNavigation<Navigation>();
  const { tokens, font, radius } = useTheme();
  const user = useAuthStore((state) => state.user);
  const [events, setEvents] = useState<CommunityEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);
  const [busyEventId, setBusyEventId] = useState<string | null>(null);

  const load = useCallback(async (pull = false) => {
    if (pull) setRefreshing(true);
    else setLoading(true);
    setError('');
    try {
      setEvents(await loadCommunityEvents({ includeDrafts: true }));
    } catch {
      setError('Kunne ikke laste arrangementer.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => {
    void load();
  }, [load]));

  const days = useMemo(() => {
    const today = startOfDay(new Date());
    return Array.from({ length: 35 }, (_, index) => addDays(today, index - 7));
  }, []);

  const filteredEvents = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase('nb-NO');
    return events.filter((event) => {
      if (selectedDay && !isSameDay(getEventDate(event), selectedDay)) return false;
      if (normalizedQuery) {
        const haystack = [event.title, event.location, event.description, getEventTypeLabel(event), event.createdBy.name]
          .filter(Boolean)
          .join(' ')
          .toLocaleLowerCase('nb-NO');
        if (!haystack.includes(normalizedQuery)) return false;
      }
      if (filter === 'unanswered') {
        if (event.status === 'draft' || getEventDate(event) < startOfDay(new Date())) return false;
        return !event.responses.some((response) => response.uid === user?.uid);
      }
      if (filter !== 'all' && (event.eventType?.trim() || 'Sosialt') !== filter) return false;
      return true;
    });
  }, [events, filter, query, selectedDay, user?.uid]);

  const sections = useMemo(() => {
    if (selectedDay) {
      return [{ title: formatDateTime(selectedDay, false).split(',')[0], data: [...filteredEvents].sort(sortByDate) }];
    }
    const today = startOfDay(new Date());
    const nextWeek = addDays(today, 7);
    const drafts = filteredEvents.filter((event) => event.status === 'draft').sort(sortByDate);
    const published = filteredEvents.filter((event) => event.status !== 'draft');
    const next = published.filter((event) => getEventDate(event) >= today && getEventDate(event) < nextWeek).sort(sortByDate);
    const later = published.filter((event) => getEventDate(event) >= nextWeek).sort(sortByDate);
    const previous = published.filter((event) => getEventDate(event) < today).sort((a, b) => sortByDate(b, a));
    return [
      { title: 'Kladder', data: drafts },
      { title: 'Neste uke', data: next },
      { title: 'Senere', data: later },
      { title: 'Tidligere', data: previous },
    ].filter((section) => section.data.length > 0);
  }, [filteredEvents, selectedDay]);

  const unansweredCount = useMemo(
    () => events.filter((event) => event.status !== 'draft'
      && getEventDate(event) >= startOfDay(new Date())
      && !event.responses.some((response) => response.uid === user?.uid)).length,
    [events, user?.uid],
  );

  const assignedTodos = useMemo(
    () => events.flatMap((event) => (event.todos ?? [])
      .filter((todo) => todo.mode === 'assigned' && !todo.completedAt && todo.assignee?.uid === user?.uid)
      .map((todo) => ({ event, todo }))),
    [events, user?.uid],
  );

  const respond = useCallback(async (eventId: string, status: EventRsvpStatus) => {
    if (busyEventId) return;
    setBusyEventId(eventId);
    setError('');
    try {
      const updated = await respondToCommunityEvent(eventId, status);
      setEvents((current) => current.map((event) => event.id === updated.id ? updated : event));
    } catch {
      setError('Kunne ikke lagre svaret ditt.');
    } finally {
      setBusyEventId(null);
    }
  }, [busyEventId]);

  const renderEvent = ({ item }: { item: CommunityEvent }) => {
    const myStatus = item.responses.find((response) => response.uid === user?.uid)?.status;
    const counts = {
      coming: item.responses.filter((response) => response.status === 'coming').length,
      maybe: item.responses.filter((response) => response.status === 'maybe').length,
    };
    return (
      <Pressable
        onPress={() => navigation.navigate('EventDetail', { eventId: item.id, title: item.title || 'Arrangement' })}
        style={({ pressed }) => [
          styles.eventCard,
          {
            backgroundColor: pressed ? tokens.bgHover : tokens.bgCard,
            borderColor: tokens.border,
            borderRadius: radius.lg,
          },
        ]}
      >
        {item.imageUrl ? <Image source={{ uri: item.imageUrl }} style={styles.eventImage} contentFit="cover" /> : null}
        <View style={styles.eventBody}>
          <View style={styles.eventTitleRow}>
            <Text style={[styles.eventTitle, { color: tokens.textPrimary, fontFamily: font(700) }]} numberOfLines={2}>
              {item.title || 'Uten tittel'}
            </Text>
            {item.status === 'draft' ? (
              <Text style={[styles.badge, { color: tokens.warning, borderColor: tokens.warning, fontFamily: font(600) }]}>Kladd</Text>
            ) : null}
          </View>
          <Text style={[styles.meta, { color: tokens.textSecondary, fontFamily: font(500) }]}>{getEventTimeLabel(item)}</Text>
          <Text style={[styles.meta, { color: tokens.textMuted, fontFamily: font(400) }]}>
            {[item.location, getEventTypeLabel(item)].filter(Boolean).join(' · ')}
          </Text>
          <View style={styles.statsRow}>
            <Text style={[styles.stat, { color: tokens.textSecondary, fontFamily: font(500) }]}>{counts.coming} kommer</Text>
            <Text style={[styles.stat, { color: tokens.textSecondary, fontFamily: font(500) }]}>{counts.maybe} kanskje</Text>
          </View>
          {item.status !== 'draft' && getEventDate(item) >= startOfDay(new Date()) ? (
            <View style={styles.rsvpRow}>
              {RSVP_OPTIONS.map((option) => (
                <Pressable
                  key={option.value}
                  onPress={(pressEvent) => {
                    pressEvent.stopPropagation();
                    void respond(item.id, option.value);
                  }}
                  disabled={busyEventId === item.id}
                  style={[
                    styles.rsvpButton,
                    {
                      borderColor: myStatus === option.value ? tokens.accent : tokens.borderStrong,
                      backgroundColor: myStatus === option.value ? tokens.accentMuted : tokens.bgSecondary,
                      borderRadius: radius.md,
                    },
                  ]}
                >
                  <Text style={{ color: myStatus === option.value ? tokens.accent : tokens.textSecondary, fontFamily: font(600), fontSize: 12 }}>
                    {option.label}
                  </Text>
                </Pressable>
              ))}
            </View>
          ) : null}
        </View>
      </Pressable>
    );
  };

  return (
    <ThemedBackground>
      <SectionList
        sections={sections}
        keyExtractor={(item) => item.id}
        renderItem={renderEvent}
        stickySectionHeadersEnabled={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} tintColor={tokens.accent} />}
        contentContainerStyle={styles.content}
        ListHeaderComponent={(
          <View style={styles.headerContent}>
            <View style={styles.topRow}>
              <View>
                <Text style={[styles.heading, { color: tokens.textPrimary, fontFamily: font(700) }]}>Arrangementer</Text>
                <Text style={[styles.subheading, { color: tokens.textSecondary, fontFamily: font(400) }]}>
                  {unansweredCount || assignedTodos.length
                    ? [`${unansweredCount} trenger svar`, assignedTodos.length ? `${assignedTodos.length} tildelte oppgaver` : ''].filter(Boolean).join(' · ')
                    : 'Alt er besvart'}
                </Text>
              </View>
              <Pressable
                onPress={() => navigation.navigate('EventEditor', { eventId: undefined })}
                style={[styles.addButton, { backgroundColor: tokens.accent, borderRadius: radius.full }]}
                accessibilityLabel="Lag nytt arrangement"
              >
                <Ionicons name="add" size={26} color={tokens.accentFg} />
              </Pressable>
            </View>

            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Søk i arrangementer"
              placeholderTextColor={tokens.textMuted}
              style={[styles.search, { color: tokens.textPrimary, backgroundColor: tokens.bgCard, borderColor: tokens.border, borderRadius: radius.md, fontFamily: font(400) }]}
            />

            <FlatList
              horizontal
              data={days}
              keyExtractor={(day) => day.toISOString()}
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.dayList}
              renderItem={({ item }) => {
                const active = selectedDay ? isSameDay(item, selectedDay) : false;
                const today = isSameDay(item, new Date());
                return (
                  <Pressable
                    onPress={() => setSelectedDay(active ? null : item)}
                    style={[
                      styles.day,
                      {
                        backgroundColor: active ? tokens.accent : tokens.bgCard,
                        borderColor: today && !active ? tokens.accent : tokens.border,
                        borderRadius: radius.md,
                      },
                    ]}
                  >
                    <Text style={{ color: active ? tokens.accentFg : tokens.textMuted, fontFamily: font(500), fontSize: 11 }}>
                      {new Intl.DateTimeFormat('nb-NO', { weekday: 'short' }).format(item)}
                    </Text>
                    <Text style={{ color: active ? tokens.accentFg : tokens.textPrimary, fontFamily: font(700), fontSize: 17 }}>
                      {item.getDate()}
                    </Text>
                  </Pressable>
                );
              }}
            />

            <FlatList
              horizontal
              data={FILTERS}
              keyExtractor={(item) => item.value}
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.filterList}
              renderItem={({ item }) => {
                const active = filter === item.value;
                return (
                  <Pressable
                    onPress={() => setFilter(item.value)}
                    style={[
                      styles.filterChip,
                      {
                        backgroundColor: active ? tokens.accentMuted : tokens.bgCard,
                        borderColor: active ? tokens.accent : tokens.border,
                        borderRadius: radius.full,
                      },
                    ]}
                  >
                    <Text style={{ color: active ? tokens.accent : tokens.textSecondary, fontFamily: font(600), fontSize: 12 }}>{item.label}</Text>
                  </Pressable>
                );
              }}
            />
            {assignedTodos.length ? (
              <View style={[styles.alertCard, { backgroundColor: tokens.bgCard, borderColor: tokens.warning, borderRadius: radius.md }]}>
                <Text style={{ color: tokens.warning, fontFamily: font(700), fontSize: 13 }}>Tildelte oppgaver</Text>
                {assignedTodos.slice(0, 4).map(({ event, todo }) => (
                  <Pressable key={`${event.id}:${todo.id}`} onPress={() => navigation.navigate('EventDetail', { eventId: event.id, title: event.title || 'Arrangement' })} style={styles.alertRow}>
                    <Ionicons name="checkbox-outline" size={16} color={tokens.warning} />
                    <Text style={{ color: tokens.textPrimary, fontFamily: font(500), fontSize: 13, flex: 1 }} numberOfLines={1}>{todo.title}</Text>
                    <Text style={{ color: tokens.textMuted, fontFamily: font(400), fontSize: 11 }} numberOfLines={1}>{event.title}</Text>
                  </Pressable>
                ))}
              </View>
            ) : null}
            {error ? <Text style={[styles.error, { color: tokens.error, fontFamily: font(500) }]}>{error}</Text> : null}
            {loading && events.length === 0 ? <ActivityIndicator color={tokens.accent} style={styles.loader} /> : null}
          </View>
        )}
        renderSectionHeader={({ section }) => (
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: tokens.textPrimary, fontFamily: font(700) }]}>{section.title}</Text>
            <Text style={[styles.sectionCount, { color: tokens.textMuted, fontFamily: font(500) }]}>{section.data.length}</Text>
          </View>
        )}
        ListEmptyComponent={!loading ? (
          <View style={styles.empty}>
            <Ionicons name="calendar-outline" size={36} color={tokens.textMuted} />
            <Text style={{ color: tokens.textSecondary, fontFamily: font(500) }}>Ingen arrangementer matcher.</Text>
          </View>
        ) : null}
      />
    </ThemedBackground>
  );
}

const styles = StyleSheet.create({
  content: { paddingBottom: 28 },
  headerContent: { gap: 14, paddingHorizontal: 14, paddingTop: 12, paddingBottom: 8 },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  heading: { fontSize: 24 },
  subheading: { fontSize: 13, marginTop: 2 },
  addButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  search: { minHeight: 44, borderWidth: 1, paddingHorizontal: 14, fontSize: 15 },
  dayList: { gap: 8 },
  day: { width: 48, height: 58, borderWidth: 1, alignItems: 'center', justifyContent: 'center', gap: 2 },
  filterList: { gap: 8 },
  filterChip: { borderWidth: 1, paddingHorizontal: 13, paddingVertical: 8 },
  error: { fontSize: 13 },
  alertCard: { borderWidth: 1, padding: 11, gap: 8 },
  alertRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  loader: { marginVertical: 20 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingTop: 18, paddingBottom: 8 },
  sectionTitle: { fontSize: 18 },
  sectionCount: { fontSize: 13 },
  eventCard: { marginHorizontal: 14, marginBottom: 10, borderWidth: 1, overflow: 'hidden' },
  eventImage: { width: '100%', height: 130 },
  eventBody: { padding: 13, gap: 5 },
  eventTitleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  eventTitle: { fontSize: 17, flex: 1 },
  badge: { fontSize: 10, borderWidth: 1, borderRadius: 10, paddingHorizontal: 7, paddingVertical: 3 },
  meta: { fontSize: 13 },
  statsRow: { flexDirection: 'row', gap: 10, marginTop: 5 },
  stat: { fontSize: 12 },
  rsvpRow: { flexDirection: 'row', gap: 7, marginTop: 7 },
  rsvpButton: { flex: 1, minHeight: 34, borderWidth: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  empty: { alignItems: 'center', gap: 10, paddingVertical: 40 },
});
