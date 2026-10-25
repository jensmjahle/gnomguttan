import { memo, useCallback, useEffect, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { View, Text, StyleSheet, Pressable, Modal, Linking, Alert, Platform, ActivityIndicator } from 'react-native';
import { Image } from 'expo-image';
import { useVideoPlayer, VideoView } from 'expo-video';
import * as FileSystem from 'expo-file-system/legacy';
import { MarkdownText } from './MarkdownText';
import { useTheme } from '@/theme/useTheme';
import { matrixMediaUri } from '@/services/matrix';
import type { MatrixMessage } from '@/types/matrix';
import { MatrixAvatar } from './MatrixAvatar';
import { MatrixReactionBar } from './MatrixReactions';
import { MatrixPollCard } from './MatrixPollCard';
import { MatrixAudioPlayer } from './MatrixAudioPlayer';
import { useMatrixMobileStore } from '@/store/matrixMobileStore';
import { mediaKind } from '@/utils/matrixMessages';

function Video({ uri }: { uri: string }) {
  const player = useVideoPlayer(uri, value => value.play());
  useFocusEffect(useCallback(() => () => { try { player.pause(); } catch { /* Already released on unmount. */ } }, [player]));
  return <VideoView player={player} style={{ flex: 1 }} nativeControls contentFit="contain" fullscreenOptions={{ enable: true }} />;
}
function MessageBubbleImpl({ message, myUserId, showHeader, connectedBefore = false, connectedAfter = false, roomId, onLongPress, onSenderPress }: {
  message: MatrixMessage; myUserId: string; showHeader: boolean; roomId: string; connectedBefore?: boolean; connectedAfter?: boolean;
  onLongPress: () => void; onSenderPress?: () => void;
}) {
  const { tokens, font, radius } = useTheme();
  const self = message.sender === myUserId;
  const replied = useMatrixMobileStore(state => message.replyTo ? state.messages[roomId]?.find(item => item.id === message.replyTo) : undefined);
  const [busy, setBusy] = useState(false);
  const [media, setMedia] = useState<string | null>(null);
  const [showMedia, setShowMedia] = useState(false);
  const [inlineMedia, setInlineMedia] = useState(false);
  const kind = mediaKind(message); const audio = kind === 'audio'; const video = kind === 'video';
  useEffect(() => {
    if (message.msgtype !== 'm.image' || !message.media) return;
    let active = true;
    void matrixMediaUri(message).then(uri => { if (active) setMedia(uri); }).catch(() => undefined);
    return () => { active = false; };
  }, [message.id, message.media?.url, message.media?.file?.url]);
  async function openMedia() {
    if (busy) return;
    setBusy(true);
    try {
      const uri = media || await matrixMediaUri(message); setMedia(uri);
      if (audio || video) setInlineMedia(true);
      else if (message.msgtype === 'm.image' || message.media?.mimetype?.startsWith('image/')) setShowMedia(true);
      else await Linking.openURL(Platform.OS === 'android' ? await FileSystem.getContentUriAsync(uri) : uri);
    } catch (error) { Alert.alert('Vedlegg', error instanceof Error ? error.message : 'Kunne ikke åpne vedlegget.'); }
    finally { setBusy(false); }
  }
  return <View style={[styles.row, { justifyContent: self ? 'flex-end' : 'flex-start', marginTop: connectedBefore ? 1 : 12, marginBottom: connectedAfter ? 1 : 4 }]}>
    {!self && <View style={[styles.avatarSlot, { justifyContent: 'flex-end' }]}>{!connectedAfter && <Pressable accessibilityLabel={`Åpne profilen til ${message.senderName}`} onPress={onSenderPress}><MatrixAvatar name={message.senderName} mxc={message.avatar} size={30} /></Pressable>}</View>}
    <View style={[styles.bubbleWrap, { alignItems: self ? 'flex-end' : 'flex-start' }]}>
      {showHeader && !self && <Text style={[styles.sender, { color: tokens.textSecondary, fontFamily: font(600) }]}>{message.senderName}</Text>}
      {message.replyTo && <View style={{ padding: 10, borderLeftWidth: 3, borderLeftColor: tokens.accent, backgroundColor: tokens.bgHover, borderRadius: 10, marginBottom: 3 }}><Text style={{ color: tokens.accent, fontFamily: font(600), fontSize: 12 }}>{replied?.senderName || 'Svar på en melding'}</Text><Text numberOfLines={2} style={{ color: tokens.textMuted, fontSize: 12 }}>{replied?.body || 'Meldingen er i eldre historikk.'}</Text></View>}
      <Pressable onLongPress={onLongPress} style={[styles.bubble, { backgroundColor: message.sticker ? 'transparent' : self ? tokens.msgSelfBg : tokens.msgOtherBg, borderColor: tokens.border, borderWidth: message.sticker ? 0 : StyleSheet.hairlineWidth, borderRadius: 22, ...(self ? { borderTopRightRadius: connectedBefore ? 7 : 22, borderBottomRightRadius: connectedAfter ? 7 : 22 } : { borderTopLeftRadius: connectedBefore ? 7 : 22, borderBottomLeftRadius: connectedAfter ? 7 : 22 }), opacity: message.pending ? 0.6 : 1 }]}>
        {message.redacted ? <Text style={{ color: tokens.textMuted }}>Meldingen er slettet.</Text> : message.poll ? <MatrixPollCard roomId={roomId} message={message} /> : message.location ? <Pressable onPress={() => void Linking.openURL(`https://www.openstreetmap.org/?mlat=${message.location!.latitude}&mlon=${message.location!.longitude}#map=16/${message.location!.latitude}/${message.location!.longitude}`).catch(() => Alert.alert('Kunne ikke åpne kartet'))} style={{ gap: 5, minWidth: 160 }}><Text style={{ color: tokens.accent, fontFamily: font(700) }}>📍 Delt posisjon</Text><Text style={{ color: tokens.textSecondary }}>{message.location.latitude.toFixed(5)}, {message.location.longitude.toFixed(5)}</Text><Text style={{ color: tokens.textMuted, fontSize: 12 }}>Åpne i kart{message.location.accuracy !== undefined ? ` · ±${Math.round(message.location.accuracy)} m` : ''}</Text></Pressable> : message.media ? <Pressable onPress={() => void openMedia()} onLongPress={onLongPress}>
          {inlineMedia && media && audio ? <MatrixAudioPlayer uri={media} /> : inlineMedia && media && video ? <View style={{ width: 230, height: 180 }}><Video uri={media} /></View> : busy ? <ActivityIndicator color={tokens.accent} /> : media && message.msgtype === 'm.image' ? <Image source={{ uri: media }} style={styles.image} contentFit="cover" /> : <Text style={{ color: tokens.accent, fontFamily: font(500) }}>{audio ? '▶ Spill av lydmelding' : video ? '▶ Spill av video' : message.msgtype === 'm.image' ? '🖼' : '📎'} {audio ? '' : message.body}</Text>}
        </Pressable> : <MarkdownText content={message.body} contentType="text/markdown" color={tokens.textPrimary} />}
        {message.edited && <Text style={{ color: tokens.textMuted, fontSize: 10 }}>redigert</Text>}
      </Pressable>
      {!connectedAfter && <Text style={[styles.time, { color: message.failed ? tokens.error : tokens.textMuted, fontFamily: font(400) }]}>{message.failed ? 'Ikke sendt · hold inne for å prøve igjen' : new Date(message.timestamp).toLocaleTimeString('nb-NO', { hour: '2-digit', minute: '2-digit' })}{self && message.readBy.length > 0 ? ' · Lest' : ''}</Text>}
      <MatrixReactionBar roomId={roomId} message={message} showAdd={false} />
    </View>
    {showMedia && media && <Modal visible animationType="fade" onRequestClose={() => setShowMedia(false)}><View style={{ flex: 1, backgroundColor: '#111', paddingTop: 50 }}>
      <Pressable onPress={() => setShowMedia(false)} style={{ padding: 16 }}><Text style={{ color: '#fff', fontSize: 18 }}>Lukk</Text></Pressable>
      {message.msgtype === 'm.image' || message.media?.mimetype?.startsWith('image/') ? <Image source={{ uri: media }} style={{ flex: 1 }} contentFit="contain" /> : <Video uri={media} />}
    </View></Modal>}
  </View>;
}
const styles = StyleSheet.create({
  row: { flexDirection: 'row', marginVertical: 2, paddingHorizontal: 10, gap: 8 }, avatarSlot: { width: 32 },
  avatar: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' }, bubbleWrap: { maxWidth: '80%' },
  sender: { fontSize: 12, marginBottom: 2, marginLeft: 4 }, bubble: { paddingHorizontal: 12, paddingVertical: 8, borderWidth: StyleSheet.hairlineWidth },
  time: { fontSize: 10, alignSelf: 'flex-end', marginTop: 2 }, image: { width: 220, height: 220, borderRadius: 8, marginBottom: 4 },
});
export const MessageBubble = memo(MessageBubbleImpl);
