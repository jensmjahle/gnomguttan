import type {
  AnyFeedItem,
  CommentMention,
  CommentThreadRef,
  FeedComment,
  FeedCommentReply,
} from '@/types';

export const EVENT_FEED_TYPE = 'community_event_created';

/** Live comment changes, as sent over the feed SSE stream and applied locally after writes. */
export type CommentEvent =
  | { __type: 'comment_added'; thread: CommentThreadRef; comment: FeedComment }
  | { __type: 'reply_added'; thread: CommentThreadRef; commentId: string; reply: FeedCommentReply }
  | {
      __type: 'comment_updated';
      thread: CommentThreadRef;
      commentId: string;
      replyId?: string;
      patch: Partial<Pick<FeedComment, 'text' | 'mentions' | 'editedAt' | 'reactions' | 'poll' | 'deleted' | 'deletedAt'>>;
    }
  | { __type: 'comment_deleted'; thread: CommentThreadRef; commentId: string; replyId?: string };

const COMMENT_EVENT_TYPES = new Set(['comment_added', 'reply_added', 'comment_updated', 'comment_deleted']);

export function isCommentEvent(value: { __type?: string }): value is CommentEvent {
  return typeof value.__type === 'string' && COMMENT_EVENT_TYPES.has(value.__type);
}

/** Event posts share their thread with the event page; everything else has its own. */
export function getFeedItemThread(item: AnyFeedItem): CommentThreadRef {
  if (item.type === EVENT_FEED_TYPE) {
    const eventId = (item.payload as { id?: unknown } | null)?.id;
    if (typeof eventId === 'string') return { kind: 'event', id: eventId };
  }
  return { kind: 'feed', id: item.id };
}

/** What's left of a comment deleted while it had replies: no content, replies kept. */
function toPlaceholder(comment: FeedComment, deletedAt?: number): FeedComment {
  return {
    id: comment.id,
    author: comment.author,
    createdAt: comment.createdAt,
    deleted: true,
    deletedAt: deletedAt ?? Date.now(),
    text: '',
    replies: comment.replies,
  };
}

function upsertById<T extends { id: string }>(list: T[], entry: T): T[] {
  return list.some((existing) => existing.id === entry.id)
    ? list.map((existing) => (existing.id === entry.id ? entry : existing))
    : [...list, entry];
}

/**
 * Apply a comment change to a thread's comments. Idempotent, so a write's own
 * result and its SSE echo can both be applied safely.
 */
export function applyCommentEvent(comments: FeedComment[], event: CommentEvent): FeedComment[] {
  switch (event.__type) {
    case 'comment_added':
      return upsertById(comments, event.comment);
    case 'reply_added':
      return comments.map((comment) =>
        comment.id === event.commentId
          ? { ...comment, replies: upsertById(comment.replies ?? [], event.reply) }
          : comment
      );
    case 'comment_updated':
      return comments.map((comment) => {
        if (comment.id !== event.commentId) return comment;
        if (!event.replyId) {
          return event.patch.deleted ? toPlaceholder(comment, event.patch.deletedAt) : { ...comment, ...event.patch };
        }
        const { poll: _poll, deleted: _deleted, deletedAt: _deletedAt, ...replyPatch } = event.patch;
        return {
          ...comment,
          replies: (comment.replies ?? []).map((reply) =>
            reply.id === event.replyId ? { ...reply, ...replyPatch, text: replyPatch.text ?? reply.text } : reply
          ),
        };
      });
    case 'comment_deleted':
      return event.replyId
        ? comments.map((comment) =>
            comment.id === event.commentId
              ? { ...comment, replies: (comment.replies ?? []).filter((reply) => reply.id !== event.replyId) }
              : comment
          )
        : comments.filter((comment) => comment.id !== event.commentId);
  }
}

export interface TextSegment {
  text: string;
  mention?: CommentMention;
}

/** Split text into plain runs and "@Name" runs for the given mentions (longest names win). */
export function splitMentions(text: string, mentions: CommentMention[] = []): TextSegment[] {
  if (mentions.length === 0) return [{ text }];

  const candidates = [...mentions].sort((a, b) => b.name.length - a.name.length);
  const segments: TextSegment[] = [];
  let plainStart = 0;
  let index = 0;

  while (index < text.length) {
    const match = text[index] === '@'
      ? candidates.find((mention) => text.startsWith(`@${mention.name}`, index))
      : undefined;
    if (!match) {
      index += 1;
      continue;
    }
    if (index > plainStart) segments.push({ text: text.slice(plainStart, index) });
    segments.push({ text: `@${match.name}`, mention: match });
    index += match.name.length + 1;
    plainStart = index;
  }

  if (plainStart < text.length) segments.push({ text: text.slice(plainStart) });
  return segments;
}

/** Mentions whose "@Name" is still present in the text. */
export function activeMentions(text: string, mentions: CommentMention[]): CommentMention[] {
  return mentions.filter((mention, index) =>
    text.includes(`@${mention.name}`) && mentions.findIndex((other) => other.uid === mention.uid) === index
  );
}
