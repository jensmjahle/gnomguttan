import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { MongoClient } from 'mongodb';
import { MongoMemoryServer } from 'mongodb-memory-server';
import {
  applyMutes,
  computeBumpTargets,
  createCommentService,
  filterMentions,
  mergeLegacyComments,
  normalizeCommentMentions,
} from './comments.js';
import { mergeBumpedFeedPage } from './feed.js';
import { COLLECTIONS } from './mongo.js';

test('filterMentions keeps known users whose @name is in the text', () => {
  const users = [{ uid: 1, name: 'Kari Nordmann' }, { uid: 2, name: 'Ola' }, { uid: 3, name: 'Per' }];
  assert.deepEqual(
    filterMentions('Hei @Kari Nordmann og @Ola!', [{ uid: 1 }, { uid: 2 }, { uid: 3 }, { uid: 99 }], users),
    [{ uid: 1, name: 'Kari Nordmann' }, { uid: 2, name: 'Ola' }],
  );
  assert.deepEqual(filterMentions('ingen nevnt', [1, 2], users), []);
});

test('normalizeCommentMentions dedupes, drops junk and caps at 20', () => {
  const raw = [{ uid: 1, name: 'A' }, { uid: 1, name: 'A' }, { uid: 'x', name: 'B' }, { uid: 2 }, null];
  assert.deepEqual(normalizeCommentMentions(raw), [{ uid: 1, name: 'A' }]);
  const many = Array.from({ length: 30 }, (_, i) => ({ uid: i + 1, name: `U${i}` }));
  assert.equal(normalizeCommentMentions(many).length, 20);
});

test('computeBumpTargets picks the most specific reason and skips the actor', () => {
  const comments = [
    { author: { uid: 2 }, replies: [{ author: { uid: 3 }, mentions: [{ uid: 4, name: 'D' }] }] },
    { author: { uid: 1 } },
  ];
  const targets = computeBumpTargets({
    actorUid: 1,
    ownerUids: [5, undefined],
    postMentionUids: [6],
    comments,
    newMentionUids: [3],
    parentAuthorUid: 2,
  });
  assert.deepEqual(Object.fromEntries(targets), { 2: 'reply', 3: 'mention', 4: 'participant', 5: 'own_post', 6: 'post_mention' });
});

test('mergeLegacyComments keeps server-owned fields and only accepts poll votes', () => {
  const existing = [
    { id: 'a', author: { uid: 1, name: 'A' }, text: 'hei', createdAt: 1, reactions: { '👍': [2] }, replies: [{ id: 'r' }] },
    { id: 'p', author: { uid: 1, name: 'A' }, createdAt: 2, poll: { id: 'poll', options: [{ id: 'o1', label: 'Ja', imageUrl: 'x', votes: [] }] } },
  ];
  const incoming = [
    { id: 'a', author: { uid: 9, name: 'Hacker' }, text: 'endret' },
    { id: 'p', poll: { options: [{ id: 'o1', label: 'Ja', votes: [3] }] } },
    { id: 'new', author: { uid: 9, name: 'Hacker' }, text: 'ny', reactions: { '👍': [9] } },
  ];
  const merged = mergeLegacyComments(existing, incoming, { uid: 3, name: 'Me' }, 100);
  assert.deepEqual(merged[0], existing[0]);
  assert.deepEqual(merged[1].poll.options[0], { id: 'o1', label: 'Ja', imageUrl: 'x', votes: [3] });
  assert.deepEqual(merged[2], { id: 'new', author: { uid: 3, name: 'Me' }, createdAt: 100, text: 'ny' });
});

test('mergeLegacyComments only lets the caller drop their own comments', () => {
  const existing = [{ id: 'mine', author: { uid: 3 } }, { id: 'theirs', author: { uid: 1 } }];
  const merged = mergeLegacyComments(existing, [{ id: 'new', text: 'hei', imageId: 'a'.repeat(24) }], { uid: 3, name: 'Me' }, 5);
  assert.deepEqual(merged.map((comment) => comment.id), ['theirs', 'new']);
  assert.equal(merged[1].imageId, undefined, 'legacy clients cannot point at uploaded images');
});

test('applyMutes drops muted users but lets direct mentions through for "mentions"', () => {
  const targets = new Map([[1, 'own_post'], [2, 'mention'], [3, 'participant'], [4, 'mention'], [5, 'reply']]);
  const mutes = new Map([[1, 'all'], [2, 'mentions'], [3, 'mentions'], [4, 'all']]);
  assert.deepEqual(Object.fromEntries(applyMutes(targets, mutes)), { 2: 'mention', 5: 'reply' });
});

test('mergeBumpedFeedPage orders by bump time and reports more pages', () => {
  const fresh = [{ _id: 'x', id: 'f3', createdAt: 30 }, { id: 'f2', createdAt: 20 }, { id: 'f1', createdAt: 10 }];
  const bumps = [{ feedItemId: 'old', bumpedAt: 25, reason: 'mention', byUid: 1, byName: 'A', commentId: 'c1' }, { feedItemId: 'gone', bumpedAt: 5 }];
  const bumpedItems = [{ id: 'old', createdAt: 1 }];

  const page = mergeBumpedFeedPage({ fresh, bumps, bumpedItems, limit: 3 });
  assert.deepEqual(page.items.map((item) => item.id), ['f3', 'old', 'f2']);
  assert.equal(page.items[0]._id, undefined);
  assert.deepEqual(page.items[1].bump, { at: 25, reason: 'mention', byUid: 1, byName: 'A', commentId: 'c1' });
  assert.equal(page.items[1].sortAt, 25);
  assert.equal(page.hasMore, true);

  assert.equal(mergeBumpedFeedPage({ fresh, bumps, bumpedItems, limit: 4 }).hasMore, false);
});

// ── Integration against a real MongoDB ───────────────────────────────────────

function stripInternal(document) {
  if (!document) return null;
  const { _id, feedItemId, ...rest } = document;
  const reactions = Object.fromEntries(Object.entries(rest.reactions ?? {}).filter(([, uids]) => uids.length > 0));
  return { ...rest, reactions, replies: (rest.replies ?? []).map((reply) => stripInternal(reply)) };
}

async function waitFor(check, timeoutMs = 3000) {
  const started = Date.now();
  for (;;) {
    if (await check()) return;
    if (Date.now() - started > timeoutMs) throw new Error('Timed out waiting for condition');
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

test('comment threads on feed posts and events', async (t) => {
  const memory = await MongoMemoryServer.create({ instance: { launchTimeout: 60000 } });
  const client = new MongoClient(memory.getUri());
  await client.connect();
  const db = client.db('comments-test');
  t.after(async () => {
    await client.close();
    await memory.stop();
  });

  const users = {
    1: { uid: 1, name: 'Kari', isAdmin: false },
    2: { uid: 2, name: 'Ola', isAdmin: false },
    3: { uid: 3, name: 'Per Persen', isAdmin: false },
    4: { uid: 4, name: 'Eva', isAdmin: false },
  };
  await db.collection(COLLECTIONS.users).insertMany(Object.values(users).map(({ uid, name }) => ({ uid, name })));
  await db.collection(COLLECTIONS.feed).insertMany([
    { id: 'post', type: 'statusrapport_created', source: 'internal', payload: { text: 'hei' }, createdAt: 1, actorUid: 2, actorName: 'Ola' },
    { id: 'event-post', type: 'community_event_created', source: 'internal', payload: { id: 'ev' }, createdAt: 2, actorUid: 1, actorName: 'Kari' },
  ]);
  await db.collection(COLLECTIONS.events).insertOne({
    id: 'ev',
    title: 'Fest',
    status: 'published',
    editMode: 'locked',
    createdBy: { uid: 1, name: 'Kari' },
    coOrganizers: [],
    comments: [{
      id: 'poll-comment',
      author: { uid: 1, name: 'Kari' },
      createdAt: 1,
      poll: { id: 'poll', question: 'Hvor?', allowMultiple: false, options: [{ id: 'a', label: 'A', votes: [2] }, { id: 'b', label: 'B', votes: [] }] },
    }],
  });

  const broadcasts = [];
  const directed = [];
  const matrixChanges = [];
  const service = createCommentService({
    getDatabase: async () => db,
    normalizeComment: stripInternal,
    normalizePerson: (person) => ({ uid: person.uid, name: person.name }),
    normalizePoll: (poll) => ({ ...poll, options: poll.options.filter((option) => option.label) }),
    sanitizeEventDocument: (document) => {
      const { _id, ...rest } = document;
      return { ...rest, comments: (rest.comments ?? []).map(stripInternal) };
    },
    canUserViewCommunityEvent: (event) => event.status === 'published',
    queueMatrixEventChange: async (previous, next) => { matrixChanges.push({ previous, next }); },
    broadcastFeedEvent: (data) => broadcasts.push(data),
    sendFeedEventToUsers: (uids, data) => directed.push({ uids, data }),
    botApiKey: '',
    vocechatHost: '',
    publicUrl: 'https://example.test',
  });

  const app = express();
  app.use(express.json({ limit: '15mb' }));
  app.use((req, _res, next) => { req.currentUser = users[req.header('x-uid')]; next(); });
  service.registerRoutes(app);
  const server = app.listen(0);
  t.after(() => server.close());
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  async function call(method, path, uid, body) {
    const response = await fetch(`${baseUrl}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', 'x-uid': String(uid) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await response.text();
    return { status: response.status, body: text ? JSON.parse(text) : undefined };
  }

  const feedComments = '/comment-threads/feed/post/comments';

  await t.test('adding a comment resolves mentions and bumps related users', async () => {
    const { status, body } = await call('POST', feedComments, 1, {
      text: 'Ser du dette @Per Persen? (ikke Eva)',
      mentions: [{ uid: 3 }, { uid: 4 }, { uid: 42 }],
    });
    assert.equal(status, 201);
    assert.deepEqual(body.mentions, [{ uid: 3, name: 'Per Persen' }]);
    assert.equal(broadcasts.at(-1).__type, 'comment_added');
    assert.deepEqual(broadcasts.at(-1).thread, { kind: 'feed', id: 'post' });

    await waitFor(async () => (await db.collection(COLLECTIONS.feedBumps).countDocuments()) === 2);
    const bumps = await db.collection(COLLECTIONS.feedBumps).find().sort({ uid: 1 }).toArray();
    assert.deepEqual(bumps.map((bump) => [bump.uid, bump.feedItemId, bump.reason]), [[2, 'post', 'own_post'], [3, 'post', 'mention']]);
    // Bumps are stored before they're pushed live, so wait for the pushes too.
    await waitFor(() => directed.filter((entry) => entry.data.__type === 'feed_bump').length === 2);
    const pushed = directed.filter((entry) => entry.data.__type === 'feed_bump');
    assert.deepEqual(pushed.map((entry) => entry.uids[0]).sort(), [2, 3]);
    assert.equal(pushed[0].data.item.comments.length, 1);
    assert.equal(pushed[0].data.item.bump.commentId, body.id);
    assert.equal(bumps[0].commentId, body.id);
  });

  const [comment] = await db.collection(COLLECTIONS.feedComments).find().toArray();

  await t.test('replies bump the parent author with reason "reply"', async () => {
    const { status, body } = await call('POST', `${feedComments}/${comment.id}/replies`, 4, { text: 'svar' });
    assert.equal(status, 201);
    assert.equal(body.text, 'svar');
    await waitFor(async () => (await db.collection(COLLECTIONS.feedBumps).findOne({ uid: 1 }))?.reason === 'reply');
    assert.equal((await db.collection(COLLECTIONS.feedBumps).findOne({ uid: 4 })), null);
  });

  await t.test('reactions toggle on comments and replies', async () => {
    const first = await call('POST', `${feedComments}/${comment.id}/reactions`, 2, { emoji: '🔥' });
    assert.deepEqual(first.body.reactions, { '🔥': [2] });
    const second = await call('POST', `${feedComments}/${comment.id}/reactions`, 2, { emoji: '🔥' });
    assert.deepEqual(second.body.reactions, {});
    assert.equal((await call('POST', `${feedComments}/${comment.id}/reactions`, 2, { emoji: 'notanemoji' })).status, 400);

    const stored = await db.collection(COLLECTIONS.feedComments).findOne({ id: comment.id });
    const replyId = stored.replies[0].id;
    const onReply = await call('POST', `${feedComments}/${comment.id}/replies/${replyId}/reactions`, 3, { emoji: '😂' });
    assert.deepEqual(onReply.body.reactions, { '😂': [3] });
    assert.equal(broadcasts.at(-1).replyId, replyId);
  });

  await t.test('only the author can edit or delete, not even the post owner', async () => {
    assert.equal((await call('PATCH', `${feedComments}/${comment.id}`, 2, { text: 'kapret' })).status, 403);
    const edited = await call('PATCH', `${feedComments}/${comment.id}`, 1, { text: 'Endret tekst' });
    assert.equal(edited.status, 200);
    assert.equal(edited.body.text, 'Endret tekst');
    assert.ok(edited.body.editedAt > 0);
    assert.deepEqual(edited.body.mentions, []);

    const stored = await db.collection(COLLECTIONS.feedComments).findOne({ id: comment.id });
    const replyId = stored.replies[0].id;
    assert.equal((await call('DELETE', `${feedComments}/${comment.id}/replies/${replyId}`, 3)).status, 403);
    assert.equal((await call('DELETE', `${feedComments}/${comment.id}/replies/${replyId}`, 2)).status, 403, 'post owner');
    assert.equal((await call('DELETE', `${feedComments}/${comment.id}/replies/${replyId}`, 4)).status, 204, 'author');
    assert.deepEqual((await db.collection(COLLECTIONS.feedComments).findOne({ id: comment.id })).replies, []);
  });

  await t.test('event posts share the event thread, and anyone can comment on a locked event', async () => {
    const matrixBefore = matrixChanges.length;
    const { status, body } = await call('POST', '/comment-threads/feed/event-post/comments', 4, { text: 'Gleder meg!' });
    assert.equal(status, 201);
    assert.deepEqual(broadcasts.at(-1).thread, { kind: 'event', id: 'ev' });
    const event = await db.collection(COLLECTIONS.events).findOne({ id: 'ev' });
    assert.equal(event.comments.at(-1).id, body.id);
    assert.ok(event.updatedAt > 0);
    assert.equal(matrixChanges.length, matrixBefore + 1);

    await waitFor(async () => (await db.collection(COLLECTIONS.feedBumps).findOne({ uid: 1, feedItemId: 'event-post' }))?.reason === 'own_post');

    const reply = await call('POST', `/comment-threads/event/ev/comments/${body.id}/replies`, 1, { text: 'Samme!' });
    assert.equal(reply.status, 201);
    const reacted = await call('POST', `/comment-threads/event/ev/comments/${body.id}/replies/${reply.body.id}/reactions`, 4, { emoji: '❤️' });
    assert.deepEqual(reacted.body.reactions, { '❤️': [4] });
  });

  await t.test('single-choice poll votes move only the voter', async () => {
    const pollVotes = '/comment-threads/event/ev/comments/poll-comment/poll-votes';
    const voted = await call('POST', pollVotes, 3, { optionId: 'b' });
    assert.deepEqual(voted.body.poll.options.map((option) => option.votes), [[2], [3]]);
    const switched = await call('POST', pollVotes, 2, { optionId: 'b' });
    assert.deepEqual(switched.body.poll.options.map((option) => option.votes), [[], [3, 2]]);
    const removed = await call('POST', pollVotes, 2, { optionId: 'b' });
    assert.deepEqual(removed.body.poll.options.map((option) => option.votes), [[], [3]]);
    assert.equal((await call('POST', '/comment-threads/feed/post/comments/x/poll-votes', 2, { optionId: 'b' })).status, 400);
  });

  await t.test('event organizers cannot delete other people\'s comments', async () => {
    const own = await call('POST', '/comment-threads/event/ev/comments', 3, { text: 'Min kommentar' });
    assert.equal((await call('DELETE', `/comment-threads/event/ev/comments/${own.body.id}`, 1)).status, 403);
    assert.equal((await call('DELETE', `/comment-threads/event/ev/comments/${own.body.id}`, 3)).status, 204);
  });

  await t.test('mute levels filter bumps; muting removes existing bumps', async () => {
    await call('POST', feedComments, 3, { text: 'Jeg er med' });
    await waitFor(async () => (await db.collection(COLLECTIONS.feedBumps).findOne({ uid: 2, feedItemId: 'post' }))?.byUid === 3);

    assert.deepEqual((await call('PUT', '/comment-threads/feed/post/mute', 2, { level: 'all' })).body, { mute: 'all' });
    assert.equal(await db.collection(COLLECTIONS.feedBumps).countDocuments({ uid: 2, feedItemId: 'post' }), 0);
    assert.deepEqual((await call('PUT', '/comment-threads/feed/post/mute', 3, { level: 'mentions' })).body, { mute: 'mentions' });
    assert.equal((await call('PUT', '/comment-threads/feed/post/mute', 3, { level: 'loud' })).status, 400);

    const [withMute] = await service.attachFeedExtras(db, [{ id: 'post', type: 'statusrapport_created' }], 3);
    assert.equal(withMute.mute, 'mentions');

    const plain = await call('POST', feedComments, 4, { text: 'Hei alle' });
    await waitFor(async () => (await db.collection(COLLECTIONS.feedBumps).findOne({ uid: 1, feedItemId: 'post' }))?.commentId === plain.body.id);
    assert.equal(await db.collection(COLLECTIONS.feedBumps).countDocuments({ uid: 2, feedItemId: 'post' }), 0, 'muted all');
    assert.notEqual((await db.collection(COLLECTIONS.feedBumps).findOne({ uid: 3, feedItemId: 'post' }))?.commentId, plain.body.id, 'mentions-only');

    const mentioning = await call('POST', feedComments, 4, { text: 'Se her @Per Persen', mentions: [{ uid: 3 }] });
    await waitFor(async () => (await db.collection(COLLECTIONS.feedBumps).findOne({ uid: 3, feedItemId: 'post' }))?.commentId === mentioning.body.id);
    assert.equal((await db.collection(COLLECTIONS.feedBumps).findOne({ uid: 3, feedItemId: 'post' })).reason, 'mention');
    assert.equal(await db.collection(COLLECTIONS.feedBumps).countDocuments({ uid: 2, feedItemId: 'post' }), 0);

    assert.deepEqual((await call('PUT', '/comment-threads/feed/post/mute', 2, { level: null })).body, { mute: null });
    assert.equal(await db.collection(COLLECTIONS.feedMutes).countDocuments({ uid: 2 }), 0);
  });

  await t.test('typing is relayed and throttled', async () => {
    const before = broadcasts.filter((entry) => entry.__type === 'typing').length;
    assert.equal((await call('POST', '/comment-threads/feed/post/typing', 1)).status, 204);
    assert.equal((await call('POST', '/comment-threads/feed/post/typing', 1)).status, 204);
    const typing = broadcasts.filter((entry) => entry.__type === 'typing');
    assert.equal(typing.length, before + 1);
    assert.deepEqual(typing.at(-1), { __type: 'typing', thread: { kind: 'feed', id: 'post' }, uid: 1, name: 'Kari' });
  });

  await t.test('images: validation, image-only comments and replies, cleanup on delete', async () => {
    const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
    assert.equal((await call('POST', feedComments, 1, { imageDataUrl: 'data:text/plain;base64,aGk=' })).status, 400);
    const huge = `data:image/png;base64,${Buffer.alloc(3 * 1024 * 1024 + 1).toString('base64')}`;
    assert.equal((await call('POST', feedComments, 1, { imageDataUrl: huge })).status, 400);
    const imagesBefore = await db.collection(COLLECTIONS.commentImages).countDocuments();

    const withImage = await call('POST', feedComments, 1, { imageDataUrl: png });
    assert.equal(withImage.status, 201);
    assert.match(withImage.body.imageId, /^[a-f0-9]{24}$/);
    assert.equal(withImage.body.text, undefined);

    const replyWithImage = await call('POST', `${feedComments}/${withImage.body.id}/replies`, 2, { imageDataUrl: png });
    assert.equal(replyWithImage.status, 201);
    assert.equal(replyWithImage.body.text, '');
    assert.equal(await db.collection(COLLECTIONS.commentImages).countDocuments(), imagesBefore + 2);
    const stored = await db.collection(COLLECTIONS.commentImages).findOne({ uid: 2 });
    assert.equal(stored.mimeType, 'image/png');

    assert.equal((await call('DELETE', `${feedComments}/${withImage.body.id}`, 2)).status, 403);
    // It has a reply, so it becomes a placeholder: its own image goes, the reply's stays.
    const softDelete = await call('DELETE', `${feedComments}/${withImage.body.id}`, 1);
    assert.equal(softDelete.status, 200);
    assert.equal(softDelete.body.deleted, true);
    assert.equal(await db.collection(COLLECTIONS.commentImages).countDocuments(), imagesBefore + 1);
    // Deleting the last reply removes the placeholder and the last image.
    const lastReply = await call('DELETE', `${feedComments}/${withImage.body.id}/replies/${replyWithImage.body.id}`, 2);
    assert.deepEqual([lastReply.status, lastReply.body], [200, { removedComment: true }]);
    assert.equal(await db.collection(COLLECTIONS.commentImages).countDocuments(), imagesBefore);
    assert.equal(await db.collection(COLLECTIONS.feedComments).countDocuments({ id: withImage.body.id }), 0);
  });

  await t.test('unpublished events and unknown threads are rejected', async () => {
    await db.collection(COLLECTIONS.events).updateOne({ id: 'ev' }, { $set: { status: 'draft' } });
    assert.equal((await call('POST', '/comment-threads/event/ev/comments', 1, { text: 'x' })).status, 404);
    assert.equal((await call('POST', '/comment-threads/feed/missing/comments', 1, { text: 'x' })).status, 404);
    assert.equal((await call('POST', '/comment-threads/nope/x/comments', 1, { text: 'x' })).status, 400);
  });
});
