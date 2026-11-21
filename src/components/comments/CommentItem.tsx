import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { format } from 'date-fns';
import { nb } from 'date-fns/locale/nb';
import { Avatar } from '@/components/ui/Avatar';
import { EmojiPicker } from '@/components/feed/EmojiPicker';
import { ReactionBar } from '@/components/feed/ReactionBar';
import { useAppUsers } from '@/hooks/useAppUsers';
import { useMinuteTick } from '@/hooks/useMinuteTick';
import {
  commentLink,
  deleteComment,
  deleteReply,
  editComment,
  editReply,
  toggleCommentReaction,
} from '@/services/comments';
import { useAuthStore } from '@/store/authStore';
import { formatRelativeTime } from '@/utils/relativeTime';
import { getPersonAvatar, resolvePerson, toFeedReactions } from '@/utils/people';
import type { CommentThreadRef, CommunityEventPerson, FeedComment, FeedCommentReply } from '@/types';
import { CommentComposer } from './CommentComposer';
import { CommentImage } from './CommentImage';
import { CommentText } from './CommentText';
import styles from './CommentItem.module.css';

interface Props {
  thread: CommentThreadRef;
  comment: FeedComment;
  canReply: boolean;
  /** "Svar" was clicked on this comment, or on one of its replies (whose author is passed). */
  onReply: (comment: FeedComment, replyAuthor?: CommunityEventPerson) => void;
  /** Open the replies (e.g. while replying to this comment). */
  expandReplies?: boolean;
  /** Comment or reply id to scroll to and highlight. */
  highlightId?: string;
  /** Event comments link their poll here, since voting happens on the event page. */
  eventLink?: string;
}

interface EntryProps {
  thread: CommentThreadRef;
  commentId: string;
  entry: FeedComment | FeedCommentReply;
  replyId?: string;
  canReply: boolean;
  highlighted: boolean;
  onReply: () => void;
  children?: React.ReactNode;
}

/** One comment or reply: bubble, reactions and the "time · Reager · Svar · Rediger · Slett" row. */
function CommentEntry({ thread, commentId, entry, replyId, canReply, highlighted, onReply, children }: EntryProps) {
  useMinuteTick();
  const myUid = useAuthStore((s) => s.user?.uid ?? null);
  const { usersByUid } = useAppUsers();
  const [editing, setEditing] = useState(false);
  const [pickerAnchor, setPickerAnchor] = useState<DOMRect | null>(null);
  const [error, setError] = useState('');
  const rootRef = useRef<HTMLDivElement>(null);
  const reactBtnRef = useRef<HTMLButtonElement>(null);
  const pendingRef = useRef(false);

  const entryId = replyId ?? commentId;
  const deleted = 'deleted' in entry && entry.deleted === true;
  const author = resolvePerson(entry.author, usersByUid);
  const isAuthor = !deleted && myUid !== null && entry.author.uid === myUid;
  const reactions = toFeedReactions(entry.reactions, usersByUid);

  useEffect(() => {
    if (highlighted) rootRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [highlighted]);

  async function handleReact(emoji: string) {
    if (pendingRef.current) return;
    pendingRef.current = true;
    setError('');
    try {
      await toggleCommentReaction(thread, commentId, emoji, replyId);
    } catch {
      setError('Kunne ikke reagere.');
    } finally {
      pendingRef.current = false;
    }
  }

  async function handleDelete() {
    if (!window.confirm(replyId ? 'Slette svaret?' : 'Slette kommentaren?')) return;
    setError('');
    try {
      if (replyId) await deleteReply(thread, commentId, replyId);
      else await deleteComment(thread, commentId);
    } catch {
      setError('Kunne ikke slette.');
    }
  }

  return (
    <div
      ref={rootRef}
      id={`c-${entryId}`}
      className={[styles.entry, replyId ? styles.reply : '', highlighted ? styles.highlighted : ''].filter(Boolean).join(' ')}
    >
      {deleted
        ? <span className={styles.deletedAvatar} aria-hidden="true" />
        : <Avatar src={getPersonAvatar(author)} name={author.name} size="sm" className={styles.avatar} />}
      <div className={styles.main}>
        {deleted ? (
          <div className={`${styles.bubble} ${styles.deletedBubble}`}>
            <span className={styles.deletedText}>Kommentaren er slettet</span>
          </div>
        ) : editing ? (
          <CommentComposer
            placeholder="Rediger…"
            submitLabel="Lagre"
            initialText={entry.text ?? ''}
            initialMentions={entry.mentions}
            showAvatar={false}
            autoFocus
            onCancel={() => setEditing(false)}
            onSubmit={async (input) => {
              if (replyId) await editReply(thread, commentId, replyId, input);
              else await editComment(thread, commentId, input);
              setEditing(false);
            }}
          />
        ) : (
          <div className={styles.bubble}>
            <span className={styles.author}>{author.name}</span>
            {entry.text && (
              <p className={styles.text}>
                <CommentText text={entry.text} mentions={entry.mentions} />
              </p>
            )}
            {entry.imageId && <CommentImage imageId={entry.imageId} />}
            {children}
          </div>
        )}

        {reactions.length > 0 && (
          <ReactionBar reactions={reactions} onToggle={(emoji) => void handleReact(emoji)} compact />
        )}

        {!editing && (
          <div className={styles.meta}>
            <Link
              to={commentLink(thread, entryId)}
              className={styles.timeLink}
              title={format(new Date(entry.createdAt), "d. MMMM yyyy 'kl.' HH:mm", { locale: nb })}
            >
              <time dateTime={new Date(entry.createdAt).toISOString()}>{formatRelativeTime(entry.createdAt)}</time>
            </Link>
            {entry.editedAt && !deleted && <span className={styles.edited}>(redigert)</span>}
            {!deleted && (
              <button
                ref={reactBtnRef}
                type="button"
                className={styles.action}
                onClick={() => setPickerAnchor(reactBtnRef.current?.getBoundingClientRect() ?? null)}
              >
                Reager
              </button>
            )}
            {canReply && (
              <button type="button" className={styles.action} onClick={onReply}>
                Svar
              </button>
            )}
            {isAuthor && (
              <>
                <button type="button" className={styles.action} onClick={() => setEditing(true)}>
                  Rediger
                </button>
                <button type="button" className={`${styles.action} ${styles.danger}`} onClick={() => void handleDelete()}>
                  Slett
                </button>
              </>
            )}
          </div>
        )}
        {error && <p className={styles.error}>{error}</p>}
      </div>

      {pickerAnchor && (
        <EmojiPicker
          anchorRect={pickerAnchor}
          onPick={(emoji) => void handleReact(emoji)}
          onClose={() => setPickerAnchor(null)}
        />
      )}
    </div>
  );
}

/** A top-level comment with its collapsible replies. Replying happens in the thread's main comment box. */
export function CommentItem({ thread, comment, canReply, onReply, expandReplies = false, highlightId, eventLink }: Props) {
  const replies = comment.replies ?? [];
  const highlightsReply = replies.some((reply) => reply.id === highlightId);
  const [showReplies, setShowReplies] = useState(highlightsReply);

  // Once opened (by replying or a link), replies stay open.
  useEffect(() => {
    if (expandReplies || highlightsReply) setShowReplies(true);
  }, [expandReplies, highlightsReply]);

  const voteCount = comment.poll?.options.reduce((total, option) => total + option.votes.length, 0) ?? 0;

  return (
    <div className={styles.item}>
      <CommentEntry
        thread={thread}
        commentId={comment.id}
        entry={comment}
        canReply={canReply}
        highlighted={highlightId === comment.id}
        onReply={() => onReply(comment)}
      >
        {comment.imageUrl && (
          eventLink
            ? <Link to={eventLink}><img className={styles.image} src={comment.imageUrl} alt="" loading="lazy" /></Link>
            : <img className={styles.image} src={comment.imageUrl} alt="" loading="lazy" />
        )}
        {comment.poll && (
          eventLink ? (
            <Link to={eventLink} className={styles.poll}>
              🗳️ {comment.poll.question}
              <span className={styles.pollMeta}>{voteCount} {voteCount === 1 ? 'stemme' : 'stemmer'} · Stem på arrangementet →</span>
            </Link>
          ) : (
            <span className={styles.poll}>🗳️ {comment.poll.question}</span>
          )
        )}
      </CommentEntry>

      {replies.length > 0 && (
        <div className={styles.replies}>
          {!showReplies && (
            <button type="button" className={styles.showReplies} onClick={() => setShowReplies(true)}>
              ↳ Vis {replies.length === 1 ? '1 svar' : `${replies.length} svar`}
            </button>
          )}
          {showReplies && replies.map((reply) => (
            <CommentEntry
              key={reply.id}
              thread={thread}
              commentId={comment.id}
              entry={reply}
              replyId={reply.id}
              canReply={canReply}
              highlighted={highlightId === reply.id}
              onReply={() => onReply(comment, reply.author)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
