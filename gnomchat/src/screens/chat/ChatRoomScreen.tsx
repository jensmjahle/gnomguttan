import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, KeyboardAvoidingView, Platform, Pressable, StyleSheet, TextInput, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as Location from 'expo-location';
import { RecordingPresets, requestRecordingPermissionsAsync, setAudioModeAsync, useAudioRecorder, useAudioRecorderState } from 'expo-audio';
import { useTheme } from '@/theme/useTheme';
import { ThemedBackground } from '@/theme/ThemedBackground';
import { call } from '@/matrix/engine';
import { useMatrixStore, useRoom } from '@/matrix/store';
import { setActiveChatRoom } from '@/services/notifications';
import { MatrixAvatar } from '@/components/chat/MatrixAvatar';
import { MessageContent } from '@/components/chat/MessageContent';
import { ActionSheet, EmojiSheet, QUICK_EMOJIS, Sheet, type MenuAction } from '@/components/Sheet';
import { Button, Empty, ErrorBox, Field, IconButton, T } from '@/components/ui';
import { resizeImage } from '@/utils/images';
import type { RootStackParamList } from '@/navigation/types';
import type { TimelineItem } from '@/matrix/protocol.generated';

type Props = NativeStackScreenProps<RootStackParamList, 'ChatRoom'>;
type Row = { type: 'message'; item: TimelineItem; first: boolean; last: boolean } | { type: 'day'; key: string; label: string } | { type: 'event'; item: TimelineItem };

const STICKERS = ['🍻', '🐈', '🧙', '🎉', '❤️', '🔥', '👍', '😂', '👀', '🎮', '💯', '🥳'];
const errorOf = (reason: unknown, fallback: string) => (reason instanceof Error && reason.message ? reason.message : fallback);

function buildRows(items: TimelineItem[]): Row[] {
  // Newest first, for the inverted list.
  const rows: Row[] = [];
  const groupable = (item?: TimelineItem) => item && ['text', 'notice', 'emote', 'image', 'video', 'audio', 'file', 'location'].includes(item.kind);
  for (let i = items.length - 1; i >= 0; i--) {
    const item = items[i];
    const prev = items[i - 1];
    const next = items[i + 1];
    if (item.kind === 'membership') rows.push({ type: 'event', item });
    else {
      const connectsPrev = groupable(prev) && groupable(item) && prev!.sender === item.sender && item.ts - prev!.ts < 5 * 60_000 && new Date(prev!.ts).toDateString() === new Date(item.ts).toDateString();
      const connectsNext = groupable(next) && groupable(item) && next!.sender === item.sender && next!.ts - item.ts < 5 * 60_000 && new Date(next!.ts).toDateString() === new Date(item.ts).toDateString();
      rows.push({ type: 'message', item, first: !connectsPrev, last: !connectsNext });
    }
    const day = new Date(item.ts).toDateString();
    if (!prev || new Date(prev.ts).toDateString() !== day) {
      const date = new Date(item.ts);
      const today = new Date();
      const label = day === today.toDateString() ? 'I dag' : day === new Date(today.getTime() - 86400_000).toDateString() ? 'I går' : date.toLocaleDateString('nb-NO', { weekday: 'long', day: 'numeric', month: 'long', ...(date.getFullYear() !== today.getFullYear() ? { year: 'numeric' } : {}) });
      rows.push({ type: 'day', key: `day-${day}`, label });
    }
  }
  return rows;
}

function Message({ row, roomId, onMenu, onReact, onRetry }: { row: Extract<Row, { type: 'message' }>; roomId: string; onMenu: (item: TimelineItem) => void; onReact: (item: TimelineItem, key: string) => void; onRetry: (item: TimelineItem) => void }) {
  const { tokens, radius } = useTheme();
  const { item, first, last } = row;
  const own = item.own;
  const bare = item.kind === 'sticker' || item.kind === 'image' || item.kind === 'video';
  const textColor = own ? tokens.textPrimary : tokens.textPrimary;
  return (
    <View style={[styles.messageRow, own && styles.ownRow, { marginTop: first ? 8 : 2 }]}>
      {!own ? <View style={{ width: 32 }}>{last ? <MatrixAvatar name={item.senderName} avatar={item.senderAvatar} size={30} /> : null}</View> : null}
      <View style={{ maxWidth: '80%', alignItems: own ? 'flex-end' : 'flex-start', gap: 3 }}>
        {first && !own ? <T size={12} weight={700} muted style={{ marginLeft: 6 }}>{item.senderName}</T> : null}
        <Pressable
          onLongPress={() => { void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {}); onMenu(item); }}
          delayLongPress={250}
          style={[
            bare ? styles.bareBubble : styles.bubble,
            !bare && { backgroundColor: own ? tokens.msgSelfBg : tokens.msgOtherBg, borderRadius: radius.lg },
            !bare && own && !last && { borderBottomRightRadius: 6 },
            !bare && !own && !last && { borderBottomLeftRadius: 6 },
            item.status === 'failed' && { borderColor: tokens.error, borderWidth: 1 },
          ]}
        >
          {item.replyTo ? (
            <View style={[styles.reply, { borderLeftColor: tokens.accent, backgroundColor: tokens.bgHover }]}>
              <T size={11} weight={700} color={tokens.accent}>{item.replyTo.senderName}</T>
              <T size={12} muted numberOfLines={2}>{item.replyTo.body}</T>
            </View>
          ) : null}
          <MessageContent item={item} roomId={roomId} color={textColor} />
          {!bare ? (
            <T size={10} muted style={{ alignSelf: 'flex-end', marginTop: 2 }}>
              {item.edited ? 'redigert · ' : ''}{new Date(item.ts).toLocaleTimeString('nb-NO', { hour: '2-digit', minute: '2-digit' })}{item.status === 'sending' ? ' · sender …' : ''}
            </T>
          ) : null}
        </Pressable>
        {item.status === 'failed' ? <Pressable onPress={() => onRetry(item)}><T size={12} color={tokens.error} weight={600}>Ikke sendt · Trykk for å prøve igjen</T></Pressable> : null}
        {item.reactions.length ? (
          <View style={[styles.reactions, own && { justifyContent: 'flex-end' }]}>
            {item.reactions.map((reaction) => (
              <Pressable key={reaction.key} onPress={() => onReact(item, reaction.key)} accessibilityLabel={`${reaction.key} ${reaction.count}: ${reaction.names.join(', ')}`} style={[styles.reaction, { backgroundColor: reaction.mine ? tokens.accentMuted : tokens.bgCard, borderColor: reaction.mine ? tokens.accent : tokens.border }]}>
                <T size={13}>{reaction.key}</T>
                <T size={11} weight={600} muted>{reaction.count}</T>
              </Pressable>
            ))}
          </View>
        ) : null}
      </View>
    </View>
  );
}

function VoiceRecorder({ onClose, onSend }: { onClose: () => void; onSend: (uri: string, durationMs: number) => Promise<void> }) {
  const { tokens } = useTheme();
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const state = useAudioRecorderState(recorder, 200);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    void (async () => {
      const permission = await requestRecordingPermissionsAsync();
      if (!permission.granted) { setError('GnomChat har ikke tilgang til mikrofonen.'); return; }
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      if (!active) return;
      await recorder.prepareToRecordAsync();
      recorder.record();
    })().catch((reason) => setError(errorOf(reason, 'Kunne ikke starte opptaket.')));
    return () => { active = false; void recorder.stop().catch(() => {}); void setAudioModeAsync({ allowsRecording: false }).catch(() => {}); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const send = async () => {
    setBusy(true);
    try {
      const durationMs = state.durationMillis;
      await recorder.stop();
      if (!recorder.uri) throw new Error('Fant ikke opptaket.');
      await onSend(recorder.uri, durationMs);
      onClose();
    } catch (reason) { setError(errorOf(reason, 'Kunne ikke sende lydmeldingen.')); setBusy(false); }
  };

  const seconds = Math.floor(state.durationMillis / 1000);
  return (
    <Sheet visible onClose={onClose} title="Lydmelding">
      <View style={{ alignItems: 'center', gap: 10, paddingVertical: 10 }}>
        <Ionicons name="mic" size={44} color={state.isRecording ? tokens.error : tokens.textMuted} />
        <T size={28} weight={700}>{Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, '0')}</T>
        <T muted size={13}>{state.isRecording ? 'Tar opp …' : 'Klargjør …'}</T>
      </View>
      <ErrorBox message={error} />
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Button variant="secondary" title="Avbryt" onPress={onClose} style={{ flex: 1 }} />
        <Button title="Send" icon="send" busy={busy} disabled={!state.isRecording || seconds < 1} onPress={() => void send()} style={{ flex: 1 }} />
      </View>
    </Sheet>
  );
}

/** One Matrix room: the timeline and the composer. */
export function ChatRoomScreen({ navigation, route }: Props) {
  const { roomId } = route.params;
  const { tokens, radius, font } = useTheme();
  const insets = useSafeAreaInsets();
  const room = useRoom(roomId);
  const timeline = useMatrixStore((s) => s.timelines[roomId]);
  const upload = useMatrixStore((s) => s.uploads[roomId]);
  const status = useMatrixStore((s) => s.status);
  const cryptoReady = useMatrixStore((s) => s.cryptoReady);
  const [draft, setDraft] = useState('');
  const [replyTo, setReplyTo] = useState<TimelineItem | null>(null);
  const [editing, setEditing] = useState<TimelineItem | null>(null);
  const [menu, setMenu] = useState<TimelineItem | null>(null);
  const [picker, setPicker] = useState<TimelineItem | null>(null);
  const [tools, setTools] = useState(false);
  const [stickers, setStickers] = useState(false);
  const [voice, setVoice] = useState(false);
  const [pollOpen, setPollOpen] = useState(false);
  const [question, setQuestion] = useState('');
  const [answers, setAnswers] = useState(['', '']);
  const [sending, setSending] = useState(false);
  const [paging, setPaging] = useState(false);
  const [error, setError] = useState('');
  const typingSent = useRef(0);
  const ready = status === 'online' || status === 'syncing' || status === 'offline';

  useLayoutEffect(() => {
    navigation.setOptions({
      headerTitle: () => (
        <Pressable onPress={() => navigation.navigate('ChatRoomSettings', { roomId })} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, maxWidth: 260 }}>
          <MatrixAvatar name={room?.name ?? route.params.title ?? ''} avatar={room?.avatar} size={30} />
          <View>
            <T weight={700} numberOfLines={1}>{room?.name ?? route.params.title ?? 'Chat'}</T>
            <T size={11} muted numberOfLines={1}>{timeline?.typing.length ? `${timeline.typing.join(', ')} skriver …` : `${room?.memberCount ?? ''} medlemmer${room?.encrypted ? ' · 🔒 kryptert' : ''}`}</T>
          </View>
        </Pressable>
      ),
      headerRight: () => <IconButton icon="information-circle-outline" label="Rominnstillinger" onPress={() => navigation.navigate('ChatRoomSettings', { roomId })} />,
    });
  }, [navigation, room, roomId, route.params.title, timeline?.typing]);

  useFocusEffect(useCallback(() => {
    setActiveChatRoom(roomId);
    void call('watchRoom', { roomId }).catch(() => {});
    return () => { setActiveChatRoom(null); void call('watchRoom', { roomId: null }).catch(() => {}); };
  }, [roomId]));

  // Mark as read while the room is open and new messages arrive.
  const newest = timeline?.items[timeline.items.length - 1]?.id;
  useEffect(() => {
    if (!newest || room?.membership !== 'join') return;
    const timer = setTimeout(() => void call('markRead', { roomId }).catch(() => {}), 600);
    return () => clearTimeout(timer);
  }, [newest, roomId, room?.membership]);

  const rows = useMemo(() => buildRows(timeline?.items ?? []), [timeline?.items]);

  const run = async (fn: () => Promise<unknown>, fallback: string) => {
    setError('');
    try { await fn(); } catch (reason) { setError(errorOf(reason, fallback)); }
  };

  const onType = (text: string) => {
    setDraft(text);
    if (Date.now() - typingSent.current > 4000 && text) { typingSent.current = Date.now(); void call('typing', { roomId, typing: true }).catch(() => {}); }
  };

  const send = async () => {
    const text = draft.trim();
    if (!text || sending) return;
    setSending(true);
    await run(async () => {
      if (editing) await call('edit', { roomId, eventId: editing.id, text });
      else await call('send', { roomId, text, replyTo: replyTo?.id });
      setDraft(''); setReplyTo(null); setEditing(null);
      typingSent.current = 0;
      void call('typing', { roomId, typing: false }).catch(() => {});
    }, 'Kunne ikke sende meldingen.');
    setSending(false);
  };

  const sendFileUri = async (uri: string, name: string, mimetype: string, extra: { voiceDuration?: number; sticker?: boolean } = {}) => {
    const base64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
    await call('sendFile', { roomId, base64, name, mimetype, ...extra });
  };

  const pickMedia = async (camera: boolean) => {
    setTools(false);
    await run(async () => {
      const permission = camera ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) throw new Error(camera ? 'GnomChat har ikke tilgang til kameraet.' : 'GnomChat har ikke tilgang til bildene dine.');
      const result = camera
        ? await ImagePicker.launchCameraAsync({ mediaTypes: ['images', 'videos'], quality: 1 })
        : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images', 'videos'], quality: 1, allowsMultipleSelection: true, selectionLimit: 10 });
      if (result.canceled) return;
      for (const asset of result.assets) {
        if (asset.type === 'video') {
          await sendFileUri(asset.uri, asset.fileName ?? 'video.mp4', asset.mimeType ?? 'video/mp4');
        } else {
          const image = await resizeImage(asset.uri, asset.width, asset.height, 2048, 0.85);
          await call('sendFile', { roomId, base64: image.base64, name: (asset.fileName ?? 'bilde').replace(/\.\w+$/, '') + '.jpg', mimetype: 'image/jpeg' });
        }
      }
    }, 'Kunne ikke sende filen.');
  };

  const pickFile = async () => {
    setTools(false);
    await run(async () => {
      const result = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true });
      if (result.canceled || !result.assets[0]) return;
      const asset = result.assets[0];
      await sendFileUri(asset.uri, asset.name, asset.mimeType ?? 'application/octet-stream');
    }, 'Kunne ikke sende filen.');
  };

  const shareLocation = async () => {
    setTools(false);
    await run(async () => {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!permission.granted) throw new Error('Posisjonstilgang ble avslått.');
      const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      await new Promise<void>((resolve, reject) => Alert.alert('Del posisjonen din?', `En engangsposisjon (±${Math.round(position.coords.accuracy ?? 0)} m) deles med alle i rommet.`, [
        { text: 'Avbryt', style: 'cancel', onPress: () => resolve() },
        { text: 'Del', onPress: () => void call('sendLocation', { roomId, latitude: position.coords.latitude, longitude: position.coords.longitude, accuracy: position.coords.accuracy ?? undefined }).then(() => resolve(), reject) },
      ]));
    }, 'Kunne ikke dele posisjonen.');
  };

  const react = (item: TimelineItem, key: string) => void run(() => call('react', { roomId, eventId: item.id, key }), 'Kunne ikke reagere.');

  const menuActions = (item: TimelineItem): MenuAction[] => {
    const actions: MenuAction[] = [];
    if (item.status === 'sent' && !['redacted', 'encrypted'].includes(item.kind)) actions.push({ label: 'Svar', icon: 'arrow-undo-outline', onPress: () => { setEditing(null); setReplyTo(item); } });
    if (item.body && ['text', 'notice', 'emote'].includes(item.kind)) actions.push({ label: 'Kopier', icon: 'copy-outline', onPress: () => void Clipboard.setStringAsync(item.body) });
    if (item.canEdit) actions.push({ label: 'Rediger', icon: 'create-outline', onPress: () => { setReplyTo(null); setEditing(item); setDraft(item.body); } });
    if (item.status === 'failed') actions.push({ label: 'Send på nytt', icon: 'refresh', onPress: () => void run(() => call('resend', { roomId, eventId: item.id }), 'Kunne ikke sende på nytt.') });
    if (item.canRedact) actions.push({ label: 'Slett', icon: 'trash-outline', danger: true, onPress: () => Alert.alert('Slette meldingen?', 'Den forsvinner for alle i rommet.', [{ text: 'Avbryt', style: 'cancel' }, { text: 'Slett', style: 'destructive', onPress: () => void run(() => call('redact', { roomId, eventId: item.id }), 'Kunne ikke slette.') }]) });
    return actions;
  };

  if (room?.membership === 'invite') {
    return (
      <ThemedBackground>
        <Empty icon="mail-unread-outline" title={room.name} text={`${room.inviter ? `${room.inviter} har invitert deg.` : 'Du er invitert til dette rommet.'}`} action={
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Button variant="secondary" title="Avslå" onPress={() => void run(async () => { await call('leave', { roomId }); navigation.goBack(); }, 'Kunne ikke avslå.')} />
            <Button title="Godta" onPress={() => void run(() => call('join', { target: roomId }), 'Kunne ikke bli med.')} />
          </View>
        } />
        <ErrorBox message={error} />
      </ThemedBackground>
    );
  }

  return (
    <ThemedBackground>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}>
        <FlatList
          inverted
          data={rows}
          keyExtractor={(row) => (row.type === 'day' ? row.key : row.item.id)}
          contentContainerStyle={{ paddingHorizontal: 10, paddingVertical: 8 }}
          renderItem={({ item: row }) => {
            if (row.type === 'day') return <View style={styles.day}><T size={11} weight={700} muted style={{ textTransform: 'capitalize' }}>{row.label}</T></View>;
            if (row.type === 'event') return <T size={11} muted style={{ textAlign: 'center', marginVertical: 4 }}>{row.item.body}</T>;
            return <Message row={row} roomId={roomId} onMenu={setMenu} onReact={react} onRetry={(item) => void run(() => call('resend', { roomId, eventId: item.id }), 'Kunne ikke sende på nytt.')} />;
          }}
          onEndReachedThreshold={0.4}
          onEndReached={() => {
            if (!timeline?.canPaginate || paging) return;
            setPaging(true);
            void call('paginate', { roomId }).catch(() => {}).finally(() => setPaging(false));
          }}
          ListFooterComponent={paging ? <ActivityIndicator color={tokens.accent} style={{ margin: 12 }} /> : !timeline?.canPaginate && rows.length ? <T size={11} muted style={{ textAlign: 'center', margin: 12 }}>Starten på samtalen</T> : null}
          ListEmptyComponent={<View style={{ transform: [{ scaleY: -1 }] }}><Empty icon="chatbubble-ellipses-outline" title={timeline ? 'Start samtalen' : 'Henter meldinger …'} text={timeline ? 'Send en melding, et bilde eller en avstemning.' : undefined} /></View>}
        />

        <View style={[styles.composer, { backgroundColor: tokens.navbarBg, borderTopColor: tokens.border, paddingBottom: Math.max(insets.bottom, 8) }]}>
          <ErrorBox message={error} />
          {upload !== undefined && upload !== null ? <T size={12} muted>Laster opp … {upload}%</T> : null}
          {replyTo || editing ? (
            <View style={[styles.replyBar, { borderLeftColor: tokens.accent }]}>
              <View style={{ flex: 1 }}>
                <T size={12} weight={700} color={tokens.accent}>{editing ? 'Redigerer melding' : `Svarer ${replyTo?.senderName}`}</T>
                <T size={12} muted numberOfLines={1}>{(editing ?? replyTo)?.body || 'Vedlegg'}</T>
              </View>
              <IconButton icon="close" size={18} label="Avbryt" onPress={() => { setReplyTo(null); if (editing) setDraft(''); setEditing(null); }} />
            </View>
          ) : null}
          <View style={styles.inputRow}>
            <IconButton icon={tools ? 'close-circle' : 'add-circle'} size={28} color={tokens.accent} label="Vedlegg og mer" disabled={!ready || Boolean(editing)} onPress={() => setTools(!tools)} />
            <TextInput
              value={draft}
              onChangeText={onType}
              placeholder={ready ? (room?.encrypted && !cryptoReady ? 'Klargjør kryptering …' : `Melding til ${room?.name ?? 'rommet'} …`) : 'Kobler til …'}
              placeholderTextColor={tokens.textMuted}
              multiline
              maxLength={20000}
              style={[styles.input, { color: tokens.textPrimary, backgroundColor: tokens.bgSecondary, borderRadius: radius.lg, fontFamily: font(400) }]}
            />
            {draft.trim() ? (
              <IconButton icon="send" size={24} color={tokens.accent} label="Send" disabled={sending} onPress={() => void send()} />
            ) : (
              <IconButton icon="mic-outline" size={26} color={tokens.accent} label="Lydmelding" disabled={!ready} onPress={() => setVoice(true)} />
            )}
          </View>
          {tools ? (
            <View style={styles.tools}>
              {[
                { icon: 'images-outline' as const, label: 'Galleri', onPress: () => void pickMedia(false) },
                { icon: 'camera-outline' as const, label: 'Kamera', onPress: () => void pickMedia(true) },
                { icon: 'document-outline' as const, label: 'Fil', onPress: () => void pickFile() },
                { icon: 'happy-outline' as const, label: 'Sticker', onPress: () => { setTools(false); setStickers(true); } },
                { icon: 'stats-chart-outline' as const, label: 'Avstemning', onPress: () => { setTools(false); setPollOpen(true); } },
                { icon: 'location-outline' as const, label: 'Posisjon', onPress: () => void shareLocation() },
              ].map((tool) => (
                <Pressable key={tool.label} onPress={tool.onPress} style={styles.tool}>
                  <View style={[styles.toolIcon, { backgroundColor: tokens.accentMuted }]}><Ionicons name={tool.icon} size={22} color={tokens.accent} /></View>
                  <T size={11}>{tool.label}</T>
                </Pressable>
              ))}
            </View>
          ) : null}
        </View>
      </KeyboardAvoidingView>

      <ActionSheet
        visible={Boolean(menu)}
        onClose={() => setMenu(null)}
        actions={menu ? [
          ...(menu.status === 'sent' && !['redacted', 'encrypted', 'membership'].includes(menu.kind) ? [{ label: `Reager  ${QUICK_EMOJIS.slice(0, 5).join(' ')}`, icon: 'happy-outline' as const, onPress: () => setPicker(menu) }] : []),
          ...menuActions(menu),
        ] : []}
      />
      <EmojiSheet visible={Boolean(picker)} onClose={() => setPicker(null)} onPick={(emoji) => picker && react(picker, emoji)} />
      <Sheet visible={stickers} onClose={() => setStickers(false)} title="Stickers">
        <View style={styles.stickers}>
          {STICKERS.map((emoji) => (
            <Pressable key={emoji} style={styles.sticker} onPress={() => { setStickers(false); void run(() => call('sendEmojiSticker', { roomId, emoji }), 'Kunne ikke sende stickeren.'); }}>
              <T size={40}>{emoji}</T>
            </Pressable>
          ))}
        </View>
      </Sheet>
      <Sheet visible={pollOpen} onClose={() => setPollOpen(false)} title="Ny avstemning">
        <Field label="Spørsmål" value={question} onChangeText={setQuestion} placeholder="Hva skal vi finne på?" maxLength={500} />
        {answers.map((answer, index) => (
          <Field key={index} label={`Alternativ ${index + 1}`} value={answer} maxLength={200} onChangeText={(value) => setAnswers((current) => current.map((old, i) => (i === index ? value : old)))} />
        ))}
        {answers.length < 10 ? <Button variant="ghost" small title="+ Legg til alternativ" onPress={() => setAnswers((current) => [...current, ''])} /> : null}
        <Button title="Opprett avstemning" disabled={!question.trim() || answers.filter((a) => a.trim()).length < 2 || new Set(answers.map((a) => a.trim())).size !== answers.length} onPress={() => {
          const list = answers.map((a) => a.trim()).filter(Boolean);
          setPollOpen(false);
          void run(async () => { await call('createPoll', { roomId, question: question.trim(), answers: list }); setQuestion(''); setAnswers(['', '']); }, 'Kunne ikke lage avstemningen.');
        }} />
      </Sheet>
      {voice ? <VoiceRecorder onClose={() => setVoice(false)} onSend={(uri, durationMs) => sendFileUri(uri, `lydmelding-${Date.now()}.m4a`, 'audio/mp4', { voiceDuration: durationMs })} /> : null}
    </ThemedBackground>
  );
}

const styles = StyleSheet.create({
  messageRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 6 },
  ownRow: { justifyContent: 'flex-end' },
  bubble: { paddingHorizontal: 12, paddingVertical: 8 },
  bareBubble: { gap: 4 },
  reply: { borderLeftWidth: 3, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, marginBottom: 6 },
  reactions: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  reaction: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 999, borderWidth: 1 },
  day: { alignItems: 'center', marginVertical: 10 },
  composer: { borderTopWidth: StyleSheet.hairlineWidth, paddingHorizontal: 8, paddingTop: 6, gap: 6 },
  replyBar: { flexDirection: 'row', alignItems: 'center', borderLeftWidth: 3, paddingLeft: 8 },
  inputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 4 },
  input: { flex: 1, minHeight: 40, maxHeight: 140, paddingHorizontal: 14, paddingTop: 10, paddingBottom: 10, fontSize: 15 },
  tools: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-around', paddingVertical: 8 },
  tool: { alignItems: 'center', gap: 4, width: 64, marginBottom: 6 },
  toolIcon: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  stickers: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center' },
  sticker: { width: 72, height: 72, alignItems: 'center', justifyContent: 'center' },
});
