import { appApi } from '@/services/appApi';
import { useCommunityEventStore } from '@/store/communityEventStore';
import { useFeedStore } from '@/store/feedStore';
import { getFeedItemThread, type CommentEvent } from '@/utils/comments';
import type {
  AnyFeedItem,
  CommentMention,
  CommentThreadRef,
  CommunityEventPoll,
  CommunityEventReactions,
  FeedComment,
  FeedCommentReply,
  FeedMuteLevel,
} from '@/types';

const TYPING_INTERVAL_MS = 3000;
const lastTypingSent = new Map<string, number>();

export interface CommentInput {
  text: string;
  mentions: CommentMention[];
  /** An attached photo or GIF, as prepared by prepareImageForUpload. */
  imageDataUrl?: string;
}

/** Event threads also accept a poll. */
export interface EventCommentInput extends CommentInput {
  poll?: {
    question: string;
    allowMultiple: boolean;
    options: Array<{ label: string; imageUrl?: string }>;
  };
}

function threadBase(thread: CommentThreadRef) {
  return `/comment-threads/${thread.kind}/${encodeURIComponent(thread.id)}`;
}

function threadPath(thread: CommentThreadRef) {
  return `${threadBase(thread)}/comments`;
}

/** <img> can't send headers, so the token goes in the query string (like statusrapport images). */
export function commentImageUrl(imageId: string, token: string | null | undefined): string {
  const qs = token ? `?token=${encodeURIComponent(token)}` : '';
  return `/app-api/comment-images/${encodeURIComponent(imageId)}${qs}`;
}

/** Link to a comment: the post page for feed threads, the event page for event threads. */
export function commentLink(thread: CommentThreadRef, commentId: string): string {
  return thread.kind === 'event'
    ? `/arrangementer/${encodeURIComponent(thread.id)}#c-${commentId}`
    : `/innlegg/${encodeURIComponent(thread.id)}#c-${commentId}`;
}

/** Tell others you're writing in this thread. Throttled; failures don't matter. */
export function sendTyping(thread: CommentThreadRef) {
  const key = `${thread.kind}:${thread.id}`;
  const now = Date.now();
  if (now - (lastTypingSent.get(key) ?? 0) < TYPING_INTERVAL_MS) return;
  lastTypingSent.set(key, now);
  void appApi.post(`${threadBase(thread)}/typing`).catch(() => {});
}

/** Set your notification level for a post's thread (null = all notifications). */
export async function setThreadMute(item: AnyFeedItem, level: FeedMuteLevel | null): Promise<void> {
  const thread = getFeedItemThread(item);
  await appApi.put(`${threadBase(thread)}/mute`, { level });
  const sameThread = (other: AnyFeedItem) => {
    const otherThread = getFeedItemThread(other);
    return otherThread.kind === thread.kind && otherThread.id === thread.id;
  };
  useFeedStore.getState().patchItems(sameThread, (other) => {
    const { mute: _mute, bump, ...rest } = other;
    // Muting also takes the post out of its bumped position (mentions survive 'mentions').
    const keepBump = bump && (level === null || (level === 'mentions' && bump.reason === 'mention'));
    return { ...rest, ...(level ? { mute: level } : {}), ...(keepBump ? { bump } : {}) };
  });
}

function commentPath(thread: CommentThreadRef, commentId: string, replyId?: string) {
  const base = `${threadPath(thread)}/${encodeURIComponent(commentId)}`;
  return replyId ? `${base}/replies/${encodeURIComponent(replyId)}` : base;
}

/** Route a comment change to whichever store owns the thread. */
export function applyThreadCommentEvent(event: CommentEvent) {
  if (event.thread.kind === 'event') {
    useCommunityEventStore.getState().applyCommentEvent(event.thread.id, event);
  } else {
    useFeedStore.getState().applyCommentEvent(event.thread.id, event);
  }
}

export async function addComment(thread: CommentThreadRef, input: EventCommentInput): Promise<FeedComment> {
  const comment = await appApi.post<FeedComment>(threadPath(thread), input);
  applyThreadCommentEvent({ __type: 'comment_added', thread, comment });
  return comment;
}

export async function editComment(thread: CommentThreadRef, commentId: string, input: CommentInput): Promise<void> {
  const updated = await appApi.patch<FeedComment>(commentPath(thread, commentId), input);
  const { text, mentions, editedAt } = updated;
  applyThreadCommentEvent({ __type: 'comment_updated', thread, commentId, patch: { text, mentions, editedAt } });
}

/** A comment with replies becomes a "Kommentaren er slettet" placeholder; the server says which happened. */
export async function deleteComment(thread: CommentThreadRef, commentId: string): Promise<void> {
  const result = await appApi.delete<{ deleted?: boolean; deletedAt?: number } | undefined>(commentPath(thread, commentId));
  applyThreadCommentEvent(result?.deleted
    ? { __type: 'comment_updated', thread, commentId, patch: { deleted: true, deletedAt: result.deletedAt } }
    : { __type: 'comment_deleted', thread, commentId });
}

export async function addReply(thread: CommentThreadRef, commentId: string, input: CommentInput): Promise<FeedCommentReply> {
  const reply = await appApi.post<FeedCommentReply>(`${commentPath(thread, commentId)}/replies`, input);
  applyThreadCommentEvent({ __type: 'reply_added', thread, commentId, reply });
  return reply;
}

export async function editReply(thread: CommentThreadRef, commentId: string, replyId: string, input: CommentInput): Promise<void> {
  const updated = await appApi.patch<FeedCommentReply>(commentPath(thread, commentId, replyId), input);
  const { text, mentions, editedAt } = updated;
  applyThreadCommentEvent({ __type: 'comment_updated', thread, commentId, replyId, patch: { text, mentions, editedAt } });
}

/** Deleting the last reply under a placeholder removes the placeholder too. */
export async function deleteReply(thread: CommentThreadRef, commentId: string, replyId: string): Promise<void> {
  const result = await appApi.delete<{ removedComment?: boolean } | undefined>(commentPath(thread, commentId, replyId));
  applyThreadCommentEvent(result?.removedComment
    ? { __type: 'comment_deleted', thread, commentId }
    : { __type: 'comment_deleted', thread, commentId, replyId });
}

export async function toggleCommentReaction(
  thread: CommentThreadRef,
  commentId: string,
  emoji: string,
  replyId?: string
): Promise<void> {
  const { reactions } = await appApi.post<{ reactions: CommunityEventReactions }>(
    `${commentPath(thread, commentId, replyId)}/reactions`,
    { emoji }
  );
  applyThreadCommentEvent({ __type: 'comment_updated', thread, commentId, replyId, patch: { reactions } });
}

export async function voteCommentPoll(thread: CommentThreadRef, commentId: string, optionId: string): Promise<void> {
  const { poll } = await appApi.post<{ poll: CommunityEventPoll }>(`${commentPath(thread, commentId)}/poll-votes`, { optionId });
  applyThreadCommentEvent({ __type: 'comment_updated', thread, commentId, patch: { poll } });
}
