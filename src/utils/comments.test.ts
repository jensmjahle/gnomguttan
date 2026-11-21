import { describe, expect, it } from 'vitest';
import { activeMentions, applyCommentEvent, getFeedItemThread, splitMentions, type CommentEvent } from './comments';
import type { AnyFeedItem, FeedComment, FeedCommentReply } from '@/types';

const thread = { kind: 'feed' as const, id: 'post' };
const person = (uid: number) => ({ uid, name: `Bruker ${uid}` });
const comment = (id: string, extra: Partial<FeedComment> = {}): FeedComment => ({
  id, author: person(1), text: `tekst ${id}`, createdAt: 1, ...extra,
});
const reply = (id: string, extra: Partial<FeedCommentReply> = {}): FeedCommentReply => ({
  id, author: person(2), text: `svar ${id}`, createdAt: 2, ...extra,
});

describe('applyCommentEvent', () => {
  it('adds a comment once, even when the same event arrives twice (own write + SSE echo)', () => {
    const event: CommentEvent = { __type: 'comment_added', thread, comment: comment('a') };
    const once = applyCommentEvent([], event);
    expect(applyCommentEvent(once, event)).toEqual([comment('a')]);
  });

  it('replaces a comment that already exists instead of duplicating it', () => {
    const updated = comment('a', { text: 'ny' });
    expect(applyCommentEvent([comment('a')], { __type: 'comment_added', thread, comment: updated })).toEqual([updated]);
  });

  it('adds a reply to the right comment, idempotently', () => {
    const event: CommentEvent = { __type: 'reply_added', thread, commentId: 'b', reply: reply('r') };
    const result = applyCommentEvent(applyCommentEvent([comment('a'), comment('b')], event), event);
    expect(result[0].replies).toBeUndefined();
    expect(result[1].replies).toEqual([reply('r')]);
  });

  it('patches a comment, or only the addressed reply', () => {
    const start = [comment('a', { replies: [reply('r1'), reply('r2')] })];
    const patched = applyCommentEvent(start, { __type: 'comment_updated', thread, commentId: 'a', patch: { reactions: { '👍': [3] } } });
    expect(patched[0].reactions).toEqual({ '👍': [3] });

    const replyPatched = applyCommentEvent(start, {
      __type: 'comment_updated', thread, commentId: 'a', replyId: 'r2', patch: { text: 'endret', editedAt: 9 },
    });
    expect(replyPatched[0].replies).toEqual([reply('r1'), reply('r2', { text: 'endret', editedAt: 9 })]);
    expect(replyPatched[0].text).toBe('tekst a');
  });

  it('a reply patch without text keeps the reply text', () => {
    const start = [comment('a', { replies: [reply('r')] })];
    const result = applyCommentEvent(start, { __type: 'comment_updated', thread, commentId: 'a', replyId: 'r', patch: { reactions: {} } });
    expect(result[0].replies?.[0].text).toBe('svar r');
  });

  it('turns a deleted comment into a placeholder: content gone, replies kept', () => {
    const replies = [reply('r')];
    const start = [comment('a', {
      imageId: 'img', reactions: { '👍': [2] }, mentions: [{ uid: 3, name: 'Per' }], editedAt: 4,
      poll: { id: 'p', question: '?', allowMultiple: false, options: [], createdAt: 1, createdBy: person(1) },
      replies,
    })];
    const result = applyCommentEvent(start, { __type: 'comment_updated', thread, commentId: 'a', patch: { deleted: true, deletedAt: 9 } });
    expect(result[0]).toEqual({ id: 'a', author: person(1), createdAt: 1, deleted: true, deletedAt: 9, text: '', replies });
  });

  it('deletes a whole comment, or just one reply', () => {
    const start = [comment('a', { replies: [reply('r1'), reply('r2')] }), comment('b')];
    expect(applyCommentEvent(start, { __type: 'comment_deleted', thread, commentId: 'a' }).map((c) => c.id)).toEqual(['b']);
    const withoutReply = applyCommentEvent(start, { __type: 'comment_deleted', thread, commentId: 'a', replyId: 'r1' });
    expect(withoutReply[0].replies?.map((r) => r.id)).toEqual(['r2']);
  });

  it('ignores events about comments it does not have', () => {
    const start = [comment('a')];
    expect(applyCommentEvent(start, { __type: 'reply_added', thread, commentId: 'zzz', reply: reply('r') })).toEqual(start);
    expect(applyCommentEvent(start, { __type: 'comment_updated', thread, commentId: 'zzz', patch: { text: 'x' } })).toEqual(start);
    expect(applyCommentEvent(start, { __type: 'comment_deleted', thread, commentId: 'zzz' })).toEqual(start);
  });
});

describe('splitMentions', () => {
  const per = { uid: 3, name: 'Per' };
  const perPersen = { uid: 4, name: 'Per Persen' };

  it('returns the text untouched without mentions', () => {
    expect(splitMentions('hei @alle')).toEqual([{ text: 'hei @alle' }]);
  });

  it('prefers the longest matching name', () => {
    expect(splitMentions('Hei @Per Persen!', [per, perPersen])).toEqual([
      { text: 'Hei ' }, { text: '@Per Persen', mention: perPersen }, { text: '!' },
    ]);
  });

  it('handles repeated mentions, punctuation and unknown @-words', () => {
    expect(splitMentions('@Per, @Per. @Ola', [per])).toEqual([
      { text: '@Per', mention: per }, { text: ', ' }, { text: '@Per', mention: per }, { text: '. @Ola' },
    ]);
  });
});

describe('activeMentions', () => {
  it('drops mentions whose @name was deleted from the text, and duplicates', () => {
    const kari = { uid: 1, name: 'Kari' };
    const ola = { uid: 2, name: 'Ola' };
    expect(activeMentions('Hei @Kari', [kari, ola, kari])).toEqual([kari]);
  });
});

describe('getFeedItemThread', () => {
  const item = (type: string, payload: unknown): AnyFeedItem => ({ id: 'feed-1', type, source: 'internal', createdAt: 1, payload });

  it('event posts use the event thread', () => {
    expect(getFeedItemThread(item('community_event_created', { id: 'ev' }))).toEqual({ kind: 'event', id: 'ev' });
  });

  it('other posts (and broken event payloads) use their own thread', () => {
    expect(getFeedItemThread(item('statusrapport_created', { text: 'x' }))).toEqual({ kind: 'feed', id: 'feed-1' });
    expect(getFeedItemThread(item('community_event_created', null))).toEqual({ kind: 'feed', id: 'feed-1' });
  });
});
