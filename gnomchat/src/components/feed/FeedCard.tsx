import { useState } from 'react';
import { Alert, Linking, Pressable, StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import * as Clipboard from 'expo-clipboard';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/theme/useTheme';
import { useAuthStore } from '@/store/authStore';
import { Avatar } from '@/components/Avatar';
import { Button, Card, T } from '@/components/ui';
import { ActionSheet, EmojiSheet } from '@/components/Sheet';
import { ImageViewer } from '@/components/ImageViewer';
import { ReactionBar, groupFeedReactions } from '@/components/feed/ReactionBar';
import { CommentText } from '@/components/comments/CommentText';
import { setFeedReactions } from '@/data/feedCache';
import { storeEvent, useCommunityEvents } from '@/data/events';
import { setThreadMute } from '@/services/comments';
import { statusrapportImageUrl, toggleReaction } from '@/services/feed';
import { respondToCommunityEvent } from '@/services/communityEvents';
import { errorText } from '@/services/appApi';
import { config } from '@/config';
import { formatRelativeTime } from '@/utils/relativeTime.generated';
import { getEventTimeLabel, getEventTypeLabel } from '@/utils/communityEvents';
import type { AnyFeedItem, CommunityEvent, EventRsvpStatus, FeedBump, FeedMuteLevel, KnownFeedItem } from '@/types';

const BADGES: Record<string, { label: string; icon: keyof typeof Ionicons.glyphMap }> = {
  community_event_created: { label: 'Arrangement', icon: 'calendar' },
  overheard_added: { label: 'Overhørt', icon: 'ear' },
  github_issue_opened: { label: 'Issue åpnet', icon: 'bug' },
  github_issue_closed: { label: 'Issue lukket', icon: 'checkmark-circle' },
  github_issue_reopened: { label: 'Issue gjenåpnet', icon: 'bug' },
  github_pr_opened: { label: 'PR åpnet', icon: 'git-pull-request' },
  github_pr_merged: { label: 'PR merget', icon: 'git-merge' },
  github_pr_closed: { label: 'PR lukket', icon: 'close-circle' },
  github_pr_reopened: { label: 'PR gjenåpnet', icon: 'git-pull-request' },
  github_release_published: { label: 'Release', icon: 'rocket' },
  pigs_round_score: { label: 'Grisekast', icon: 'dice' },
  krokodil_result: { label: 'Krokodil', icon: 'skull' },
  wheel_spin_result: { label: 'Lykkehjulet', icon: 'sync' },
  lamp_toggled: { label: 'Lampa til Jens', icon: 'bulb' },
  statusrapport_created: { label: 'Statusrapport', icon: 'megaphone' },
};

const BUMPS: Record<FeedBump['reason'], (name: string) => string> = {
  mention: (name) => `${name} nevnte deg`,
  reply: (name) => `${name} svarte deg`,
  own_post: (name) => `${name} kommenterte innlegget ditt`,
  post_mention: (name) => `${name} kommenterte et innlegg du er nevnt i`,
  participant: (name) => `${name} kommenterte også`,
};

const RSVP: Array<{ value: EventRsvpStatus; label: string }> = [
  { value: 'coming', label: 'Kommer' },
  { value: 'maybe', label: 'Kanskje' },
  { value: 'cannot', label: 'Kan ikke' },
];

function EventBody({ event }: { event: CommunityEvent }) {
  const { tokens } = useTheme();
  const navigation = useNavigation();
  const uid = useAuthStore((s) => s.user?.uid);
  const [busy, setBusy] = useState(false);
  const { data: events } = useCommunityEvents();
  const live = events?.find((item) => item.id === event.id) ?? event;
  const mine = live.responses?.find((response) => response.uid === uid)?.status;
  const coming = live.responses?.filter((response) => response.status === 'coming').length ?? 0;

  const respond = async (status: EventRsvpStatus) => {
    setBusy(true);
    try {
      storeEvent(await respondToCommunityEvent(event.id, status));
    } catch (error) { Alert.alert('Kunne ikke svare', errorText(error)); } finally { setBusy(false); }
  };

  return (
    <Pressable onPress={() => navigation.navigate('EventDetail', { eventId: event.id, title: event.title })} style={{ gap: 6 }}>
      {live.imageUrl ? <Image source={{ uri: live.imageUrl }} style={styles.eventImage} contentFit="cover" cachePolicy="memory-disk" /> : null}
      <T weight={800} size={18}>{live.title}</T>
      <T muted size={13}>{getEventTimeLabel(live)}{live.location ? ` · ${live.location}` : ''}</T>
      <T muted size={12}>{getEventTypeLabel(live)} · {coming} kommer</T>
      <View style={styles.rsvp}>
        {RSVP.map((option) => (
          <Button key={option.value} small variant={mine === option.value ? 'primary' : 'secondary'} title={option.label} disabled={busy} onPress={() => void respond(option.value)} style={{ flex: 1 }} />
        ))}
      </View>
      {!mine ? <T size={12} color={tokens.warning}>Du har ikke svart ennå.</T> : null}
    </Pressable>
  );
}

function Body({ item }: { item: KnownFeedItem }) {
  const { tokens, radius } = useTheme();
  const navigation = useNavigation();
  const [viewer, setViewer] = useState<string | null>(null);
  const actor = item.actorName ?? 'Noen';

  switch (item.type) {
    case 'community_event_created':
      return <EventBody event={item.payload} />;
    case 'overheard_added':
      return (
        <View style={[styles.quote, { borderLeftColor: tokens.accent }]}>
          <T size={17} style={{ fontStyle: 'italic' }}>«{item.payload.text}»</T>
          <T muted size={13}>— {item.payload.author}</T>
        </View>
      );
    case 'statusrapport_created': {
      const image = item.payload.imageId ? statusrapportImageUrl(item.payload.imageId) : null;
      return (
        <View style={{ gap: 8 }}>
          <CommentText text={item.payload.text} mentions={item.payload.mentions} />
          {image ? (
            <Pressable onPress={() => setViewer(image)}>
              <Image source={{ uri: image }} style={[styles.image, { borderRadius: radius.md }]} contentFit="cover" cachePolicy="memory-disk" />
            </Pressable>
          ) : null}
          {viewer ? <ImageViewer uri={viewer} onClose={() => setViewer(null)} /> : null}
        </View>
      );
    }
    case 'github_issue_opened': case 'github_issue_closed': case 'github_issue_reopened':
    case 'github_pr_opened': case 'github_pr_merged': case 'github_pr_closed': case 'github_pr_reopened': {
      const payload = item.payload;
      const isIssue = item.type.startsWith('github_issue');
      return (
        <Pressable onPress={() => (isIssue ? navigation.navigate('DevIssue', { number: payload.number, title: payload.title }) : void Linking.openURL(payload.url))} style={{ gap: 4 }}>
          <T size={12} muted>{payload.repo} · {payload.user}</T>
          <T weight={700}><T weight={700} color={tokens.textMuted}>#{payload.number} </T>{payload.title}</T>
          {payload.body ? <T size={13} muted numberOfLines={4}>{payload.body}</T> : null}
        </Pressable>
      );
    }
    case 'github_release_published':
      return (
        <Pressable onPress={() => void Linking.openURL(item.payload.url)} style={{ gap: 4 }}>
          <T size={12} muted>{item.payload.repo} · {item.payload.user}</T>
          <T weight={700}>{item.payload.tagName}{item.payload.name !== item.payload.tagName ? ` · ${item.payload.name}` : ''}{item.payload.prerelease ? ' (pre-release)' : ''}</T>
          {item.payload.body ? <T size={13} muted numberOfLines={6}>{item.payload.body}</T> : null}
        </Pressable>
      );
    case 'pigs_round_score':
      return <T>{actor} fikk {item.payload.score} poeng på grisekast!</T>;
    case 'wheel_spin_result':
      return <T>{actor} spant hjulet! Med 1/{item.payload.totalOptions} odds, vinneren ble {item.payload.winner.toUpperCase()}!</T>;
    case 'krokodil_result':
      return <T>{actor} spilte Krokodil med {item.payload.players} spillere. Krokodillen bet {item.payload.loser.toUpperCase()} på trykk nr. {item.payload.presses}!</T>;
    case 'lamp_toggled':
      return <T>{item.payload.isOn ? `${actor} skrudde på lampa til Jens!` : `${actor} skrudde av lampa til Jens.`}</T>;
    default:
      return <T muted>Denne typen innlegg vises på nettsiden.</T>;
  }
}

/** One post in the feed: badge, author, body, reactions and a comment summary. */
export function FeedCard({ item, standalone }: { item: AnyFeedItem; standalone?: boolean }) {
  const { tokens, radius } = useTheme();
  const navigation = useNavigation();
  const uid = useAuthStore((s) => s.user?.uid);
  const [picker, setPicker] = useState(false);
  const [menu, setMenu] = useState(false);
  const badge = BADGES[item.type] ?? { label: 'Innlegg', icon: 'newspaper' as const };
  const comments = item.comments ?? [];
  const commentCount = comments.reduce((sum, comment) => sum + (comment.deleted ? 0 : 1) + (comment.replies?.length ?? 0), 0);
  const isEvent = item.type === 'community_event_created';
  const open = () => (isEvent
    ? navigation.navigate('EventDetail', { eventId: (item.payload as CommunityEvent).id, title: (item.payload as CommunityEvent).title })
    : navigation.navigate('FeedPost', { feedItemId: item.id }));

  const react = async (emoji: string) => {
    try { setFeedReactions(item.id, await toggleReaction(item.id, emoji)); } catch { /* the SSE echo or next refresh fixes it */ }
  };
  const mute = (level: FeedMuteLevel | null) => void setThreadMute(item, level).catch((error) => Alert.alert('Kunne ikke endre varsler', errorText(error)));

  return (
    <Card style={{ gap: 10 }}>
      {item.bump && !standalone ? (
        <Pressable onPress={open}><T size={12} color={tokens.accent} weight={600}>💬 {BUMPS[item.bump.reason]?.(item.bump.byName) ?? BUMPS.participant(item.bump.byName)} · {formatRelativeTime(item.bump.at)}</T></Pressable>
      ) : null}
      <View style={styles.header}>
        <View style={[styles.badge, { backgroundColor: tokens.accentMuted, borderRadius: radius.sm }]}>
          <Ionicons name={badge.icon} size={12} color={tokens.accent} />
          <T size={11} weight={700} color={tokens.accent}>{badge.label}</T>
        </View>
        {item.actorName ? (
          <Pressable style={styles.actor} onPress={() => item.actorUid && navigation.navigate('Profile', { uid: item.actorUid })}>
            {item.actorUid ? <Avatar uid={item.actorUid} name={item.actorName} size={20} avatarUpdatedAt={(item.payload as { actorAvatarUpdatedAt?: number })?.actorAvatarUpdatedAt} /> : null}
            <T size={13} weight={600} numberOfLines={1}>{item.actorName}</T>
          </Pressable>
        ) : <View style={{ flex: 1 }} />}
        {item.mute ? <T size={12}>{item.mute === 'all' ? '🔕' : '@'}</T> : null}
        <Pressable onPress={open}><T size={12} muted>{formatRelativeTime(item.createdAt)}</T></Pressable>
        <Pressable hitSlop={10} accessibilityLabel="Innleggsvalg" onPress={() => setMenu(true)}><Ionicons name="ellipsis-horizontal" size={18} color={tokens.textMuted} /></Pressable>
      </View>

      <Body item={item as KnownFeedItem} />

      <View style={styles.footer}>
        <View style={{ flex: 1 }}>
          <ReactionBar groups={groupFeedReactions(item.reactions, uid)} onToggle={(emoji) => void react(emoji)} onAdd={() => setPicker(true)} />
        </View>
        {!standalone ? (
          <Pressable onPress={open} style={styles.comments} accessibilityLabel="Kommentarer">
            <Ionicons name="chatbubble-outline" size={16} color={tokens.textMuted} />
            <T size={13} muted>{isEvent ? 'Åpne' : commentCount}</T>
          </Pressable>
        ) : null}
      </View>

      {!standalone && !isEvent && comments.length > 0 ? (
        <Pressable onPress={open} style={[styles.lastComment, { backgroundColor: tokens.bgSecondary, borderRadius: radius.md }]}>
          {(() => {
            const last = [...comments].reverse().find((comment) => !comment.deleted);
            return last ? <T size={13} numberOfLines={2}><T size={13} weight={700}>{last.author.name}: </T>{last.text || '📷 Bilde'}</T> : null;
          })()}
        </Pressable>
      ) : null}

      <EmojiSheet visible={picker} onClose={() => setPicker(false)} onPick={(emoji) => void react(emoji)} />
      <ActionSheet
        visible={menu}
        onClose={() => setMenu(false)}
        title="Varsler for innlegget"
        actions={[
          { label: 'Alle', hint: 'Løftes opp ved ny aktivitet', selected: !item.mute, onPress: () => mute(null) },
          { label: 'Bare når jeg blir nevnt', hint: 'Kun @omtaler varsler deg', selected: item.mute === 'mentions', onPress: () => mute('mentions') },
          { label: 'Av', hint: 'Ingen varsler fra innlegget', selected: item.mute === 'all', onPress: () => mute('all') },
          { label: 'Kopier lenke', icon: 'link-outline', onPress: () => void Clipboard.setStringAsync(`${config.appApiHost}/innlegg/${item.id}`) },
        ]}
      />
    </Card>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 7, paddingVertical: 3 },
  actor: { flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 },
  footer: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  comments: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 6 },
  quote: { borderLeftWidth: 3, paddingLeft: 12, gap: 4 },
  image: { width: '100%', aspectRatio: 4 / 3 },
  eventImage: { width: '100%', height: 140, borderRadius: 10 },
  rsvp: { flexDirection: 'row', gap: 6, marginTop: 4 },
  lastComment: { padding: 8 },
});
