import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, TextInput, Pressable, Text, StyleSheet, FlatList, ActivityIndicator, Alert, AppState } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useRoute, useNavigation, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { useKeyboardHeight } from '@/hooks/useKeyboardHeight';
import { MessageBubble } from '@/components/MessageBubble';
import { useTheme } from '@/theme/useTheme';
import { ThemedBackground } from '@/theme/ThemedBackground';
import { matrixCall } from '@/services/matrix';
import { useMatrixMobileStore } from '@/store/matrixMobileStore';
import { getNotifications } from '@/services/notifications';
import type { RootStackParamList } from '@/navigation/types';
import type { MatrixMessage } from '@/types/matrix';
import { messagesConnect } from '@/utils/matrixMessages';
import { MatrixChatTools } from '@/components/MatrixChatTools';
import { MatrixSheet, MatrixButton, MatrixNotice } from '@/components/MatrixForms';
import { MatrixReactionPicker, REACTION_EMOJIS } from '@/components/MatrixReactions';
import { MatrixUserProfile } from '@/components/MatrixUserProfile';
import { MarkdownText } from '@/components/MarkdownText';

const EMPTY: MatrixMessage[] = [];
export function ChatScreen() {
  const { roomId } = useRoute<RouteProp<RootStackParamList, 'Chat'>>().params;
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { tokens, font, radius } = useTheme();
  const insets = useSafeAreaInsets();
  const keyboardHeight = useKeyboardHeight();
  const myUserId = useMatrixMobileStore(s => s.userId) || '';
  const messages = useMatrixMobileStore(s => s.messages[roomId] || EMPTY);
  const typing = useMatrixMobileStore(s => s.typing);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true); const historyLock = useRef(false);
  const [error, setError] = useState('');
  const [editId, setEditId] = useState<string | null>(null);
  const [replyTo, setReplyTo] = useState<MatrixMessage | null>(null);
  const [atBottom, setAtBottom] = useState(true);
  const sendLock = useRef(false);
  const list = useRef<FlatList<MatrixMessage>>(null); const readSent = useRef<string | null>(null);
  const [boundary, setBoundary] = useState<string | null>(null); const [boundaryReady, setBoundaryReady] = useState(false);
  const [tools, setTools] = useState(false); const [selected, setSelected] = useState<MatrixMessage | null>(null); const [reaction, setReaction] = useState<MatrixMessage | null>(null);
  const [profile, setProfile] = useState<string | null>(null); const [formatting, setFormatting] = useState(false); const [preview, setPreview] = useState(false);
  const [selection, setSelection] = useState({ start: 0, end: 0 });
  useEffect(() => { navigation.setOptions({ headerRight: () => <Pressable accessibilityLabel="Rominnstillinger og medlemmer" hitSlop={12} onPress={() => navigation.navigate('RoomSettings', { roomId })}><Ionicons name="information-circle-outline" color={tokens.accent} size={25} /></Pressable> }); }, [navigation, roomId, tokens.accent]);
  const errorText = (reason: unknown) => reason instanceof Error ? reason.message : 'Matrix-operasjonen feilet.';
  useFocusEffect(useCallback(() => {
    let active = true; setBoundaryReady(false); setBoundary(null); readSent.current = null;
    useMatrixMobileStore.setState({ activeRoom: roomId, chatVisible: AppState.currentState === 'active' });
    void matrixCall<{ firstUnreadId: string | null; hasMore: boolean }>('open', { id: roomId }).then(value => { if (active) { setBoundary(value.firstUnreadId); setHasMore(value.hasMore); setBoundaryReady(true); } }).catch(reason => { if (active) setError(errorText(reason)); });
    const sub = AppState.addEventListener('change', state => useMatrixMobileStore.setState({ chatVisible: state === 'active' }));
    const notifications = getNotifications();
    if (notifications) void notifications.getPresentedNotificationsAsync().then(items => Promise.all(items.filter(item => item.request.content.data?.roomId === roomId).map(item => notifications.dismissNotificationAsync(item.request.identifier)))).catch(() => undefined);
    return () => {
      active = false;
      sub.remove(); useMatrixMobileStore.setState({ chatVisible: false, activeRoom: null });
      void matrixCall('typing', { id: roomId, typing: false }).catch(() => undefined);
    };
  }, [roomId]));
  const visible = useMatrixMobileStore(s => s.chatVisible);
  useEffect(() => {
    const last = messages.at(-1);
    if (!visible || !atBottom || !boundaryReady || !last || last.pending || last.failed || readSent.current === last.id) return;
    readSent.current = last.id;
    void matrixCall('read', { id: roomId, eventId: last.id }).catch(() => { if (readSent.current === last.id) readSent.current = null; });
  }, [messages, roomId, visible, atBottom, boundaryReady]);
  useEffect(() => {
    const timer = setTimeout(() => { if (visible) void matrixCall('typing', { id: roomId, typing: !!draft }).catch(() => undefined); }, 400);
    return () => clearTimeout(timer);
  }, [draft, roomId, visible]);
  async function send() {
    const body = draft.trim();
    if (!body || sendLock.current) return;
    sendLock.current = true; setSending(true); setError('');
    try { await matrixCall('send', { id: roomId, body, editId, replyTo: replyTo?.id }); setDraft(''); setEditId(null); setReplyTo(null); }
    catch (reason) { setError(errorText(reason)); }
    finally { sendLock.current = false; setSending(false); }
  }
  async function loadOlder() {
    if (historyLock.current || !boundaryReady || !hasMore) return;
    historyLock.current = true;
    setLoadingMore(true);
    try { const value = await matrixCall<{ hasMore: boolean }>('history'); setHasMore(value.hasMore); } catch (reason) { setError(errorText(reason)); }
    finally { historyLock.current = false; setLoadingMore(false); }
  }
  async function upload(uri: string, name: string, mimetype: string, size?: number) {
    if (size && size > 20 * 1024 * 1024) throw new Error('Velg et vedlegg under 20 MB.');
    const info = await FileSystem.getInfoAsync(uri);
    if (info.exists && info.size > 20 * 1024 * 1024) throw new Error('Velg et vedlegg under 20 MB.');
    const base64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
    await matrixCall('upload', { id: roomId, base64, name, mimetype,
      msgtype: mimetype.startsWith('image/') ? 'm.image' : mimetype.startsWith('video/') ? 'm.video' : mimetype.startsWith('audio/') ? 'm.audio' : 'm.file' });
  }
  async function pick(kind: 'image' | 'file') {
    if (uploading) return;
    setUploading(true); setError('');
    try {
      if (kind === 'image') {
        const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images', 'videos'], quality: 0.8 });
        if (result.canceled || !result.assets[0]) return;
        const asset = result.assets[0]; await upload(asset.uri, asset.fileName || 'bilde.jpg', asset.mimeType || 'image/jpeg', asset.fileSize);
      } else {
        const result = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true });
        if (result.canceled || !result.assets[0]) return;
        const asset = result.assets[0]; await upload(asset.uri, asset.name, asset.mimeType || 'application/octet-stream', asset.size);
      }
    } catch (reason) { setError(errorText(reason)); }
    finally { setUploading(false); }
  }
  const data = useMemo(() => [...messages].reverse(), [messages]);
  function insert(before: string, after = before) { const start = Math.min(selection.start, draft.length); const end = Math.min(selection.end, draft.length); setDraft(draft.slice(0, start) + before + draft.slice(start, end) + after + draft.slice(end)); }
  return <ThemedBackground><View style={[styles.flex, { paddingBottom: keyboardHeight > 0 ? keyboardHeight + insets.bottom : 0 }]}>
    {error ? <Pressable onPress={() => setError('')} style={{ padding: 12 }}><Text style={{ color: tokens.error }}>{error}</Text></Pressable> : null}
    <FlatList ref={list} data={data} inverted keyExtractor={item => item.id} contentContainerStyle={styles.listContent} keyboardShouldPersistTaps="handled"
      onScroll={event => setAtBottom(event.nativeEvent.contentOffset.y < 35)} scrollEventThrottle={100}
      onEndReached={() => void loadOlder()} onEndReachedThreshold={0.4}
      ListEmptyComponent={<View style={styles.center}><Text style={{ color: tokens.textMuted }}>Ingen meldinger ennå.</Text></View>}
      ListFooterComponent={loadingMore ? <ActivityIndicator style={{ marginVertical: 10 }} color={tokens.accent} /> : hasMore && boundaryReady ? <Pressable onPress={() => void loadOlder()} style={{ padding: 12 }}><Text style={{ color: tokens.accent, textAlign: 'center' }}>Vis eldre meldinger</Text></Pressable> : null}
      renderItem={({ item, index }) => {
        const older = data[index + 1]; const newer = data[index - 1];
        const connectedBefore = item.id !== boundary && messagesConnect(older, item);
        const connectedAfter = newer?.id !== boundary && messagesConnect(item, newer);
        const day = !older || new Date(older.timestamp).toDateString() !== new Date(item.timestamp).toDateString();
        return <View>{day && <Text style={{ alignSelf: 'center', color: tokens.textMuted, fontSize: 12, paddingVertical: 14 }}>{new Date(item.timestamp).toLocaleDateString('nb-NO', { day: 'numeric', month: 'long', year: 'numeric' })}</Text>}
          {item.id === boundary && <View accessibilityRole="header" style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 15 }}><View style={{ flex: 1, height: 1, backgroundColor: tokens.accent }} /><Text style={{ color: tokens.accent, fontFamily: font(700), fontSize: 12 }}>Nye meldinger</Text><View style={{ flex: 1, height: 1, backgroundColor: tokens.accent }} /></View>}
          <MessageBubble message={item} roomId={roomId} myUserId={myUserId} showHeader={!connectedBefore} connectedBefore={connectedBefore} connectedAfter={connectedAfter} onLongPress={() => setSelected(item)} onSenderPress={() => setProfile(item.sender)} />
        </View>;
      }} />
    {!atBottom && <Pressable onPress={() => { list.current?.scrollToOffset({ offset: 0, animated: true }); setAtBottom(true); }} style={{ alignSelf: 'center', flexDirection: 'row', gap: 6, borderRadius: 18, padding: 10, backgroundColor: tokens.bgCard }}><Ionicons name="arrow-down" size={16} color={tokens.accent} /><Text style={{ color: tokens.accent }}>Til siste melding</Text></Pressable>}
    {typing.length > 0 && <Text style={{ color: tokens.textMuted, paddingHorizontal: 16, fontSize: 12 }}>{typing.join(', ')} skriver …</Text>}
    {(replyTo || editId) && <Pressable onPress={() => { setReplyTo(null); setEditId(null); }} style={{ padding: 10, backgroundColor: tokens.navbarBg }}><Text numberOfLines={1} style={{ color: tokens.textSecondary }}>{editId ? 'Redigerer melding' : `Svar til ${replyTo?.senderName}: ${replyTo?.body}`} · Avbryt</Text></Pressable>}
    {formatting && <View style={{ backgroundColor: tokens.navbarBg, padding: 10, flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>{[['Fet', '**', '**'], ['Kursiv', '*', '*'], ['Kode', '`', '`'], ['Gjennomstrøket', '~~', '~~'], ['Sitat', '\n> ', ''], ['Liste', '\n- ', ''], ['Lenke', '[', '](https://)']].map(([title, before, after]) => <Pressable key={title} onPress={() => insert(before, after)}><Text style={{ color: tokens.accent, fontFamily: font(600) }}>{title}</Text></Pressable>)}<Pressable onPress={() => setPreview(value => !value)}><Text style={{ color: tokens.accent }}>{preview ? 'Rediger' : 'Forhåndsvis'}</Text></Pressable></View>}
    {preview && <View style={{ padding: 14, maxHeight: 150, backgroundColor: tokens.bgCard }}><MarkdownText content={draft || 'Forhåndsvisningen vises her.'} contentType="text/markdown" color={tokens.textPrimary} /></View>}
    <View style={[styles.inputBar, { backgroundColor: tokens.navbarBg, borderColor: tokens.border, paddingBottom: keyboardHeight > 0 ? 8 : insets.bottom || 8 }]}>
      <Pressable accessibilityLabel="Vedlegg, stickers, avstemning og posisjon" disabled={uploading} style={styles.attachBtn} onPress={() => setTools(true)}>{uploading ? <ActivityIndicator color={tokens.accent} /> : <Ionicons name="add-circle-outline" color={tokens.accent} size={29} />}</Pressable>
      <TextInput value={draft} onChangeText={setDraft} onSelectionChange={event => setSelection(event.nativeEvent.selection)} editable={!sending} placeholder="Skriv en melding …" placeholderTextColor={tokens.textMuted} multiline
        style={[styles.input, { color: tokens.textPrimary, backgroundColor: tokens.bgPrimary, borderColor: tokens.border, borderRadius: radius.lg, fontFamily: font(400) }]} />
      <Pressable onPress={() => void send()} disabled={!draft.trim() || sending} style={[styles.sendBtn, { backgroundColor: tokens.accent, borderRadius: radius.full, opacity: !draft.trim() || sending ? 0.5 : 1 }]}>
        <Text style={{ color: tokens.accentFg, fontSize: 18, fontFamily: font(700) }}>➤</Text>
      </Pressable>
    </View>
    <Pressable accessibilityLabel="Vis Markdown-formatering" onPress={() => setFormatting(value => !value)} style={{ backgroundColor: tokens.navbarBg, paddingHorizontal: 16, paddingBottom: 8 }}><Text style={{ color: tokens.textMuted, fontSize: 12 }}>Aa · Markdown{formatting ? ' ▴' : ' ▾'}</Text></Pressable>
    <MatrixChatTools visible={tools} roomId={roomId} onClose={() => setTools(false)} onFile={kind => void pick(kind)} onEmoji={emoji => insert(emoji, '')} />
    <MatrixSheet title="Meldingshandlinger" visible={!!selected} onClose={() => setSelected(null)}>
      <MatrixNotice text={selected?.body.slice(0, 200)} />
      {selected && <MatrixNotice text={new Date(selected.timestamp).toLocaleString('nb-NO')} />}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 12 }}>{REACTION_EMOJIS.slice(0, 6).map(emoji => <Pressable key={emoji} accessibilityLabel={`Reager med ${emoji}`} onPress={() => { if (!selected) return; const eventId = selected.id; setSelected(null); void matrixCall('react', { id: roomId, eventId, key: emoji }).catch(reason => setError(reason.message)); }} style={{ padding: 7 }}><Text style={{ fontSize: 28 }}>{emoji}</Text></Pressable>)}<Pressable accessibilityLabel="Flere reaksjoner" onPress={() => { setReaction(selected); setSelected(null); }}><Ionicons name="add-circle-outline" color={tokens.textMuted} size={25} /></Pressable></View>
      <MatrixButton title="Svar" secondary onPress={() => { setReplyTo(selected); setEditId(null); setSelected(null); }} />
      {selected?.sender === myUserId && !selected.media && !selected.poll && !selected.location && !selected.redacted && <MatrixButton title="Rediger" secondary onPress={() => { setDraft(selected.body); setEditId(selected.id); setReplyTo(null); setSelected(null); }} />}
      {selected?.failed && <MatrixButton title="Prøv å sende på nytt" onPress={() => { void matrixCall('retry', { id: roomId, eventId: selected.id }).catch(reason => setError(reason.message)); setSelected(null); }} />}
      {selected?.readBy.length ? <MatrixNotice text={`Lest av ${selected.readBy.join(', ')}`} /> : null}
      {selected?.sender === myUserId && !selected.redacted && <MatrixButton title="Slett meldingen" secondary danger onPress={() => { const eventId = selected.id; setSelected(null); Alert.alert('Slette meldingen?', 'Dette kan ikke angres.', [{ text: 'Avbryt', style: 'cancel' }, { text: 'Slett', style: 'destructive', onPress: () => void matrixCall('remove', { id: roomId, eventId }).catch(reason => setError(reason.message)) }]); }} />}
    </MatrixSheet>
    {reaction && <MatrixReactionPicker visible roomId={roomId} message={reaction} onClose={() => setReaction(null)} />}
    <MatrixUserProfile userId={profile} onClose={() => setProfile(null)} onDM={(id, title) => navigation.push('Chat', { roomId: id, title })} />
  </View></ThemedBackground>;
}
const styles = StyleSheet.create({
  flex: { flex: 1 }, center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }, listContent: { paddingVertical: 10 },
  inputBar: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, paddingHorizontal: 10, paddingTop: 8, borderTopWidth: StyleSheet.hairlineWidth },
  input: { flex: 1, maxHeight: 120, minHeight: 42, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 10, fontSize: 16 },
  attachBtn: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center' }, sendBtn: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center' },
});
