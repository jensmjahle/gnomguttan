import { memo, useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable, Modal, Linking, Alert, Platform, ActivityIndicator } from 'react-native';
import { Image } from 'expo-image';
import { useVideoPlayer, VideoView } from 'expo-video';
import * as FileSystem from 'expo-file-system/legacy';
import { MarkdownText } from './MarkdownText';
import { useTheme } from '@/theme/useTheme';
import { matrixMediaUri } from '@/services/matrix';
import type { MatrixMessage } from '@/types/matrix';
import { MatrixAvatar } from './MatrixAvatar';

function Video({ uri }: { uri: string }) {
  const player = useVideoPlayer(uri, value => value.play());
  return <VideoView player={player} style={{ flex: 1 }} nativeControls contentFit="contain" fullscreenOptions={{ enable: true }} />;
}
function MessageBubbleImpl({ message, myUserId, showHeader, onLongPress, onReact }: {
  message: MatrixMessage; myUserId: string; showHeader: boolean;
  onLongPress: () => void; onReact: (key: string, removeIds: string[]) => void;
}) {
  const { tokens, font, radius } = useTheme();
  const self = message.sender === myUserId;
  const [busy, setBusy] = useState(false);
  const [media, setMedia] = useState<string | null>(null);
  const [showMedia, setShowMedia] = useState(false);
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
      if (['m.image', 'm.video', 'm.audio'].includes(message.msgtype)) setShowMedia(true);
      else await Linking.openURL(Platform.OS === 'android' ? await FileSystem.getContentUriAsync(uri) : uri);
    } catch (error) { Alert.alert('Vedlegg', error instanceof Error ? error.message : 'Kunne ikke åpne vedlegget.'); }
    finally { setBusy(false); }
  }
  return <View style={[styles.row, { justifyContent: self ? 'flex-end' : 'flex-start' }]}>
    {!self && <View style={styles.avatarSlot}>{showHeader && <MatrixAvatar name={message.senderName} mxc={message.avatar} size={32} />}</View>}
    <View style={styles.bubbleWrap}>
      {showHeader && !self && <Text style={[styles.sender, { color: tokens.textSecondary, fontFamily: font(600) }]}>{message.senderName}</Text>}
      <Pressable onLongPress={onLongPress} style={[styles.bubble, { backgroundColor: self ? tokens.msgSelfBg : tokens.msgOtherBg, borderColor: tokens.border, borderRadius: radius.md, opacity: message.pending ? 0.6 : 1 }]}>
        {message.media ? <Pressable onPress={() => void openMedia()} onLongPress={onLongPress}>
          {busy ? <ActivityIndicator color={tokens.accent} /> : media && message.msgtype === 'm.image' ? <Image source={{ uri: media }} style={styles.image} contentFit="cover" /> : <Text style={{ color: tokens.accent, fontFamily: font(500) }}>{message.msgtype === 'm.image' ? '🖼' : message.msgtype === 'm.video' ? '▶' : '📎'} {message.body}</Text>}
        </Pressable> : <MarkdownText content={message.body} contentType="text/plain" color={tokens.textPrimary} />}
        <Text style={[styles.time, { color: message.failed ? tokens.error : tokens.textMuted, fontFamily: font(400) }]}>{message.failed ? 'Ikke sendt' : new Date(message.timestamp).toLocaleTimeString('nb-NO', { hour: '2-digit', minute: '2-digit' })}{self && message.readBy.length > 0 ? ' · Lest' : ''}</Text>
      </Pressable>
      {message.reactions.length > 0 && <View style={{ flexDirection: 'row', gap: 6, marginTop: 3 }}>{message.reactions.map(reaction => <Pressable key={reaction.key} onPress={() => onReact(reaction.key, reaction.mine ? reaction.eventIds : [])}><Text style={{ color: reaction.mine ? tokens.accent : tokens.textMuted }}>{reaction.key} {reaction.count}</Text></Pressable>)}</View>}
    </View>
    {showMedia && media && <Modal visible animationType="fade" onRequestClose={() => setShowMedia(false)}><View style={{ flex: 1, backgroundColor: '#111', paddingTop: 50 }}>
      <Pressable onPress={() => setShowMedia(false)} style={{ padding: 16 }}><Text style={{ color: '#fff', fontSize: 18 }}>Lukk</Text></Pressable>
      {message.msgtype === 'm.image' ? <Image source={{ uri: media }} style={{ flex: 1 }} contentFit="contain" /> : <Video uri={media} />}
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
