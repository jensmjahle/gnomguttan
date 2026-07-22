import { useCallback, useEffect, useMemo, useState } from 'react';
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
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { Image } from 'expo-image';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Avatar } from '@/components/Avatar';
import { ThemedBackground } from '@/theme/ThemedBackground';
import { useTheme } from '@/theme/useTheme';
import { vocechatService } from '@/services/vocechat';
import {
  deleteCommunityEvent,
  loadCommunityEvent,
  saveCommunityEvent,
} from '@/services/communityEvents';
import { createAlbum } from '@/services/albums';
import {
  EVENT_TYPES,
  formatDateRange,
  formatDateTimeInput,
  generateId,
  parseDateTimeInput,
  userInfoToEventPerson,
} from '@/utils/communityEvents';
import type { CalendarStackParamList } from '@/navigation/types';
import type {
  CommunityEventEditMode,
  CommunityEventInput,
  CommunityEventPerson,
  CommunityEventStatus,
  CommunityEventTimeMode,
  CommunityEventTimeProposal,
} from '@/types';

type Route = RouteProp<CalendarStackParamList, 'EventEditor'>;
type Navigation = NativeStackNavigationProp<CalendarStackParamList, 'EventEditor'>;

interface Draft {
  id: string;
  title: string;
  imageUrl: string;
  location: string;
  description: string;
  eventType: string;
  customEventType: string;
  status: CommunityEventStatus;
  editMode: CommunityEventEditMode;
  timeMode: CommunityEventTimeMode;
  startsAt: string;
  endsAt: string;
  timeProposals: CommunityEventTimeProposal[];
  timeProposalEditingEnabled: boolean;
  coOrganizers: CommunityEventPerson[];
  todoEditingEnabled: boolean;
  createAlbum: boolean;
}

function defaultDraft(): Draft {
  return {
    id: generateId('event'),
    title: '',
    imageUrl: '',
    location: '',
    description: '',
    eventType: 'Sosialt',
    customEventType: '',
    status: 'draft',
    editMode: 'locked',
    timeMode: 'fixed',
    startsAt: formatDateTimeInput(new Date(Date.now() + 60 * 60 * 1000)),
    endsAt: '',
    timeProposals: [],
    timeProposalEditingEnabled: false,
    coOrganizers: [],
    todoEditingEnabled: false,
    createAlbum: true,
  };
}

function ToggleRow({
  label,
  description,
  value,
  onValueChange,
}: {
  label: string;
  description: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
}) {
  const { tokens, font } = useTheme();
  return (
    <View style={styles.toggleRow}>
      <View style={styles.flex}>
        <Text style={{ color: tokens.textPrimary, fontFamily: font(600), fontSize: 14 }}>{label}</Text>
        <Text style={{ color: tokens.textMuted, fontFamily: font(400), fontSize: 12, lineHeight: 17 }}>{description}</Text>
      </View>
      <Switch value={value} onValueChange={onValueChange} trackColor={{ true: tokens.accent }} />
    </View>
  );
}

export function EventEditorScreen() {
  const route = useRoute<Route>();
  const navigation = useNavigation<Navigation>();
  const eventId = route.params?.eventId;
  const { tokens, font, radius } = useTheme();

  const [draft, setDraft] = useState<Draft>(defaultDraft);
  const [users, setUsers] = useState<CommunityEventPerson[]>([]);
  const [loading, setLoading] = useState(Boolean(eventId));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [proposalStart, setProposalStart] = useState(() => formatDateTimeInput(new Date(Date.now() + 60 * 60 * 1000)));
  const [proposalEnd, setProposalEnd] = useState(() => formatDateTimeInput(new Date(Date.now() + 2 * 60 * 60 * 1000)));

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [loadedUsers, event] = await Promise.all([
        vocechatService.listUsers().catch(() => []),
        eventId ? loadCommunityEvent(eventId) : Promise.resolve(null),
      ]);
      setUsers(loadedUsers.filter((candidate) => !candidate.is_bot).map(userInfoToEventPerson));
      if (event) {
        setDraft({
          id: event.id,
          title: event.title,
          imageUrl: event.imageUrl ?? '',
          location: event.location ?? '',
          description: event.description ?? '',
          eventType: event.eventType ?? 'Sosialt',
          customEventType: event.customEventType ?? '',
          status: event.status ?? 'published',
          editMode: event.editMode ?? 'locked',
          timeMode: event.timeMode ?? 'fixed',
          startsAt: formatDateTimeInput(event.startsAt),
          endsAt: event.endsAt ? formatDateTimeInput(event.endsAt) : '',
          timeProposals: event.timeProposals ?? [],
          timeProposalEditingEnabled: event.timeProposalEditingEnabled ?? false,
          coOrganizers: event.coOrganizers ?? [],
          todoEditingEnabled: event.todoEditingEnabled ?? false,
          createAlbum: false,
        });
      }
    } catch {
      setError('Kunne ikke laste arrangementet.');
    } finally {
      setLoading(false);
    }
  }, [eventId]);

  useEffect(() => {
    void load();
  }, [load]);

  const coOrganizerIds = useMemo(() => new Set(draft.coOrganizers.map((person) => person.uid)), [draft.coOrganizers]);
  const update = useCallback((patch: Partial<Draft>) => setDraft((current) => ({ ...current, ...patch })), []);

  const chooseImage = useCallback(async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Tilgang kreves', 'Gi tilgang til bilder for å velge forsidebilde.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.72 });
    if (result.canceled) return;
    const asset = result.assets[0];
    try {
      const base64 = await FileSystem.readAsStringAsync(asset.uri, { encoding: FileSystem.EncodingType.Base64 });
      const mime = asset.mimeType || 'image/jpeg';
      update({ imageUrl: `data:${mime};base64,${base64}` });
    } catch {
      setError('Kunne ikke lese bildet.');
    }
  }, [update]);

  const addProposal = useCallback(() => {
    const startsAt = parseDateTimeInput(proposalStart);
    const endsAt = parseDateTimeInput(proposalEnd);
    if (!startsAt || !endsAt) {
      setError('Bruk datoformatet DD.MM.ÅÅÅÅ TT:mm.');
      return;
    }
    const next: CommunityEventTimeProposal = {
      id: generateId('time'),
      label: formatDateRange(startsAt, endsAt),
      startsAt,
      endsAt,
      votes: [],
    };
    update({ timeProposals: [...draft.timeProposals, next] });
  }, [draft.timeProposals, proposalEnd, proposalStart, update]);

  const buildPayload = useCallback((status: CommunityEventStatus): Partial<CommunityEventInput> | null => {
    const title = draft.title.trim();
    if (!title) {
      setError('Skriv en tittel.');
      return null;
    }
    let startsAt: string | undefined;
    let endsAt: string | undefined;
    if (draft.timeMode === 'fixed') {
      startsAt = parseDateTimeInput(draft.startsAt) ?? undefined;
      endsAt = draft.endsAt.trim() ? parseDateTimeInput(draft.endsAt) ?? undefined : undefined;
      if (!startsAt || (draft.endsAt.trim() && !endsAt)) {
        setError('Kontroller start- og sluttid. Bruk DD.MM.ÅÅÅÅ TT:mm.');
        return null;
      }
    }
    return {
      id: draft.id,
      title,
      location: draft.location.trim() || undefined,
      description: draft.description.trim() || undefined,
      imageUrl: draft.imageUrl.trim() || undefined,
      eventType: draft.eventType,
      customEventType: draft.eventType === 'Egendefinert' ? draft.customEventType.trim() || undefined : undefined,
      status,
      editMode: draft.editMode,
      timeMode: draft.timeMode,
      startsAt,
      endsAt,
      timeProposals: draft.timeProposals,
      timeProposalEditingEnabled: draft.timeProposalEditingEnabled,
      coOrganizers: draft.coOrganizers,
      todoEditingEnabled: draft.todoEditingEnabled,
    };
  }, [draft]);

  const save = useCallback(async (status: CommunityEventStatus) => {
    if (busy) return;
    const payload = buildPayload(status);
    if (!payload) return;
    setBusy(true);
    setError('');
    try {
      const updated = await saveCommunityEvent(draft.id, payload);
      if (status === 'published' && draft.createAlbum) {
        await createAlbum({ title: updated.title, eventId: updated.id }).catch(() => undefined);
      }
      navigation.replace('EventDetail', { eventId: updated.id, title: updated.title });
    } catch {
      setError(status === 'published' ? 'Kunne ikke publisere arrangementet.' : 'Kunne ikke lagre kladden.');
    } finally {
      setBusy(false);
    }
  }, [buildPayload, busy, draft.createAlbum, draft.id, navigation]);

  const remove = useCallback(() => {
    if (!eventId || busy) return;
    Alert.alert('Slett arrangement?', 'Dette kan ikke angres.', [
      { text: 'Avbryt', style: 'cancel' },
      {
        text: 'Slett',
        style: 'destructive',
        onPress: () => void (async () => {
          setBusy(true);
          try {
            await deleteCommunityEvent(eventId);
            navigation.popToTop();
          } catch {
            setError('Kunne ikke slette arrangementet.');
          } finally {
            setBusy(false);
          }
        })(),
      },
    ]);
  }, [busy, eventId, navigation]);

  if (loading) {
    return <ThemedBackground><View style={styles.center}><ActivityIndicator color={tokens.accent} /></View></ThemedBackground>;
  }

  return (
    <ThemedBackground>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Pressable onPress={() => void chooseImage()} style={[styles.imagePicker, { backgroundColor: tokens.bgCard, borderColor: tokens.border, borderRadius: radius.lg }]}>
          {draft.imageUrl ? <Image source={{ uri: draft.imageUrl }} style={styles.heroImage} contentFit="cover" /> : null}
          <View style={[styles.imageOverlay, { backgroundColor: draft.imageUrl ? 'rgba(0,0,0,0.42)' : tokens.bgSecondary }]}>
            <Text style={{ color: draft.imageUrl ? '#fff' : tokens.textSecondary, fontFamily: font(600) }}>{draft.imageUrl ? 'Bytt forsidebilde' : 'Velg forsidebilde'}</Text>
          </View>
        </Pressable>

        {error ? <Text style={[styles.error, { color: tokens.error, borderColor: tokens.error, backgroundColor: tokens.bgCard, borderRadius: radius.md, fontFamily: font(500) }]}>{error}</Text> : null}

        <View style={[styles.card, { backgroundColor: tokens.bgCard, borderColor: tokens.border, borderRadius: radius.lg }]}>
          <Text style={[styles.cardTitle, { color: tokens.textPrimary, fontFamily: font(700) }]}>Grunninfo</Text>
          <TextInput value={draft.title} onChangeText={(title) => update({ title })} placeholder="Tittel" placeholderTextColor={tokens.textMuted} style={[styles.input, { color: tokens.textPrimary, backgroundColor: tokens.bgPrimary, borderColor: tokens.border, borderRadius: radius.md, fontFamily: font(400) }]} />
          <TextInput value={draft.location} onChangeText={(location) => update({ location })} placeholder="Sted" placeholderTextColor={tokens.textMuted} style={[styles.input, { color: tokens.textPrimary, backgroundColor: tokens.bgPrimary, borderColor: tokens.border, borderRadius: radius.md, fontFamily: font(400) }]} />
          <TextInput value={draft.description} onChangeText={(description) => update({ description })} placeholder="Beskrivelse" placeholderTextColor={tokens.textMuted} multiline style={[styles.textarea, { color: tokens.textPrimary, backgroundColor: tokens.bgPrimary, borderColor: tokens.border, borderRadius: radius.md, fontFamily: font(400) }]} />
        </View>

        <View style={[styles.card, { backgroundColor: tokens.bgCard, borderColor: tokens.border, borderRadius: radius.lg }]}>
          <Text style={[styles.cardTitle, { color: tokens.textPrimary, fontFamily: font(700) }]}>Type</Text>
          <View style={styles.wrap}>
            {EVENT_TYPES.map((eventType) => {
              const active = draft.eventType === eventType;
              return (
                <Pressable key={eventType} onPress={() => update({ eventType })} style={[styles.chip, { backgroundColor: active ? tokens.accentMuted : tokens.bgSecondary, borderColor: active ? tokens.accent : tokens.border, borderRadius: radius.full }]}>
                  <Text style={{ color: active ? tokens.accent : tokens.textSecondary, fontFamily: font(600), fontSize: 12 }}>{eventType}</Text>
                </Pressable>
              );
            })}
          </View>
          {draft.eventType === 'Egendefinert' ? <TextInput value={draft.customEventType} onChangeText={(customEventType) => update({ customEventType })} placeholder="Egendefinert type" placeholderTextColor={tokens.textMuted} style={[styles.input, { color: tokens.textPrimary, backgroundColor: tokens.bgPrimary, borderColor: tokens.border, borderRadius: radius.md, fontFamily: font(400) }]} /> : null}
        </View>

        <View style={[styles.card, { backgroundColor: tokens.bgCard, borderColor: tokens.border, borderRadius: radius.lg }]}>
          <Text style={[styles.cardTitle, { color: tokens.textPrimary, fontFamily: font(700) }]}>Tid</Text>
          <View style={styles.wrap}>
            {(['fixed', 'proposed'] as const).map((timeMode) => {
              const active = draft.timeMode === timeMode;
              return (
                <Pressable key={timeMode} onPress={() => update({ timeMode })} style={[styles.chip, { backgroundColor: active ? tokens.accentMuted : tokens.bgSecondary, borderColor: active ? tokens.accent : tokens.border, borderRadius: radius.full }]}>
                  <Text style={{ color: active ? tokens.accent : tokens.textSecondary, fontFamily: font(600) }}>{timeMode === 'fixed' ? 'Fast tidspunkt' : 'Foreslå tidspunkt'}</Text>
                </Pressable>
              );
            })}
          </View>
          {draft.timeMode === 'fixed' ? (
            <>
              <TextInput value={draft.startsAt} onChangeText={(startsAt) => update({ startsAt })} placeholder="Start: DD.MM.ÅÅÅÅ TT:mm" placeholderTextColor={tokens.textMuted} style={[styles.input, { color: tokens.textPrimary, backgroundColor: tokens.bgPrimary, borderColor: tokens.border, borderRadius: radius.md, fontFamily: font(400) }]} />
              <TextInput value={draft.endsAt} onChangeText={(endsAt) => update({ endsAt })} placeholder="Slutt (valgfritt)" placeholderTextColor={tokens.textMuted} style={[styles.input, { color: tokens.textPrimary, backgroundColor: tokens.bgPrimary, borderColor: tokens.border, borderRadius: radius.md, fontFamily: font(400) }]} />
            </>
          ) : (
            <>
              {draft.timeProposals.map((proposal) => (
                <View key={proposal.id} style={[styles.proposal, { borderBottomColor: tokens.border }]}>
                  <View style={styles.flex}><Text style={{ color: tokens.textPrimary, fontFamily: font(600) }}>{formatDateRange(proposal.startsAt, proposal.endsAt)}</Text><Text style={{ color: tokens.textMuted, fontFamily: font(400), fontSize: 12 }}>{proposal.votes.length} stemmer</Text></View>
                  <Pressable onPress={() => update({ timeProposals: draft.timeProposals.filter((candidate) => candidate.id !== proposal.id) })}><Text style={{ color: tokens.error, fontFamily: font(600) }}>Fjern</Text></Pressable>
                </View>
              ))}
              <TextInput value={proposalStart} onChangeText={setProposalStart} placeholder="Forslag start" placeholderTextColor={tokens.textMuted} style={[styles.input, { color: tokens.textPrimary, backgroundColor: tokens.bgPrimary, borderColor: tokens.border, borderRadius: radius.md, fontFamily: font(400) }]} />
              <TextInput value={proposalEnd} onChangeText={setProposalEnd} placeholder="Forslag slutt" placeholderTextColor={tokens.textMuted} style={[styles.input, { color: tokens.textPrimary, backgroundColor: tokens.bgPrimary, borderColor: tokens.border, borderRadius: radius.md, fontFamily: font(400) }]} />
              <Pressable onPress={addProposal} style={[styles.primarySmall, { backgroundColor: tokens.accent, borderRadius: radius.md }]}><Text style={{ color: tokens.accentFg, fontFamily: font(600) }}>Legg til forslag</Text></Pressable>
              <ToggleRow label="Alle kan legge til forslag" description="Deltakere kan foreslå flere tidspunkt på detaljsiden." value={draft.timeProposalEditingEnabled} onValueChange={(timeProposalEditingEnabled) => update({ timeProposalEditingEnabled })} />
            </>
          )}
        </View>

        <View style={[styles.card, { backgroundColor: tokens.bgCard, borderColor: tokens.border, borderRadius: radius.lg }]}>
          <Text style={[styles.cardTitle, { color: tokens.textPrimary, fontFamily: font(700) }]}>Tilgang</Text>
          <ToggleRow label="Åpen redigering" description="Alle brukere kan redigere publiserte arrangementer." value={draft.editMode === 'open'} onValueChange={(open) => update({ editMode: open ? 'open' : 'locked' })} />
          <ToggleRow label="Åpne to-dos" description="Alle kan legge til oppgaver på arrangementet." value={draft.todoEditingEnabled} onValueChange={(todoEditingEnabled) => update({ todoEditingEnabled })} />
          {!eventId ? <ToggleRow label="Opprett album" description="Lager automatisk et album når arrangementet publiseres." value={draft.createAlbum} onValueChange={(createAlbumValue) => update({ createAlbum: createAlbumValue })} /> : null}
        </View>

        <View style={[styles.card, { backgroundColor: tokens.bgCard, borderColor: tokens.border, borderRadius: radius.lg }]}>
          <Text style={[styles.cardTitle, { color: tokens.textPrimary, fontFamily: font(700) }]}>Medarrangører</Text>
          <Text style={{ color: tokens.textMuted, fontFamily: font(400), fontSize: 12 }}>Trykk for å gi eller fjerne redigeringstilgang.</Text>
          <View style={styles.wrap}>
            {users.map((person) => {
              const active = coOrganizerIds.has(person.uid);
              return (
                <Pressable
                  key={person.uid}
                  onPress={() => update({ coOrganizers: active ? draft.coOrganizers.filter((candidate) => candidate.uid !== person.uid) : [...draft.coOrganizers, person] })}
                  style={[styles.person, { opacity: active ? 1 : 0.55, borderColor: active ? tokens.accent : tokens.border, backgroundColor: active ? tokens.accentMuted : tokens.bgSecondary, borderRadius: radius.full }]}
                >
                  <Avatar uid={person.uid} name={person.name} avatarUpdatedAt={person.avatarUpdatedAt} size={28} />
                  <Text style={{ color: active ? tokens.accent : tokens.textSecondary, fontFamily: font(500), fontSize: 12 }}>{person.name}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View style={styles.actions}>
          <Pressable disabled={busy} onPress={() => void save(draft.status)} style={[styles.secondaryAction, { backgroundColor: tokens.bgCard, borderColor: tokens.border, borderRadius: radius.md, opacity: busy ? 0.5 : 1 }]}><Text style={{ color: tokens.textPrimary, fontFamily: font(600) }}>{draft.status === 'published' ? 'Lagre endringer' : 'Lagre kladd'}</Text></Pressable>
          {draft.status !== 'published' ? <Pressable disabled={busy} onPress={() => void save('published')} style={[styles.primaryAction, { backgroundColor: tokens.accent, borderRadius: radius.md, opacity: busy ? 0.5 : 1 }]}>{busy ? <ActivityIndicator color={tokens.accentFg} /> : <Text style={{ color: tokens.accentFg, fontFamily: font(700) }}>Publiser</Text>}</Pressable> : null}
        </View>
        {eventId ? <Pressable disabled={busy} onPress={remove} style={styles.deleteAction}><Text style={{ color: tokens.error, fontFamily: font(600) }}>Slett arrangement</Text></Pressable> : null}
      </ScrollView>
    </ThemedBackground>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { padding: 12, paddingBottom: 36, gap: 12 },
  imagePicker: { height: 180, borderWidth: 1, overflow: 'hidden', justifyContent: 'flex-end' },
  heroImage: { ...StyleSheet.absoluteFillObject },
  imageOverlay: { padding: 14, alignItems: 'center' },
  error: { borderWidth: 1, padding: 10, fontSize: 13 },
  card: { borderWidth: 1, padding: 14, gap: 11 },
  cardTitle: { fontSize: 17 },
  input: { minHeight: 44, borderWidth: 1, paddingHorizontal: 12, fontSize: 14 },
  textarea: { minHeight: 96, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, textAlignVertical: 'top' },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: 1, paddingHorizontal: 12, paddingVertical: 8 },
  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 5 },
  proposal: { flexDirection: 'row', alignItems: 'center', gap: 10, borderBottomWidth: StyleSheet.hairlineWidth, paddingVertical: 8 },
  primarySmall: { minHeight: 40, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
  person: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, paddingLeft: 4, paddingRight: 10, paddingVertical: 4 },
  actions: { flexDirection: 'row', gap: 8 },
  secondaryAction: { flex: 1, minHeight: 48, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  primaryAction: { flex: 1, minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  deleteAction: { alignItems: 'center', paddingVertical: 12 },
});
