import { appApi } from '@/services/appApi';
import { applyThreadCommentEvent, patchFeedItems } from '@/data/feedCache';
import { getFeedItemThread } from '@/utils/comments.generated';
import type { AnyFeedItem, CommentMention, CommentThreadRef, CommunityEventPoll, CommunityEventReactions, FeedComment, FeedCommentReply, FeedMuteLevel } from '@/types';

// Mirrors the website's src/services/comments.ts; results go straight into the cache.

export interface CommentInput { text: string; mentions: CommentMention[]; imageDataUrl?: string }
export interface EventCommentInput extends CommentInput {
  poll?: { question: string; allowMultiple: boolean; options: Array<{ label: string; imageUrl?: string }> };
}

const threadBase = (thread: CommentThreadRef) => `/comment-threads/${thread.kind}/${encodeURIComponent(thread.id)}`;
const threadPath = (thread: CommentThreadRef) => `${threadBase(thread)}/comments`;
function commentPath(thread: CommentThreadRef, commentId: string, replyId?: string) {
  const base = `${threadPath(thread)}/${encodeURIComponent(commentId)}`;
  return replyId ? `${base}/replies/${encodeURIComponent(replyId)}` : base;
}

const lastTyping = new Map<string, number>();
export function sendTyping(thread: CommentThreadRef) {
  const key = `${thread.kind}:${thread.id}`;
  if (Date.now() - (lastTyping.get(key) ?? 0) < 3000) return;
  lastTyping.set(key, Date.now());
  void appApi.post(`${threadBase(thread)}/typing`).catch(() => {});
}

export async function setThreadMute(item: AnyFeedItem, level: FeedMuteLevel | null) {
  const thread = getFeedItemThread(item);
  await appApi.put(`${threadBase(thread)}/mute`, { level });
  patchFeedItems(
    (other) => { const t = getFeedItemThread(other); return t.kind === thread.kind && t.id === thread.id; },
    (other) => {
      const { mute: _mute, bump, ...rest } = other;
      const keepBump = bump && (level === null || (level === 'mentions' && bump.reason === 'mention'));
      return { ...rest, ...(level ? { mute: level } : {}), ...(keepBump ? { bump } : {}) } as AnyFeedItem;
    },
  );
}

export async function addComment(thread: CommentThreadRef, input: EventCommentInput) {
  const comment = await appApi.post<FeedComment>(threadPath(thread), input);
  applyThreadCommentEvent({ __type: 'comment_added', thread, comment });
  return comment;
}

export async function editComment(thread: CommentThreadRef, commentId: string, input: CommentInput) {
  const { text, mentions, editedAt } = await appApi.patch<FeedComment>(commentPath(thread, commentId), input);
  applyThreadCommentEvent({ __type: 'comment_updated', thread, commentId, patch: { text, mentions, editedAt } });
}

export async function deleteComment(thread: CommentThreadRef, commentId: string) {
  const result = await appApi.delete<{ deleted?: boolean; deletedAt?: number } | undefined>(commentPath(thread, commentId));
  applyThreadCommentEvent(result?.deleted
    ? { __type: 'comment_updated', thread, commentId, patch: { deleted: true, deletedAt: result.deletedAt } }
    : { __type: 'comment_deleted', thread, commentId });
}

export async function addReply(thread: CommentThreadRef, commentId: string, input: CommentInput) {
  const reply = await appApi.post<FeedCommentReply>(`${commentPath(thread, commentId)}/replies`, input);
  applyThreadCommentEvent({ __type: 'reply_added', thread, commentId, reply });
  return reply;
}

export async function editReply(thread: CommentThreadRef, commentId: string, replyId: string, input: CommentInput) {
  const { text, mentions, editedAt } = await appApi.patch<FeedCommentReply>(commentPath(thread, commentId, replyId), input);
  applyThreadCommentEvent({ __type: 'comment_updated', thread, commentId, replyId, patch: { text, mentions, editedAt } });
}

export async function deleteReply(thread: CommentThreadRef, commentId: string, replyId: string) {
  const result = await appApi.delete<{ removedComment?: boolean } | undefined>(commentPath(thread, commentId, replyId));
  applyThreadCommentEvent(result?.removedComment ? { __type: 'comment_deleted', thread, commentId } : { __type: 'comment_deleted', thread, commentId, replyId });
}

export async function toggleCommentReaction(thread: CommentThreadRef, commentId: string, emoji: string, replyId?: string) {
  const { reactions } = await appApi.post<{ reactions: CommunityEventReactions }>(`${commentPath(thread, commentId, replyId)}/reactions`, { emoji });
  applyThreadCommentEvent({ __type: 'comment_updated', thread, commentId, replyId, patch: { reactions } });
}

export async function voteCommentPoll(thread: CommentThreadRef, commentId: string, optionId: string) {
  const { poll } = await appApi.post<{ poll: CommunityEventPoll }>(`${commentPath(thread, commentId)}/poll-votes`, { optionId });
  applyThreadCommentEvent({ __type: 'comment_updated', thread, commentId, patch: { poll } });
}
