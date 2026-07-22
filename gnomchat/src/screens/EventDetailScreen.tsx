import { useCallback, useMemo, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Avatar } from '@/components/Avatar';
import { ThemedBackground } from '@/theme/ThemedBackground';
import { useTheme } from '@/theme/useTheme';
import { useAuthStore } from '@/store/authStore';
import { vocechatService } from '@/services/vocechat';
import {
  loadCommunityEvent,
  respondToCommunityEvent,
  saveCommunityEvent,
} from '@/services/communityEvents';
import {
  albumMediaFileUrl,
  createAlbum,
  loadAlbum,
  loadAlbumForEvent,
} from '@/services/albums';
import {
  canEditEvent,
  formatDateTime,
  formatDateTimeInput,
  formatDateRange,
  generateId,
  getEventTimeLabel,
  getEventTypeLabel,
  isEventFinished,
  parseDateTimeInput,
  userInfoToEventPerson,
} from '@/utils/communityEvents';
import type { CalendarStackParamList } from '@/navigation/types';
import type {
  AlbumMedia,
  AlbumSummary,
  CommunityEvent,
  CommunityEventComment,
  CommunityEventInput,
  CommunityEventPerson,
  CommunityEventTimeProposal,
  CommunityEventTodo,
  EventRsvpStatus,
} from '@/types';

type Route = RouteProp<CalendarStackParamList, 'EventDetail'>;
type Navigation = NativeStackNavigationProp<CalendarStackParamList, 'EventDetail'>;

const RSVP_OPTIONS: Array<{ value: EventRsvpStatus; label: string }> = [
  { value: 'coming', label: 'Kommer' },
  { value: 'maybe', label: 'Kanskje' },
  { value: 'cannot', label: 'Kan ikke' },
];

function Section({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  const { tokens, font, radius } = useTheme();
  return (
    <View style={[styles.section, { backgroundColor: tokens.bgCard, borderColor: tokens.border, borderRadius: radius.lg }]}>
      <View style={styles.sectionHeader}>
        <Text style={[styles.sectionTitle, { color: tokens.textPrimary, fontFamily: font(700) }]}>{title}</Text>
        {action}
      </View>
      <View style={styles.sectionBody}>{children}</View>
    </View>
  );
}

function SmallButton({
  label,
  onPress,
  active = false,
  danger = false,
  disabled = false,
}: {
  label: string;
  onPress: () => void;
  active?: boolean;
  danger?: boolean;
  disabled?: boolean;
}) {
  const { tokens, font, radius } = useTheme();
  const color = danger ? tokens.error : active ? tokens.accent : tokens.textSecondary;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={[
        styles.smallButton,
        {
          backgroundColor: active ? tokens.accentMuted : tokens.bgSecondary,
          borderColor: color,
          borderRadius: radius.md,
          opacity: disabled ? 0.45 : 1,
        },
      ]}
    >
      <Text style={{ color, fontFamily: font(600), fontSize: 12 }}>{label}</Text>
    </Pressable>
  );
}

function PersonChip({ person }: { person: CommunityEventPerson }) {
  const { tokens, font, radius } = useTheme();
  return (
    <View style={[styles.personChip, { backgroundColor: tokens.bgSecondary, borderColor: tokens.border, borderRadius: radius.full }]}>
      <Avatar uid={person.uid} name={person.name} avatarUpdatedAt={person.avatarUpdatedAt} size={24} />
      <Text style={{ color: tokens.textSecondary, fontFamily: font(500), fontSize: 12 }} numberOfLines={1}>{person.name}</Text>
    </View>
  );
}

export function EventDetailScreen() {
  const route = useRoute<Route>();
  const navigation = useNavigation<Navigation>();
  const { eventId } = route.params;
  const { tokens, font, radius } = useTheme();
  const user = useAuthStore((state) => state.user);

  const [event, setEvent] = useState<CommunityEvent | null>(null);
  const [users, setUsers] = useState<CommunityEventPerson[]>([]);
  const [album, setAlbum] = useState<AlbumSummary | null>(null);
  const [albumMedia, setAlbumMedia] = useState<AlbumMedia[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [historyView, setHistoryView] = useState(true);

  const [commentText, setCommentText] = useState('');
  const [pollQuestion, setPollQuestion] = useState('');
  const [pollOptions, setPollOptions] = useState(['', '']);
  const [pollAllowMultiple, setPollAllowMultiple] = useState(false);
  const [todoTitle, setTodoTitle] = useState('');
  const [todoMode, setTodoMode] = useState<CommunityEventTodo['mode']>('open');
  const [todoAssigneeUid, setTodoAssigneeUid] = useState<number | null>(null);
  const [proposalStart, setProposalStart] = useState(() => formatDateTimeInput(new Date(Date.now() + 60 * 60 * 1000)));
  const [proposalEnd, setProposalEnd] = useState(() => formatDateTimeInput(new Date(Date.now() + 2 * 60 * 60 * 1000)));

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [loadedEvent, loadedUsers, foundAlbum] = await Promise.all([
        loadCommunityEvent(eventId),
        vocechatService.listUsers().catch(() => []),
        loadAlbumForEvent(eventId).catch(() => null),
      ]);
      setEvent(loadedEvent);
      setUsers(loadedUsers.filter((candidate) => !candidate.is_bot).map(userInfoToEventPerson));
      setAlbum(foundAlbum);
      if (foundAlbum) {
        const fullAlbum = await loadAlbum(foundAlbum.id).catch(() => null);
        setAlbumMedia(fullAlbum?.media ?? []);
      } else {
        setAlbumMedia([]);
      }
    } catch {
      setError('Fant ikke arrangementet.');
    } finally {
      setLoading(false);
    }
  }, [eventId]);

  useFocusEffect(useCallback(() => {
    void load();
  }, [load]));

  const usersByUid = useMemo(() => new Map(users.map((person) => [person.uid, person] as const)), [users]);
  const currentPerson = useMemo<CommunityEventPerson | null>(() => {
    if (!user) return null;
    return { uid: user.uid, name: user.name, ...(user.avatarUpdatedAt ? { avatarUpdatedAt: user.avatarUpdatedAt } : {}) };
  }, [user]);

  const editable = event ? canEditEvent(event, user) : false;
  const finished = event ? isEventFinished(event) : false;
  const showHistory = finished && historyView;
  const comments = event?.comments ?? [];
  const todos = event?.todos ?? [];
  const proposals = event?.timeProposals ?? [];
  const myResponse = event?.responses.find((response) => response.uid === user?.uid)?.status;

  const participants = useMemo(() => {
    const groups: Record<EventRsvpStatus, CommunityEventPerson[]> = { coming: [], maybe: [], cannot: [] };
    for (const response of event?.responses ?? []) {
      groups[response.status].push(usersByUid.get(response.uid) ?? { uid: response.uid, name: response.name });
    }
    return groups;
  }, [event?.responses, usersByUid]);

  const nonResponders = useMemo(() => {
    const responded = new Set(event?.responses.map((response) => response.uid) ?? []);
    return users.filter((person) => !responded.has(person.uid));
  }, [event?.responses, users]);

  const persist = useCallback(async (patch: Partial<CommunityEventInput>, action = 'save') => {
    if (!event || busy) return null;
    setBusy(action);
    setError('');
    try {
      const updated = await saveCommunityEvent(event.id, patch);
      setEvent(updated);
      return updated;
    } catch {
      setError('Kunne ikke lagre endringen.');
      return null;
    } finally {
      setBusy(null);
    }
  }, [busy, event]);

  const respond = useCallback(async (status: EventRsvpStatus) => {
    if (!event || busy) return;
    setBusy(`respond:${status}`);
    setError('');
    try {
      setEvent(await respondToCommunityEvent(event.id, status));
    } catch {
      setError('Kunne ikke oppdatere svaret.');
    } finally {
      setBusy(null);
    }
  }, [busy, event]);

  const voteProposal = useCallback((proposalId: string) => {
    if (!user) return;
    const next = proposals.map((proposal) => proposal.id === proposalId
      ? { ...proposal, votes: proposal.votes.includes(user.uid) ? proposal.votes.filter((uid) => uid !== user.uid) : [...proposal.votes, user.uid] }
      : proposal);
    void persist({ timeProposals: next });
  }, [persist, proposals, user]);

  const addProposal = useCallback(() => {
    const startsAt = parseDateTimeInput(proposalStart);
    const endsAt = parseDateTimeInput(proposalEnd);
    if (!startsAt || !endsAt) {
      setError('Bruk datoformatet DD.MM.ÅÅÅÅ TT:mm.');
      return;
    }
    const proposal: CommunityEventTimeProposal = {
      id: generateId('time'),
      label: formatDateRange(startsAt, endsAt),
      startsAt,
      endsAt,
      votes: [],
    };
    void persist({ timeProposals: [...proposals, proposal] });
  }, [persist, proposalEnd, proposalStart, proposals]);

  const votePoll = useCallback((commentId: string, optionId: string) => {
    if (!user) return;
    const nextComments = comments.map((comment) => {
      if (comment.id !== commentId || !comment.poll) return comment;
      const poll = comment.poll;
      return {
        ...comment,
        poll: {
          ...poll,
          options: poll.options.map((option) => {
            if (option.id !== optionId) {
              return poll.allowMultiple ? option : { ...option, votes: option.votes.filter((uid) => uid !== user.uid) };
            }
            const votes = option.votes.includes(user.uid)
              ? option.votes.filter((uid) => uid !== user.uid)
              : [...option.votes, user.uid];
            return { ...option, votes };
          }),
        },
      };
    });
    void persist({ comments: nextComments });
  }, [comments, persist, user]);

  const addComment = useCallback(() => {
    if (!currentPerson) return;
    const text = commentText.trim();
    const question = pollQuestion.trim();
    const options = pollOptions.map((option) => option.trim()).filter(Boolean);
    if (!text && !question) {
      setError('Skriv en kommentar eller et avstemningsspørsmål.');
      return;
    }
    if (question && options.length < 2) {
      setError('En avstemning må ha minst to alternativer.');
      return;
    }
    const comment: CommunityEventComment = {
      id: generateId('comment'),
      author: currentPerson,
      createdAt: Date.now(),
      ...(text ? { text } : {}),
      ...(question ? {
        poll: {
          id: generateId('poll'),
          question,
          allowMultiple: pollAllowMultiple,
          options: options.map((label) => ({ id: generateId('option'), label, votes: [] })),
          createdAt: Date.now(),
          createdBy: currentPerson,
        },
      } : {}),
    };
    void (async () => {
      const updated = await persist({ comments: [...comments, comment] });
      if (updated) {
        setCommentText('');
        setPollQuestion('');
        setPollOptions(['', '']);
        setPollAllowMultiple(false);
      }
    })();
  }, [commentText, comments, currentPerson, persist, pollAllowMultiple, pollOptions, pollQuestion]);

  const addTodo = useCallback(() => {
    const title = todoTitle.trim();
    if (!title || !currentPerson) {
      setError('Skriv en oppgave.');
      return;
    }
    const assignee = todoMode === 'assigned' && todoAssigneeUid ? usersByUid.get(todoAssigneeUid) : undefined;
    if (todoMode === 'assigned' && !assignee) {
      setError('Velg hvem oppgaven skal tildeles.');
      return;
    }
    const todo: CommunityEventTodo = {
      id: generateId('todo'),
      title,
      mode: todoMode,
      ...(assignee ? { assignee } : {}),
      createdAt: Date.now(),
    };
    void (async () => {
      const updated = await persist({ todos: [...todos, todo] });
      if (updated) {
        setTodoTitle('');
        setTodoMode('open');
        setTodoAssigneeUid(null);
      }
    })();
  }, [currentPerson, persist, todoAssigneeUid, todoMode, todoTitle, todos, usersByUid]);

  const claimTodo = useCallback((todoId: string) => {
    if (!currentPerson) return;
    void persist({
      todos: todos.map((todo) => todo.id === todoId && todo.mode === 'claimable' && !todo.claimedBy
        ? { ...todo, claimedBy: currentPerson }
        : todo),
    });
  }, [currentPerson, persist, todos]);

  const openAlbum = useCallback(async () => {
    if (!event || busy) return;
    setBusy('album');
    setError('');
    try {
      const target = album ?? await createAlbum({ title: event.title || 'Arrangement', eventId: event.id });
      setAlbum(target);
      navigation.navigate('Album', { albumId: target.id, title: target.title });
    } catch {
      setError('Kunne ikke åpne albumet.');
    } finally {
      setBusy(null);
    }
  }, [album, busy, event, navigation]);

  if (loading) {
    return <ThemedBackground><View style={styles.center}><ActivityIndicator color={tokens.accent} /></View></ThemedBackground>;
  }

  if (!event) {
    return (
      <ThemedBackground>
        <View style={styles.center}>
          <Ionicons name="calendar-outline" size={40} color={tokens.textMuted} />
          <Text style={{ color: tokens.error, fontFamily: font(600) }}>{error || 'Fant ikke arrangementet.'}</Text>
        </View>
      </ThemedBackground>
    );
  }

  const canAddTodos = Boolean(user) && (editable || event.todoEditingEnabled);
  const canAddProposals = Boolean(user) && (editable || event.timeProposalEditingEnabled);

  return (
    <ThemedBackground>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={[styles.hero, { backgroundColor: tokens.bgCard, borderRadius: radius.lg }]}>
          {event.imageUrl ? <Image source={{ uri: event.imageUrl }} style={styles.heroImage} contentFit="cover" /> : null}
          <View style={[styles.heroBody, { backgroundColor: event.imageUrl ? 'rgba(0,0,0,0.58)' : tokens.bgCard }]}>
            <View style={styles.heroBadgeRow}>
              <Text style={[styles.typeBadge, { color: event.imageUrl ? '#fff' : tokens.accent, borderColor: event.imageUrl ? '#fff' : tokens.accent, fontFamily: font(600) }]}>{getEventTypeLabel(event)}</Text>
              {event.status === 'draft' ? <Text style={[styles.typeBadge, { color: tokens.warning, borderColor: tokens.warning, fontFamily: font(600) }]}>Kladd</Text> : null}
            </View>
            <Text style={[styles.title, { color: event.imageUrl ? '#fff' : tokens.textPrimary, fontFamily: font(700) }]}>{event.title || 'Uten tittel'}</Text>
            <Text style={{ color: event.imageUrl ? '#eee' : tokens.textSecondary, fontFamily: font(500) }}>{getEventTimeLabel(event)}</Text>
            {event.location ? <Text style={{ color: event.imageUrl ? '#eee' : tokens.textSecondary, fontFamily: font(400) }}>{event.location}</Text> : null}
            {editable ? (
              <View style={styles.rowWrap}>
                <SmallButton label="Rediger" onPress={() => navigation.navigate('EventEditor', { eventId: event.id })} />
                {event.status === 'draft' ? <SmallButton label="Publiser" active onPress={() => void persist({ status: 'published' }, 'publish')} disabled={Boolean(busy)} /> : null}
              </View>
            ) : null}
          </View>
        </View>

        {finished ? (
          <View style={styles.segmented}>
            <SmallButton label="Planlegging" active={!historyView} onPress={() => setHistoryView(false)} />
            <SmallButton label="Historikk" active={historyView} onPress={() => setHistoryView(true)} />
          </View>
        ) : null}

        {error ? <Text style={[styles.error, { color: tokens.error, backgroundColor: tokens.bgCard, borderColor: tokens.error, fontFamily: font(500), borderRadius: radius.md }]}>{error}</Text> : null}

        <Section title="Beskrivelse">
          <Text style={[styles.bodyText, { color: event.description ? tokens.textPrimary : tokens.textMuted, fontFamily: font(400) }]}>
            {event.description || 'Ingen beskrivelse er lagt inn.'}
          </Text>
        </Section>

        <Section title={showHistory ? 'Bilder fra arrangementet' : 'Bilder'} action={album ? <Text style={{ color: tokens.textMuted, fontFamily: font(500) }}>{album.mediaCount} filer</Text> : undefined}>
          {albumMedia.length ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.photoRow}>
              {albumMedia.slice(0, 8).map((media) => (
                <Pressable key={media.id} onPress={() => void openAlbum()}>
                  <Image source={{ uri: albumMediaFileUrl(media.id, { thumbnail: true }) }} style={[styles.photo, { borderRadius: radius.md }]} contentFit="cover" />
                </Pressable>
              ))}
            </ScrollView>
          ) : <Text style={[styles.hint, { color: tokens.textMuted, fontFamily: font(400) }]}>Ingen bilder er lagt inn enda.</Text>}
          <SmallButton label={album ? 'Åpne album' : 'Opprett album'} active onPress={() => void openAlbum()} disabled={busy === 'album'} />
        </Section>

        {!showHistory ? (
          <Section title="Påmelding">
            <View style={styles.rsvpRow}>
              {RSVP_OPTIONS.map((option) => (
                <SmallButton key={option.value} label={option.label} active={myResponse === option.value} onPress={() => void respond(option.value)} disabled={Boolean(busy)} />
              ))}
            </View>
            {RSVP_OPTIONS.map((option) => (
              <View key={option.value} style={styles.participantGroup}>
                <Text style={[styles.label, { color: tokens.textSecondary, fontFamily: font(600) }]}>{option.label} ({participants[option.value].length})</Text>
                <View style={styles.rowWrap}>
                  {participants[option.value].length ? participants[option.value].map((person) => <PersonChip key={person.uid} person={person} />) : <Text style={{ color: tokens.textMuted, fontFamily: font(400), fontSize: 12 }}>Ingen</Text>}
                </View>
              </View>
            ))}
            <View style={styles.participantGroup}>
              <Text style={[styles.label, { color: tokens.textSecondary, fontFamily: font(600) }]}>Ikke svart ({nonResponders.length})</Text>
              <View style={styles.rowWrap}>
                {nonResponders.length ? nonResponders.map((person) => <PersonChip key={person.uid} person={person} />) : <Text style={{ color: tokens.textMuted, fontFamily: font(400), fontSize: 12 }}>Alle har svart</Text>}
              </View>
            </View>
          </Section>
        ) : (
          <Section title="Deltok">
            <View style={styles.rowWrap}>{participants.coming.map((person) => <PersonChip key={person.uid} person={person} />)}</View>
          </Section>
        )}

        {event.timeMode === 'proposed' ? (
          <Section title="Tidspunkter">
            {proposals.map((proposal) => {
              const myVote = proposal.votes.includes(user?.uid ?? -1);
              return (
                <View key={proposal.id} style={[styles.listRow, { borderBottomColor: tokens.border }]}>
                  <View style={styles.flex}>
                    <Text style={[styles.rowTitle, { color: tokens.textPrimary, fontFamily: font(600) }]}>{formatDateRange(proposal.startsAt, proposal.endsAt)}</Text>
                    <Text style={[styles.hint, { color: tokens.textMuted, fontFamily: font(400) }]}>{proposal.votes.length} kan</Text>
                    <View style={styles.rowWrap}>{proposal.votes.map((uid) => usersByUid.get(uid)).filter(Boolean).map((person) => <PersonChip key={person!.uid} person={person!} />)}</View>
                  </View>
                  <View style={styles.actionColumn}>
                    <SmallButton label={myVote ? 'Stemt' : 'Stem'} active={myVote} onPress={() => voteProposal(proposal.id)} disabled={Boolean(busy)} />
                    {editable ? <SmallButton label="Fastsett" onPress={() => void persist({ timeMode: 'fixed', startsAt: proposal.startsAt, endsAt: proposal.endsAt })} disabled={Boolean(busy)} /> : null}
                  </View>
                </View>
              );
            })}
            {canAddProposals ? (
              <View style={styles.composer}>
                <TextInput value={proposalStart} onChangeText={setProposalStart} placeholder="Start: DD.MM.ÅÅÅÅ TT:mm" placeholderTextColor={tokens.textMuted} style={[styles.input, { color: tokens.textPrimary, backgroundColor: tokens.bgPrimary, borderColor: tokens.border, borderRadius: radius.md, fontFamily: font(400) }]} />
                <TextInput value={proposalEnd} onChangeText={setProposalEnd} placeholder="Slutt: DD.MM.ÅÅÅÅ TT:mm" placeholderTextColor={tokens.textMuted} style={[styles.input, { color: tokens.textPrimary, backgroundColor: tokens.bgPrimary, borderColor: tokens.border, borderRadius: radius.md, fontFamily: font(400) }]} />
                <SmallButton label="Legg til forslag" active onPress={addProposal} disabled={Boolean(busy)} />
              </View>
            ) : null}
          </Section>
        ) : null}

        {!showHistory ? (
          <Section
            title="To-dos"
            action={editable ? (
              <View style={styles.switchRow}>
                <Text style={{ color: tokens.textMuted, fontFamily: font(500), fontSize: 12 }}>{event.todoEditingEnabled ? 'Åpne' : 'Låst'}</Text>
                <Switch value={event.todoEditingEnabled} onValueChange={(value) => void persist({ todoEditingEnabled: value })} trackColor={{ true: tokens.accent }} />
              </View>
            ) : undefined}
          >
            {todos.length ? todos.map((todo) => {
              const person = todo.assignee ?? todo.claimedBy;
              return (
                <View key={todo.id} style={[styles.listRow, { borderBottomColor: tokens.border }]}>
                  <View style={styles.flex}>
                    <Text style={[styles.rowTitle, { color: tokens.textPrimary, fontFamily: font(600) }]}>{todo.title}</Text>
                    <Text style={[styles.hint, { color: tokens.textMuted, fontFamily: font(400) }]}>
                      {todo.mode === 'open' ? 'Alle' : todo.mode === 'assigned' ? `Tildelt ${person?.name ?? 'ukjent'}` : person ? `${person.name} fikser` : 'Hvem fikser?'}
                    </Text>
                  </View>
                  <View style={styles.actionColumn}>
                    {todo.mode === 'claimable' && !todo.claimedBy ? <SmallButton label="Ta oppgaven" onPress={() => claimTodo(todo.id)} disabled={Boolean(busy)} /> : null}
                    {editable ? <SmallButton label="Slett" danger onPress={() => Alert.alert('Slett oppgave?', todo.title, [{ text: 'Avbryt', style: 'cancel' }, { text: 'Slett', style: 'destructive', onPress: () => void persist({ todos: todos.filter((candidate) => candidate.id !== todo.id) }) }])} disabled={Boolean(busy)} /> : null}
                  </View>
                </View>
              );
            }) : <Text style={[styles.hint, { color: tokens.textMuted, fontFamily: font(400) }]}>Ingen oppgaver enda.</Text>}
            {canAddTodos ? (
              <View style={styles.composer}>
                <TextInput value={todoTitle} onChangeText={setTodoTitle} placeholder="Skriv en oppgave" placeholderTextColor={tokens.textMuted} style={[styles.input, { color: tokens.textPrimary, backgroundColor: tokens.bgPrimary, borderColor: tokens.border, borderRadius: radius.md, fontFamily: font(400) }]} />
                <View style={styles.rowWrap}>
                  {(['open', 'assigned', 'claimable'] as const).map((mode) => <SmallButton key={mode} label={mode === 'open' ? 'Alle' : mode === 'assigned' ? 'Tildelt' : 'Hvem fikser?'} active={todoMode === mode} onPress={() => setTodoMode(mode)} />)}
                </View>
                {todoMode === 'assigned' ? <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rowWrap}>{users.map((person) => <Pressable key={person.uid} onPress={() => setTodoAssigneeUid(person.uid)} style={{ opacity: todoAssigneeUid === person.uid ? 1 : 0.55 }}><PersonChip person={person} /></Pressable>)}</ScrollView> : null}
                <SmallButton label="Legg til oppgave" active onPress={addTodo} disabled={Boolean(busy)} />
              </View>
            ) : null}
          </Section>
        ) : null}

        <Section title={`Kommentarer (${comments.length})`}>
          {comments.length ? comments.map((comment) => {
            const author = usersByUid.get(comment.author.uid) ?? comment.author;
            return (
              <View key={comment.id} style={[styles.comment, { borderBottomColor: tokens.border }]}>
                <View style={styles.commentHeader}>
                  <Avatar uid={author.uid} name={author.name} avatarUpdatedAt={author.avatarUpdatedAt} size={30} />
                  <View>
                    <Text style={{ color: tokens.textPrimary, fontFamily: font(600), fontSize: 13 }}>{author.name}</Text>
                    <Text style={{ color: tokens.textMuted, fontFamily: font(400), fontSize: 11 }}>{formatDateTime(comment.createdAt)}</Text>
                  </View>
                </View>
                {comment.text ? <Text style={[styles.bodyText, { color: tokens.textPrimary, fontFamily: font(400) }]}>{comment.text}</Text> : null}
                {comment.poll ? (
                  <View style={[styles.poll, { backgroundColor: tokens.bgSecondary, borderRadius: radius.md }]}>
                    <Text style={{ color: tokens.textPrimary, fontFamily: font(700) }}>{comment.poll.question}</Text>
                    <Text style={{ color: tokens.textMuted, fontFamily: font(400), fontSize: 11 }}>{comment.poll.allowMultiple ? 'Flervalg' : 'Ett valg'}</Text>
                    {comment.poll.options.map((option) => <SmallButton key={option.id} label={`${option.label} (${option.votes.length})`} active={option.votes.includes(user?.uid ?? -1)} onPress={() => votePoll(comment.id, option.id)} disabled={Boolean(busy)} />)}
                  </View>
                ) : null}
              </View>
            );
          }) : <Text style={[styles.hint, { color: tokens.textMuted, fontFamily: font(400) }]}>Ingen kommentarer enda.</Text>}

          {event.status === 'published' && !showHistory ? (
            <View style={styles.composer}>
              <TextInput value={commentText} onChangeText={setCommentText} placeholder="Skriv en kommentar" placeholderTextColor={tokens.textMuted} multiline style={[styles.textarea, { color: tokens.textPrimary, backgroundColor: tokens.bgPrimary, borderColor: tokens.border, borderRadius: radius.md, fontFamily: font(400) }]} />
              <TextInput value={pollQuestion} onChangeText={setPollQuestion} placeholder="Avstemningsspørsmål (valgfritt)" placeholderTextColor={tokens.textMuted} style={[styles.input, { color: tokens.textPrimary, backgroundColor: tokens.bgPrimary, borderColor: tokens.border, borderRadius: radius.md, fontFamily: font(400) }]} />
              {pollQuestion.trim() ? (
                <>
                  {pollOptions.map((value, index) => <TextInput key={index} value={value} onChangeText={(nextValue) => setPollOptions((current) => current.map((option, optionIndex) => optionIndex === index ? nextValue : option))} placeholder={`Alternativ ${index + 1}`} placeholderTextColor={tokens.textMuted} style={[styles.input, { color: tokens.textPrimary, backgroundColor: tokens.bgPrimary, borderColor: tokens.border, borderRadius: radius.md, fontFamily: font(400) }]} />)}
                  <View style={styles.switchRow}><Text style={{ color: tokens.textSecondary, fontFamily: font(500) }}>Tillat flere valg</Text><Switch value={pollAllowMultiple} onValueChange={setPollAllowMultiple} trackColor={{ true: tokens.accent }} /></View>
                  <SmallButton label="+ Alternativ" onPress={() => setPollOptions((current) => [...current, ''])} />
                </>
              ) : null}
              <SmallButton label="Legg til kommentar" active onPress={addComment} disabled={Boolean(busy)} />
            </View>
          ) : null}
        </Section>

        <Section title="Arrangør">
          <PersonChip person={usersByUid.get(event.createdBy.uid) ?? event.createdBy} />
          {(event.coOrganizers ?? []).length ? <View style={styles.rowWrap}>{event.coOrganizers!.map((person) => <PersonChip key={person.uid} person={usersByUid.get(person.uid) ?? person} />)}</View> : null}
          <Text style={[styles.hint, { color: tokens.textMuted, fontFamily: font(400) }]}>Redigering: {event.editMode === 'open' ? 'åpen for alle' : 'låst'}</Text>
        </Section>
      </ScrollView>
    </ThemedBackground>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24 },
  content: { padding: 12, paddingBottom: 34, gap: 12 },
  hero: { minHeight: 220, overflow: 'hidden', justifyContent: 'flex-end' },
  heroImage: { ...StyleSheet.absoluteFillObject },
  heroBody: { padding: 16, gap: 6 },
  heroBadgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  typeBadge: { fontSize: 11, borderWidth: 1, borderRadius: 12, paddingHorizontal: 8, paddingVertical: 4 },
  title: { fontSize: 25, marginTop: 4 },
  segmented: { flexDirection: 'row', justifyContent: 'center', gap: 8 },
  error: { borderWidth: 1, padding: 10, fontSize: 13 },
  section: { borderWidth: 1, overflow: 'hidden' },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, paddingHorizontal: 14, paddingTop: 13 },
  sectionTitle: { fontSize: 17 },
  sectionBody: { padding: 14, gap: 12 },
  bodyText: { fontSize: 14, lineHeight: 20 },
  hint: { fontSize: 12, lineHeight: 17 },
  label: { fontSize: 12 },
  rowWrap: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 7 },
  rsvpRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  smallButton: { minHeight: 34, borderWidth: 1, paddingHorizontal: 11, alignItems: 'center', justifyContent: 'center' },
  personChip: { maxWidth: 170, flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, paddingRight: 9, paddingLeft: 3, paddingVertical: 3 },
  participantGroup: { gap: 6 },
  photoRow: { gap: 8 },
  photo: { width: 118, height: 92 },
  listRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  rowTitle: { fontSize: 14 },
  actionColumn: { alignItems: 'stretch', gap: 6 },
  composer: { gap: 8, marginTop: 4 },
  input: { minHeight: 42, borderWidth: 1, paddingHorizontal: 12, fontSize: 14 },
  textarea: { minHeight: 88, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, textAlignVertical: 'top' },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  comment: { gap: 8, paddingBottom: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  commentHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  poll: { padding: 10, gap: 7 },
});
