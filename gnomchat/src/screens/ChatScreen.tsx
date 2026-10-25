import { useCallback, useEffect, useRef, useState } from 'react';
import { View, TextInput, Pressable, Text, StyleSheet, FlatList, ActivityIndicator, Alert, AppState } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useRoute, type RouteProp } from '@react-navigation/native';
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

const EMPTY: MatrixMessage[] = [];
export function ChatScreen() {
  const { roomId } = useRoute<RouteProp<RootStackParamList, 'Chat'>>().params;
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
  const [error, setError] = useState('');
  const [editId, setEditId] = useState<string | null>(null);
  const [replyTo, setReplyTo] = useState<MatrixMessage | null>(null);
  const [atBottom, setAtBottom] = useState(true);
  const sendLock = useRef(false);
  const errorText = (reason: unknown) => reason instanceof Error ? reason.message : 'Matrix-operasjonen feilet.';
  useFocusEffect(useCallback(() => {
    useMatrixMobileStore.setState({ activeRoom: roomId, chatVisible: AppState.currentState === 'active' });
    void matrixCall('open', { id: roomId }).catch(reason => setError(errorText(reason)));
    const sub = AppState.addEventListener('change', state => useMatrixMobileStore.setState({ chatVisible: state === 'active' }));
    const notifications = getNotifications();
    if (notifications) void notifications.getPresentedNotificationsAsync().then(items => Promise.all(items.filter(item => item.request.content.data?.roomId === roomId).map(item => notifications.dismissNotificationAsync(item.request.identifier)))).catch(() => undefined);
    return () => {
      sub.remove(); useMatrixMobileStore.setState({ chatVisible: false, activeRoom: null });
      void matrixCall('typing', { id: roomId, typing: false }).catch(() => undefined);
    };
  }, [roomId]));
  const visible = useMatrixMobileStore(s => s.chatVisible);
  useEffect(() => {
    const last = messages.at(-1);
    if (!visible || !atBottom || !last || last.pending || last.failed) return;
    void matrixCall('read', { id: roomId, eventId: last.id }).catch(() => undefined);
  }, [messages, roomId, visible, atBottom]);
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
    if (loadingMore || messages.length < 40) return;
    setLoadingMore(true);
    try { await matrixCall('history'); } catch (reason) { setError(errorText(reason)); }
    finally { setLoadingMore(false); }
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
  async function react(message: MatrixMessage, key: string, removeIds: string[] = []) {
    try { await matrixCall('react', { id: roomId, eventId: message.id, key, removeIds }); }
    catch (reason) { setError(errorText(reason)); }
  }
  function actions(message: MatrixMessage) {
    const own = message.sender === myUserId;
    Alert.alert(message.senderName, message.body.slice(0, 180), [
      { text: 'Svar', onPress: () => { setReplyTo(message); setEditId(null); } },
      { text: '👍', onPress: () => void react(message, '👍') },
      ...(own && !message.redacted && !message.media ? [{ text: 'Rediger', onPress: () => { setDraft(message.body); setEditId(message.id); setReplyTo(null); } }] : []),
      ...(own && !message.redacted ? [{ text: 'Slett', style: 'destructive' as const, onPress: () => Alert.alert('Slette meldingen?', 'Dette kan ikke angres.', [
        { text: 'Avbryt', style: 'cancel' }, { text: 'Slett', style: 'destructive', onPress: () => void matrixCall('remove', { id: roomId, eventId: message.id }).catch(reason => setError(errorText(reason))) },
      ]) }] : []),
      { text: 'Avbryt', style: 'cancel' },
    ]);
  }
  const data = [...messages].reverse();
  return <ThemedBackground><View style={[styles.flex, { paddingBottom: keyboardHeight > 0 ? keyboardHeight + insets.bottom : 0 }]}>
    {error ? <Pressable onPress={() => setError('')} style={{ padding: 12 }}><Text style={{ color: tokens.error }}>{error}</Text></Pressable> : null}
    <FlatList data={data} inverted keyExtractor={item => item.id} contentContainerStyle={styles.listContent}
      onScroll={event => setAtBottom(event.nativeEvent.contentOffset.y < 35)} scrollEventThrottle={100}
      onEndReached={() => void loadOlder()} onEndReachedThreshold={0.4}
      ListEmptyComponent={<View style={styles.center}><Text style={{ color: tokens.textMuted }}>Ingen meldinger ennå.</Text></View>}
      ListFooterComponent={loadingMore ? <ActivityIndicator style={{ marginVertical: 10 }} color={tokens.accent} /> : null}
      renderItem={({ item, index }) => <MessageBubble message={item} myUserId={myUserId} showHeader={!data[index + 1] || data[index + 1].sender !== item.sender}
        onLongPress={() => actions(item)} onReact={(key, removeIds) => void react(item, key, removeIds)} />} />
    {typing.length > 0 && <Text style={{ color: tokens.textMuted, paddingHorizontal: 16, fontSize: 12 }}>{typing.join(', ')} skriver …</Text>}
    {(replyTo || editId) && <Pressable onPress={() => { setReplyTo(null); setEditId(null); }} style={{ padding: 10, backgroundColor: tokens.navbarBg }}><Text numberOfLines={1} style={{ color: tokens.textSecondary }}>{editId ? 'Redigerer melding' : `Svar til ${replyTo?.senderName}: ${replyTo?.body}`} · Avbryt</Text></Pressable>}
    <View style={[styles.inputBar, { backgroundColor: tokens.navbarBg, borderColor: tokens.border, paddingBottom: keyboardHeight > 0 ? 8 : insets.bottom || 8 }]}>
      <Pressable disabled={uploading} style={styles.attachBtn} onPress={() => Alert.alert('Send vedlegg', undefined, [
        { text: 'Bilde eller video', onPress: () => void pick('image') }, { text: 'Fil', onPress: () => void pick('file') }, { text: 'Avbryt', style: 'cancel' },
      ])}>{uploading ? <ActivityIndicator color={tokens.accent} /> : <Text style={{ color: tokens.accent, fontSize: 26 }}>＋</Text>}</Pressable>
      <TextInput value={draft} onChangeText={setDraft} editable={!sending} placeholder="Message…" placeholderTextColor={tokens.textMuted} multiline
        style={[styles.input, { color: tokens.textPrimary, backgroundColor: tokens.bgPrimary, borderColor: tokens.border, borderRadius: radius.lg, fontFamily: font(400) }]} />
      <Pressable onPress={() => void send()} disabled={!draft.trim() || sending} style={[styles.sendBtn, { backgroundColor: tokens.accent, borderRadius: radius.full, opacity: !draft.trim() || sending ? 0.5 : 1 }]}>
        <Text style={{ color: tokens.accentFg, fontSize: 18, fontFamily: font(700) }}>➤</Text>
      </Pressable>
    </View>
  </View></ThemedBackground>;
}
const styles = StyleSheet.create({
  flex: { flex: 1 }, center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }, listContent: { paddingVertical: 10 },
  inputBar: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, paddingHorizontal: 10, paddingTop: 8, borderTopWidth: StyleSheet.hairlineWidth },
  input: { flex: 1, maxHeight: 120, minHeight: 42, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 10, fontSize: 16 },
  attachBtn: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center' }, sendBtn: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center' },
});
