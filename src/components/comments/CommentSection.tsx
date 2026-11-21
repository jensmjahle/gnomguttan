import { useEffect, useMemo, useState } from 'react';
import { AnimatedHeight } from '@/components/ui/AnimatedHeight';
import { useAppUsers } from '@/hooks/useAppUsers';
import { addComment, addReply, sendTyping } from '@/services/comments';
import { useAuthStore } from '@/store/authStore';
import { resolvePerson } from '@/utils/people';
import type { CommentMention, CommentThreadRef, CommunityEventPerson, FeedComment } from '@/types';
import { CommentComposer } from './CommentComposer';
import { CommentItem } from './CommentItem';
import { TypingIndicator } from './TypingIndicator';
import styles from './CommentSection.module.css';

const COLLAPSED_COUNT = 2;

interface Props {
  thread: CommentThreadRef;
  comments: FeedComment[];
  canComment: boolean;
  eventLink?: string;
  /** Start with every comment visible (a post's own page). */
  defaultExpanded?: boolean;
  /** Comment or reply to scroll to and highlight. */
  highlightId?: string;
  /** False while the comments are still loading (so a missing linked comment isn't reported yet). */
  commentsReady?: boolean;
}

interface ReplyTarget {
  commentId: string;
  name: string;
}

/**
 * Facebook-style thread: the latest two comments, a toggle for the rest, and one
 * comment box. "Svar" doesn't open a new box; it tags the main one instead.
 */
export function CommentSection({
  thread,
  comments,
  canComment,
  eventLink,
  defaultExpanded = false,
  highlightId,
  commentsReady = true,
}: Props) {
  const { usersByUid } = useAppUsers();
  const myUid = useAuthStore((s) => s.user?.uid ?? null);
  const sorted = useMemo(() => [...comments].sort((a, b) => a.createdAt - b.createdAt), [comments]);
  const highlightIndex = highlightId
    ? sorted.findIndex((comment) => comment.id === highlightId || comment.replies?.some((reply) => reply.id === highlightId))
    : -1;
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [replyTarget, setReplyTarget] = useState<ReplyTarget | null>(null);
  const [prefill, setPrefill] = useState<{ key: number; mention?: CommentMention } | undefined>(undefined);
  const [replyLost, setReplyLost] = useState(false);
  const linkMissing = Boolean(highlightId) && commentsReady && highlightIndex === -1;

  // The comment being replied to was deleted (not just turned into a placeholder): fall back
  // to a normal comment, keeping what was typed.
  useEffect(() => {
    if (replyTarget && !comments.some((comment) => comment.id === replyTarget.commentId)) {
      setReplyTarget(null);
      setReplyLost(true);
    }
  }, [comments, replyTarget]);

  // A linked comment is always shown, even if it would otherwise be collapsed.
  const showAll = expanded || (highlightIndex >= 0 && highlightIndex < sorted.length - COLLAPSED_COUNT);
  const hiddenCount = showAll ? 0 : Math.max(0, sorted.length - COLLAPSED_COUNT);
  const visible = sorted.slice(hiddenCount);

  if (sorted.length === 0 && !canComment) return null;

  function startReply(comment: FeedComment, replyAuthor?: CommunityEventPerson) {
    const commentAuthor = resolvePerson(comment.author, usersByUid);
    setReplyLost(false);
    setReplyTarget({ commentId: comment.id, name: comment.deleted ? 'en slettet kommentar' : commentAuthor.name });
    // Replying to a reply mentions its author, so they're notified too.
    const person = replyAuthor && replyAuthor.uid !== myUid ? resolvePerson(replyAuthor, usersByUid) : undefined;
    setPrefill((current) => ({
      key: (current?.key ?? 0) + 1,
      mention: person ? { uid: person.uid, name: person.name } : undefined,
    }));
  }

  return (
    <section className={styles.section} aria-label="Kommentarer">
      {linkMissing && <p className={styles.notice}>Kommentaren du lenket til finnes ikke lenger.</p>}
      {sorted.length > COLLAPSED_COUNT && (
        <button
          type="button"
          className={styles.toggle}
          onClick={() => setExpanded(!showAll)}
          aria-expanded={showAll}
        >
          {showAll
            ? 'Vis færre kommentarer ▴'
            : hiddenCount === 1
              ? 'Vis 1 tidligere kommentar ▾'
              : `Vis alle ${sorted.length} kommentarer ▾`}
        </button>
      )}

      {visible.map((comment) => (
        <CommentItem
          key={comment.id}
          thread={thread}
          comment={comment}
          canReply={canComment}
          onReply={startReply}
          expandReplies={replyTarget?.commentId === comment.id}
          highlightId={highlightId}
          eventLink={eventLink}
        />
      ))}

      <AnimatedHeight className={styles.typingSlot}>
        <TypingIndicator thread={thread} />
      </AnimatedHeight>

      {replyLost && <p className={styles.notice}>Kommentaren du svarte på ble slettet — det du skriver blir en vanlig kommentar.</p>}

      {canComment && (
        <CommentComposer
          placeholder={replyTarget ? `Svar ${replyTarget.name}…` : 'Skriv en kommentar…'}
          allowImages
          replyTo={replyTarget ?? undefined}
          onCancelReply={() => setReplyTarget(null)}
          prefill={prefill}
          onTyping={() => sendTyping(thread)}
          onSubmit={async (input) => {
            if (replyTarget) {
              await addReply(thread, replyTarget.commentId, input);
              setReplyTarget(null);
            } else {
              await addComment(thread, input);
            }
            setReplyLost(false);
          }}
        />
      )}
    </section>
  );
}
