import { useState } from 'react';
import { ActivityIndicator, Alert, Linking, Platform, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import * as Sharing from 'expo-sharing';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useTheme } from '@/theme/useTheme';
import { T } from '@/components/ui';
import { MarkdownText } from '@/components/MarkdownText';
import { ImageViewer } from '@/components/ImageViewer';
import { loadMedia, useMatrixMedia } from '@/matrix/media';
import { call } from '@/matrix/engine';
import type { TimelineItem } from '@/matrix/protocol.generated';

const sizeLabel = (size?: number) => (size ? (size > 1048576 ? `${(size / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(size / 1024))} KB`) : '');
const duration = (ms?: number) => { const s = Math.round((ms ?? 0) / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

function ImageMessage({ item, sticker }: { item: TimelineItem; sticker?: boolean }) {
  const { width } = useWindowDimensions();
  const { tokens, radius } = useTheme();
  const media = item.media!;
  // Unencrypted images use a server thumbnail; encrypted ones must be decrypted whole.
  const { uri, error } = useMatrixMedia(media, media.file ? undefined : 800);
  const [open, setOpen] = useState(false);
  const max = sticker ? 140 : Math.min(width * 0.68, 320);
  const ratio = media.w && media.h ? media.w / media.h : 4 / 3;
  const w = ratio >= 1 ? max : max * ratio;
  const h = ratio >= 1 ? max / ratio : max;
  return (
    <Pressable onPress={() => uri && setOpen(true)} style={{ width: w, height: h, borderRadius: radius.md, overflow: 'hidden', backgroundColor: sticker ? 'transparent' : tokens.bgSecondary, alignItems: 'center', justifyContent: 'center' }}>
      {uri ? <Image source={{ uri }} style={StyleSheet.absoluteFill} contentFit={sticker ? 'contain' : 'cover'} /> : error ? <T size={12} muted>Kunne ikke hente bildet</T> : <ActivityIndicator color={tokens.accent} />}
      {open && uri ? <ImageViewer uri={uri} onClose={() => setOpen(false)} /> : null}
    </Pressable>
  );
}

function VideoPlayer({ uri }: { uri: string }) {
  const player = useVideoPlayer(uri, (p) => { p.loop = false; });
  return <VideoView player={player} style={{ width: '100%', height: '100%' }} nativeControls contentFit="contain" allowsFullscreen />;
}

function VideoMessage({ item }: { item: TimelineItem }) {
  const { radius } = useTheme();
  const { width } = useWindowDimensions();
  const media = item.media!;
  const [requested, setRequested] = useState(false);
  const { uri, error } = useMatrixMedia(media, undefined, requested);
  const thumb = useMatrixMedia(media.thumbnail, media.thumbnail?.file ? undefined : 400);
  const w = Math.min(width * 0.68, 320);
  const h = media.w && media.h ? w * (media.h / media.w) : w * 0.6;
  return (
    <View style={{ width: w, height: Math.min(h, 420), borderRadius: radius.md, overflow: 'hidden', backgroundColor: '#000', alignItems: 'center', justifyContent: 'center' }}>
      {uri ? <VideoPlayer uri={uri} /> : (
        <Pressable onPress={() => setRequested(true)} style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }]}>
          {thumb.uri ? <Image source={{ uri: thumb.uri }} style={StyleSheet.absoluteFill} contentFit="cover" /> : null}
          {requested && !error ? <ActivityIndicator color="#fff" /> : <Ionicons name="play-circle" size={54} color="#fff" />}
          {error ? <T size={12} color="#fff">{error}</T> : null}
          <T size={11} color="#fff" style={{ position: 'absolute', bottom: 6, right: 8 }}>{sizeLabel(media.size)}</T>
        </Pressable>
      )}
    </View>
  );
}

function AudioPlayer({ uri, item }: { uri: string; item: TimelineItem }) {
  const { tokens } = useTheme();
  const player = useAudioPlayer(uri);
  const status = useAudioPlayerStatus(player);
  const playing = status.playing;
  const total = (status.duration || (item.media?.duration ?? 0) / 1000) || 0;
  const progress = total ? status.currentTime / total : 0;
  return (
    <View style={styles.audio}>
      <Pressable accessibilityLabel={playing ? 'Pause' : 'Spill av'} onPress={() => { if (playing) player.pause(); else { if (status.didJustFinish || progress >= 0.99) void player.seekTo(0); player.play(); } }}>
        <Ionicons name={playing ? 'pause-circle' : 'play-circle'} size={38} color={tokens.accent} />
      </Pressable>
      <View style={{ flex: 1, gap: 4 }}>
        <View style={[styles.track, { backgroundColor: tokens.border }]}><View style={[styles.track, { width: `${Math.min(100, progress * 100)}%`, backgroundColor: tokens.accent }]} /></View>
        <T size={11} muted>{playing ? duration(status.currentTime * 1000) : duration(item.media?.duration ?? total * 1000)}{item.media?.voice ? ' · Lydmelding' : ''}</T>
      </View>
    </View>
  );
}

function AudioMessage({ item }: { item: TimelineItem }) {
  const { tokens } = useTheme();
  const { uri, error } = useMatrixMedia(item.media);
  if (uri) return <AudioPlayer uri={uri} item={item} />;
  return <View style={styles.audio}>{error ? <T size={12} muted>{error}</T> : <ActivityIndicator color={tokens.accent} />}</View>;
}

function FileMessage({ item }: { item: TimelineItem }) {
  const { tokens } = useTheme();
  const media = item.media!;
  const [busy, setBusy] = useState(false);
  const open = async () => {
    setBusy(true);
    try {
      const path = await loadMedia(media, undefined, media.name);
      if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(path, { mimeType: media.mimetype, dialogTitle: media.name });
    } catch (error) { Alert.alert('Kunne ikke åpne filen', error instanceof Error ? error.message : ''); }
    finally { setBusy(false); }
  };
  return (
    <Pressable onPress={() => void open()} style={styles.file}>
      <Ionicons name="document-attach-outline" size={26} color={tokens.accent} />
      <View style={{ flex: 1 }}>
        <T weight={600} numberOfLines={2}>{media.name}</T>
        <T size={11} muted>{sizeLabel(media.size)}{media.mimetype ? ` · ${media.mimetype}` : ''}</T>
      </View>
      {busy ? <ActivityIndicator color={tokens.accent} /> : <Ionicons name="download-outline" size={20} color={tokens.textMuted} />}
    </Pressable>
  );
}

function LocationMessage({ item }: { item: TimelineItem }) {
  const { tokens } = useTheme();
  const { latitude, longitude, accuracy } = item.location!;
  const url = Platform.OS === 'ios' ? `maps:0,0?q=${latitude},${longitude}` : `geo:${latitude},${longitude}?q=${latitude},${longitude}(Delt posisjon)`;
  return (
    <Pressable onPress={() => void Linking.openURL(url).catch(() => Linking.openURL(`https://www.openstreetmap.org/?mlat=${latitude}&mlon=${longitude}#map=16/${latitude}/${longitude}`))} style={styles.file}>
      <Ionicons name="location" size={26} color={tokens.error} />
      <View style={{ flex: 1 }}>
        <T weight={600}>Delt posisjon</T>
        <T size={11} muted>{latitude.toFixed(5)}, {longitude.toFixed(5)}{accuracy ? ` · ±${Math.round(accuracy)} m` : ''}</T>
      </View>
      <Ionicons name="open-outline" size={18} color={tokens.textMuted} />
    </Pressable>
  );
}

function PollMessage({ item, roomId }: { item: TimelineItem; roomId: string }) {
  const { tokens, radius } = useTheme();
  const poll = item.poll;
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  if (!poll) return <T muted>Avstemningen kunne ikke leses.</T>;
  const showResults = poll.ended || poll.disclosed;
  const act = (fn: () => Promise<unknown>) => { setBusy(true); void fn().catch(() => Alert.alert('Kunne ikke stemme', 'Prøv igjen.')).finally(() => setBusy(false)); };
  return (
    <View style={{ gap: 6, minWidth: 220 }}>
      <T size={11} weight={700} muted>{poll.ended ? 'AVSLUTTET AVSTEMNING' : 'AVSTEMNING'}</T>
      <T weight={700}>{poll.question}</T>
      {poll.answers.map((answer) => {
        const checked = (selected.length ? selected : poll.answers.filter((a) => a.mine).map((a) => a.id)).includes(answer.id);
        const share = showResults && poll.totalVotes ? answer.count / poll.totalVotes : 0;
        return (
          <Pressable key={answer.id} disabled={busy || poll.ended} onPress={() => {
            if (poll.maxSelections === 1) act(() => call('votePoll', { roomId, eventId: item.id, answerIds: [answer.id] }));
            else setSelected((current) => (current.includes(answer.id) ? current.filter((id) => id !== answer.id) : current.length < poll.maxSelections ? [...current, answer.id] : current));
          }} style={[styles.pollAnswer, { borderColor: checked ? tokens.accent : tokens.border, borderRadius: radius.sm }]}>
            <View style={[StyleSheet.absoluteFill, { width: `${share * 100}%`, backgroundColor: tokens.accentMuted }]} />
            <T style={{ flex: 1 }} weight={checked ? 700 : 400}>{checked ? '✓ ' : ''}{answer.text}</T>
            {showResults ? <T size={12} muted>{answer.count}</T> : null}
          </Pressable>
        );
      })}
      {poll.maxSelections > 1 && !poll.ended ? <Pressable disabled={busy || !selected.length} onPress={() => act(() => call('votePoll', { roomId, eventId: item.id, answerIds: selected }))}><T color={tokens.accent} weight={700}>Stem</T></Pressable> : null}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <T size={11} muted>{showResults ? `${poll.totalVotes} stemmer` : 'Resultatet vises når avstemningen avsluttes'}</T>
        {poll.canEnd ? <Pressable disabled={busy} onPress={() => act(() => call('endPoll', { roomId, eventId: item.id }))}><T size={12} weight={700} color={tokens.error}>Avslutt</T></Pressable> : null}
      </View>
    </View>
  );
}

/** The body of one chat message, by kind. */
export function MessageContent({ item, roomId, color }: { item: TimelineItem; roomId: string; color: string }) {
  switch (item.kind) {
    case 'image': return <ImageMessage item={item} />;
    case 'sticker': return <ImageMessage item={item} sticker />;
    case 'video': return <VideoMessage item={item} />;
    case 'audio': return <AudioMessage item={item} />;
    case 'file': return <FileMessage item={item} />;
    case 'location': return <LocationMessage item={item} />;
    case 'poll': return <PollMessage item={item} roomId={roomId} />;
    case 'encrypted': return <T muted size={13} style={{ fontStyle: 'italic' }}>🔒 Venter på dekrypteringsnøkkel. Gjenopprett historikken i chatinnstillingene.</T>;
    case 'redacted': return <T muted size={13} style={{ fontStyle: 'italic' }}>Meldingen er slettet.</T>;
    case 'emote': return <T style={{ fontStyle: 'italic' }} color={color}>* {item.senderName} {item.body}</T>;
    default: return <MarkdownText content={item.body} contentType="text/markdown" color={color} />;
  }
}

const styles = StyleSheet.create({
  audio: { flexDirection: 'row', alignItems: 'center', gap: 8, minWidth: 220 },
  track: { height: 4, borderRadius: 2 },
  file: { flexDirection: 'row', alignItems: 'center', gap: 10, minWidth: 220 },
  pollAnswer: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 8, overflow: 'hidden' },
});
