import { useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import * as Clipboard from 'expo-clipboard';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/theme/useTheme';
import { useAuthStore } from '@/store/authStore';
import { useAppUsers } from '@/data/users';
import { useTypingNames } from '@/store/typingStore';
import { Avatar } from '@/components/Avatar';
import { Button, ErrorBox, Field, IconButton, T } from '@/components/ui';
import { ActionSheet, EmojiSheet, Sheet, type MenuAction } from '@/components/Sheet';
import { ReactionBar, groupCommentReactions } from '@/components/feed/ReactionBar';
import { CommentText } from '@/components/comments/CommentText';
import { MentionInput } from '@/components/comments/MentionInput';
import { ImageViewer } from '@/components/ImageViewer';
import {
  addComment, addReply, deleteComment, deleteReply, editComment, editReply, sendTyping, toggleCommentReaction, voteCommentPoll,
} from '@/services/comments';
import { commentImageUrl } from '@/services/feed';
import { errorText } from '@/services/appApi';
import { pickImage, type PickedImage } from '@/utils/images';
import { formatRelativeTime } from '@/utils/relativeTime.generated';
import type { CommentMention, CommentThreadRef, CommunityEventPoll, FeedComment, FeedCommentReply } from '@/types';

type Target = { commentId: string; replyId?: string };

function PollView({ poll, thread, commentId }: { poll: CommunityEventPoll; thread: CommentThreadRef; commentId: string }) {
  const { tokens, radius } = useTheme();
  const uid = useAuthStore((s) => s.user?.uid);
  const total = new Set(poll.options.flatMap((option) => option.votes)).size;
  const [busy, setBusy] = useState(false);
  return (
    <View style={[styles.poll, { borderColor: tokens.border, borderRadius: radius.md }]}>
      <T weight={700}>{poll.question}</T>
      {poll.options.map((option) => {
        const mine = uid !== undefined && option.votes.includes(uid);
        const share = total ? option.votes.length / total : 0;
        return (
          <Pressable key={option.id} disabled={busy} onPress={() => { setBusy(true); void voteCommentPoll(thread, commentId, option.id).catch((e) => Alert.alert('Kunne ikke stemme', errorText(e))).finally(() => setBusy(false)); }} style={[styles.pollOption, { borderColor: mine ? tokens.accent : tokens.border, borderRadius: radius.sm }]}>
            <View style={[StyleSheet.absoluteFill, { width: `${share * 100}%`, backgroundColor: tokens.accentMuted, borderRadius: radius.sm }]} />
            {option.imageUrl ? <Image source={{ uri: option.imageUrl }} style={styles.pollImage} /> : null}
            <T style={{ flex: 1 }} weight={mine ? 700 : 400}>{mine ? '✓ ' : ''}{option.label}</T>
            <T size={12} muted>{option.votes.length}</T>
          </Pressable>
        );
      })}
      <T size={12} muted>{total} har stemt{poll.allowMultiple ? ' · flere valg' : ''}</T>
    </View>
  );
}

function Entry({ entry, thread, commentId, replyId, highlighted, onAction, onReply }: {
  entry: FeedComment | FeedCommentReply; thread: CommentThreadRef; commentId: string; replyId?: string; highlighted?: boolean;
  onAction: (target: Target, entry: FeedComment | FeedCommentReply) => void; onReply: (commentId: string, name: string) => void;
}) {
  const { tokens, radius } = useTheme();
  const navigation = useNavigation();
  const uid = useAuthStore((s) => s.user?.uid);
  const { data: users = [] } = useAppUsers();
  const [viewer, setViewer] = useState<string | null>(null);
  const [picker, setPicker] = useState(false);
  const nameOf = (id: number) => users.find((user) => user.uid === id)?.name ?? 'Noen';
  const comment = entry as FeedComment;
  const image = entry.imageId ? commentImageUrl(entry.imageId) : comment.imageUrl;

  if (comment.deleted) {
    return <View style={styles.entry}><T muted size={13} style={{ fontStyle: 'italic' }}>Kommentaren er slettet.</T></View>;
  }

  return (
    <Pressable onLongPress={() => onAction({ commentId, replyId }, entry)} delayLongPress={300} style={[styles.entry, highlighted && { backgroundColor: tokens.accentMuted, borderRadius: radius.md }]}>
      <Pressable onPress={() => navigation.navigate('Profile', { uid: entry.author.uid })}>
        <Avatar uid={entry.author.uid} name={entry.author.name} avatarUpdatedAt={entry.author.avatarUpdatedAt} size={replyId ? 26 : 32} />
      </Pressable>
      <View style={{ flex: 1, gap: 4 }}>
        <View style={[styles.bubble, { backgroundColor: tokens.bgSecondary, borderRadius: radius.md }]}>
          <View style={styles.meta}>
            <T weight={700} size={13}>{entry.author.name}</T>
            <T size={11} muted>{formatRelativeTime(entry.createdAt)}{entry.editedAt ? ' · redigert' : ''}</T>
          </View>
          {entry.text ? <CommentText text={entry.text} mentions={entry.mentions} size={14} /> : null}
          {image ? (
            <Pressable onPress={() => setViewer(image)}>
              <Image source={{ uri: image }} style={[styles.image, { borderRadius: radius.sm }]} contentFit="cover" cachePolicy="memory-disk" />
            </Pressable>
          ) : null}
          {comment.poll ? <PollView poll={comment.poll} thread={thread} commentId={commentId} /> : null}
        </View>
        <View style={styles.entryActions}>
          <ReactionBar compact groups={groupCommentReactions(entry.reactions, uid, nameOf)} onToggle={(emoji) => void toggleCommentReaction(thread, commentId, emoji, replyId).catch(() => {})} />
          <Pressable hitSlop={6} onPress={() => setPicker(true)}><T size={12} weight={600} muted>Reager</T></Pressable>
          <Pressable hitSlop={6} onPress={() => onReply(commentId, entry.author.name)}><T size={12} weight={600} muted>Svar</T></Pressable>
          <Pressable hitSlop={6} accessibilityLabel="Flere valg" onPress={() => onAction({ commentId, replyId }, entry)}><T size={12} weight={600} muted>⋯</T></Pressable>
        </View>
      </View>
      <EmojiSheet visible={picker} onClose={() => setPicker(false)} onPick={(emoji) => void toggleCommentReaction(thread, commentId, emoji, replyId).catch(() => {})} />
      {viewer ? <ImageViewer uri={viewer} onClose={() => setViewer(null)} /> : null}
    </Pressable>
  );
}

/** Comments with replies, reactions, images, mentions and (for events) polls — like the website. */
export function CommentSection({ thread, comments, allowImage = true, allowPoll = false, highlightId }: {
  thread: CommentThreadRef; comments: FeedComment[]; allowImage?: boolean; allowPoll?: boolean; highlightId?: string;
}) {
  const { tokens, radius } = useTheme();
  const user = useAuthStore((s) => s.user);
  const typing = useTypingNames(thread);
  const [text, setText] = useState('');
  const [mentions, setMentions] = useState<CommentMention[]>([]);
  const [image, setImage] = useState<PickedImage | null>(null);
  const [replyTo, setReplyTo] = useState<{ commentId: string; name: string } | null>(null);
  const [editing, setEditing] = useState<Target | null>(null);
  const [menu, setMenu] = useState<{ target: Target; entry: FeedComment | FeedCommentReply } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [pollOpen, setPollOpen] = useState(false);
  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState(['', '']);
  const [allowMultiple, setAllowMultiple] = useState(false);

  const reset = () => { setText(''); setMentions([]); setImage(null); setReplyTo(null); setEditing(null); };

  const submit = async () => {
    if (busy || (!text.trim() && !image)) return;
    setBusy(true); setError('');
    const input = { text: text.trim(), mentions, ...(image ? { imageDataUrl: image.dataUrl } : {}) };
    try {
      if (editing) {
        if (editing.replyId) await editReply(thread, editing.commentId, editing.replyId, input);
        else await editComment(thread, editing.commentId, input);
      } else if (replyTo) await addReply(thread, replyTo.commentId, input);
      else await addComment(thread, input);
      reset();
    } catch (reason) { setError(errorText(reason, 'Kunne ikke sende kommentaren.')); }
    finally { setBusy(false); }
  };

  const submitPoll = async () => {
    const answers = options.map((option) => option.trim()).filter(Boolean);
    if (!question.trim() || answers.length < 2) return;
    setBusy(true); setError('');
    try {
      await addComment(thread, { text: text.trim(), mentions, poll: { question: question.trim(), allowMultiple, options: answers.map((label) => ({ label })) } });
      setPollOpen(false); setQuestion(''); setOptions(['', '']); reset();
    } catch (reason) { setError(errorText(reason, 'Kunne ikke lage avstemningen.')); }
    finally { setBusy(false); }
  };

  const menuActions = (): MenuAction[] => {
    if (!menu) return [];
    const { target, entry } = menu;
    const own = entry.author.uid === user?.uid;
    const actions: MenuAction[] = [
      { label: 'Svar', icon: 'return-down-forward-outline', onPress: () => setReplyTo({ commentId: target.commentId, name: entry.author.name }) },
    ];
    if (entry.text) actions.push({ label: 'Kopier tekst', icon: 'copy-outline', onPress: () => void Clipboard.setStringAsync(entry.text ?? '') });
    if (own && !(entry as FeedComment).poll) actions.push({ label: 'Rediger', icon: 'create-outline', onPress: () => { setEditing(target); setReplyTo(null); setText(entry.text ?? ''); setMentions(entry.mentions ?? []); } });
    if (own || user?.isAdmin) actions.push({
      label: 'Slett', icon: 'trash-outline', danger: true,
      onPress: () => Alert.alert('Slette?', 'Dette kan ikke angres.', [
        { text: 'Avbryt', style: 'cancel' },
        { text: 'Slett', style: 'destructive', onPress: () => void (target.replyId ? deleteReply(thread, target.commentId, target.replyId) : deleteComment(thread, target.commentId)).catch((e) => Alert.alert('Kunne ikke slette', errorText(e))) },
      ]),
    });
    return actions;
  };

  return (
    <View style={{ gap: 10 }}>
      {comments.length === 0 ? <T muted size={13}>Ingen kommentarer ennå. Si noe!</T> : null}
      {comments.map((comment) => (
        <View key={comment.id} style={{ gap: 6 }}>
          <Entry entry={comment} thread={thread} commentId={comment.id} highlighted={highlightId === comment.id} onAction={(target, entry) => setMenu({ target, entry })} onReply={(commentId, name) => { setEditing(null); setReplyTo({ commentId, name }); }} />
          {(comment.replies ?? []).map((reply) => (
            <View key={reply.id} style={{ paddingLeft: 38 }}>
              <Entry entry={reply} thread={thread} commentId={comment.id} replyId={reply.id} highlighted={highlightId === reply.id} onAction={(target, entry) => setMenu({ target, entry })} onReply={(commentId, name) => { setEditing(null); setReplyTo({ commentId, name }); }} />
            </View>
          ))}
        </View>
      ))}

      {typing.length > 0 ? <T size={12} muted>{typing.join(', ')} skriver …</T> : null}

      <View style={[styles.composer, { borderColor: tokens.border, borderRadius: radius.md, backgroundColor: tokens.bgCard }]}>
        {replyTo || editing ? (
          <View style={styles.composerNote}>
            <Ionicons name={editing ? 'create-outline' : 'return-down-forward-outline'} size={14} color={tokens.accent} />
            <T size={12} style={{ flex: 1 }} color={tokens.accent}>{editing ? 'Redigerer' : `Svarer ${replyTo?.name}`}</T>
            <IconButton icon="close" size={16} label="Avbryt" onPress={reset} />
          </View>
        ) : null}
        {image ? (
          <View style={styles.composerNote}>
            <Image source={{ uri: image.uri }} style={{ width: 48, height: 48, borderRadius: 6 }} />
            <T size={12} muted style={{ flex: 1 }}>Bilde lagt ved</T>
            <IconButton icon="close" size={16} label="Fjern bilde" onPress={() => setImage(null)} />
          </View>
        ) : null}
        <MentionInput
          value={text}
          onChange={(value) => { setText(value); if (value) sendTyping(thread); }}
          mentions={mentions}
          onMentionsChange={setMentions}
          placeholder={replyTo ? 'Skriv et svar …' : 'Skriv en kommentar … (@ for å nevne)'}
          editable={!busy}
          maxLength={4000}
        />
        <View style={styles.composerTools}>
          {allowImage && !editing ? <IconButton icon="image-outline" label="Legg ved bilde" onPress={() => void pickImage().then((picked) => picked && setImage(picked)).catch((e) => setError(errorText(e)))} /> : null}
          {allowImage && !editing ? <IconButton icon="camera-outline" label="Ta bilde" onPress={() => void pickImage({ camera: true }).then((picked) => picked && setImage(picked)).catch((e) => setError(errorText(e)))} /> : null}
          {allowPoll && !replyTo && !editing ? <IconButton icon="stats-chart-outline" label="Lag avstemning" onPress={() => setPollOpen(true)} /> : null}
          <View style={{ flex: 1 }} />
          <Button small title={editing ? 'Lagre' : 'Send'} icon="send" busy={busy} disabled={!text.trim() && !image} onPress={() => void submit()} />
        </View>
        <ErrorBox message={error} />
      </View>

      <ActionSheet visible={Boolean(menu)} onClose={() => setMenu(null)} actions={menuActions()} />

      <Sheet visible={pollOpen} onClose={() => setPollOpen(false)} title="Ny avstemning">
        <Field label="Spørsmål" value={question} onChangeText={setQuestion} maxLength={300} />
        {options.map((option, index) => (
          <Field key={index} label={`Alternativ ${index + 1}`} value={option} maxLength={200} onChangeText={(value) => setOptions((current) => current.map((old, i) => (i === index ? value : old)))} />
        ))}
        {options.length < 10 ? <Button variant="ghost" small title="+ Legg til alternativ" onPress={() => setOptions((current) => [...current, ''])} /> : null}
        <Pressable onPress={() => setAllowMultiple(!allowMultiple)} style={styles.composerNote}>
          <Ionicons name={allowMultiple ? 'checkbox' : 'square-outline'} size={20} color={tokens.accent} />
          <T>Tillat flere valg</T>
        </Pressable>
        <Button title="Opprett avstemning" busy={busy} disabled={!question.trim() || options.filter((o) => o.trim()).length < 2} onPress={() => void submitPoll()} />
      </Sheet>
    </View>
  );
}

const styles = StyleSheet.create({
  entry: { flexDirection: 'row', gap: 8, padding: 2 },
  bubble: { paddingHorizontal: 10, paddingVertical: 8, gap: 4 },
  meta: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  entryActions: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingLeft: 4, flexWrap: 'wrap' },
  image: { width: '100%', aspectRatio: 4 / 3, marginTop: 4 },
  poll: { borderWidth: 1, padding: 10, gap: 6, marginTop: 4 },
  pollOption: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 8, overflow: 'hidden' },
  pollImage: { width: 32, height: 32, borderRadius: 4 },
  composer: { borderWidth: StyleSheet.hairlineWidth, padding: 8, gap: 6 },
  composerNote: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  composerTools: { flexDirection: 'row', alignItems: 'center', gap: 4 },
});
