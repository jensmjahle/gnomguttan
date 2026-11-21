// Edge cases for comment threads: deletes with replies, concurrency, permissions,
// limits, mutes and threads that disappear mid-conversation.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import express from 'express';
import { MongoClient } from 'mongodb';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { createCommentService, createRateLimiter, mergeLegacyComments } from './comments.js';
import { normalizeCommunityEventComment, normalizeCommunityEventPerson, normalizeCommunityEventPoll } from './communityEventNormalize.js';
import { createNotificationService } from './notifications.js';
import { COLLECTIONS } from './mongo.js';

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

async function waitFor(check, timeoutMs = 3000) {
  const started = Date.now();
  for (;;) {
    if (await check()) return;
    if (Date.now() - started > timeoutMs) throw new Error('Timed out waiting for condition');
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}
const settle = (ms = 250) => new Promise((resolve) => setTimeout(resolve, ms));

// ── Pure ──────────────────────────────────────────────────────────────────────

test('the normalizer keeps a deleted placeholder only while it has replies', () => {
  const reply = { id: 'r', author: { uid: 2, name: 'Ola' }, text: 'svar', createdAt: 2 };
  const placeholder = normalizeCommunityEventComment({ id: 'c', author: { uid: 1, name: 'Kari' }, createdAt: 1, deleted: true, deletedAt: 5, replies: [reply] });
  assert.equal(placeholder.deleted, true);
  assert.equal(placeholder.text, '');
  assert.equal(placeholder.replies.length, 1);
  assert.equal(normalizeCommunityEventComment({ id: 'c', author: { uid: 1, name: 'Kari' }, createdAt: 1, deleted: true, replies: [] }), null);
  // Leftover content on a placeholder is never exposed.
  const leaky = normalizeCommunityEventComment({ id: 'c', author: { uid: 1 }, deleted: true, text: 'hemmelig', imageId: 'a'.repeat(24), replies: [reply] });
  assert.equal(leaky.text, '');
  assert.equal(leaky.imageId, undefined);
});

test('legacy saves: dropping your own comment with replies leaves a placeholder', () => {
  const reply = { id: 'r', author: { uid: 2 }, text: 'svar' };
  const existing = [
    { id: 'mine-with-replies', author: { uid: 1 }, text: 'a', createdAt: 1, replies: [reply] },
    { id: 'mine-alone', author: { uid: 1 }, text: 'b', createdAt: 2 },
    { id: 'theirs', author: { uid: 2 }, text: 'c', createdAt: 3 },
  ];
  const merged = mergeLegacyComments(existing, [], { uid: 1, name: 'Kari' }, 10);
  assert.deepEqual(merged.map((comment) => comment.id), ['mine-with-replies', 'theirs']);
  assert.equal(merged[0].deleted, true);
  assert.equal(merged[0].text, '');
  assert.deepEqual(merged[0].replies, [reply]);
});

test('the rate limiter counts per key within a window', () => {
  const allow = createRateLimiter({ windowMs: 1000, max: 2 });
  expect3(allow('a', 0), allow('a', 10), allow('a', 20), [true, true, false]);
  assert.equal(allow('b', 20), true, 'other users have their own budget');
  assert.equal(allow('a', 1000), true, 'a new window starts fresh');
  function expect3(a, b, c, expected) { assert.deepEqual([a, b, c], expected); }
});

// ── Integration ───────────────────────────────────────────────────────────────

test('comment lifecycle edge cases', async (t) => {
  const memory = await MongoMemoryServer.create({ instance: { launchTimeout: 60000 } });
  const client = new MongoClient(memory.getUri());
  await client.connect();
  const db = client.db('comment-lifecycle');

  // Fake VoceChat that records bot DMs.
  const dms = [];
  const vocechat = http.createServer(async (req, res) => {
    let body = '';
    for await (const chunk of req) body += chunk;
    const match = req.url.match(/send_to_user\/(\d+)/);
    if (match) dms.push({ uid: Number(match[1]), message: body });
    res.end('1');
  });
  await new Promise((resolve) => vocechat.listen(0, '127.0.0.1', resolve));

  t.after(async () => {
    vocechat.close();
    await client.close();
    await memory.stop();
  });

  const users = {
    1: { uid: 1, name: 'Kari Nordmann', isAdmin: true },
    2: { uid: 2, name: 'Ola Hansen', isAdmin: false },
    3: { uid: 3, name: 'Per Persen', isAdmin: false },
    4: { uid: 4, name: 'Eva Berg', isAdmin: false },
    5: { uid: 5, name: 'Sindre Lie', isAdmin: false },
    6: { uid: 6, name: 'Ingrid Dahl', isAdmin: false },
    7: { uid: 7, name: 'Jon Moe', isAdmin: false },
  };
  await db.collection(COLLECTIONS.users).insertMany(Object.values(users).map(({ uid, name }) => ({ uid, name })));
  await db.collection(COLLECTIONS.feed).insertMany([
    { id: 'post', type: 'statusrapport_created', source: 'internal', payload: { text: 'Fjelltur?' }, createdAt: 1, actorUid: 2, actorName: 'Ola Hansen' },
    { id: 'event-post', type: 'community_event_created', source: 'internal', payload: { id: 'ev' }, createdAt: 2, actorUid: 1, actorName: 'Kari Nordmann' },
  ]);
  const freshEvent = () => ({
    id: 'ev', title: 'Grillfest', status: 'published', editMode: 'locked',
    createdBy: { uid: 1, name: 'Kari Nordmann' }, coOrganizers: [{ uid: 4, name: 'Eva Berg' }], comments: [],
  });
  await db.collection(COLLECTIONS.events).insertOne(freshEvent());

  const broadcasts = [];
  const directed = [];
  const sendFeedEventToUsers = (uids, data) => directed.push({ uids, data });
  const notifications = createNotificationService({ getDatabase: async () => db, sendFeedEventToUsers });
  const comments = createCommentService({
    getDatabase: async () => db,
    normalizeComment: normalizeCommunityEventComment,
    normalizePerson: normalizeCommunityEventPerson,
    normalizePoll: normalizeCommunityEventPoll,
    sanitizeEventDocument: ({ _id, ...rest }) => ({
      ...rest,
      coOrganizers: rest.coOrganizers ?? [],
      comments: (rest.comments ?? []).map(normalizeCommunityEventComment).filter(Boolean),
    }),
    canUserViewCommunityEvent: (event, user) => event.status === 'published' || user?.isAdmin,
    queueMatrixEventChange: async () => {},
    broadcastFeedEvent: (data) => broadcasts.push(data),
    sendFeedEventToUsers,
    notify: notifications.notify,
    removeNotificationsForComments: notifications.removeForComments,
    botApiKey: 'bot-key',
    vocechatHost: `http://127.0.0.1:${vocechat.address().port}`,
    publicUrl: 'https://example.test',
  });

  const app = express();
  app.use(express.json({ limit: '15mb' }));
  app.use((req, _res, next) => { req.currentUser = users[req.header('x-uid')]; next(); });
  comments.registerRoutes(app);
  notifications.registerRoutes(app);
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
  const feed = '/comment-threads/feed/post/comments';
  const eventThread = '/comment-threads/event/ev/comments';
  const storedFeedComment = (id) => db.collection(COLLECTIONS.feedComments).findOne({ id });
  const notificationsOf = (uid) => db.collection(COLLECTIONS.notifications).find({ uid }).toArray();
  const imageCount = () => db.collection(COLLECTIONS.commentImages).countDocuments();

  let parent;
  let replyByEva;
  let replyBySindre;

  await t.test('a deleted comment with replies becomes a placeholder; replies, their images and notifications stay', async () => {
    parent = (await call('POST', feed, 3, { text: 'Jeg kan kjøre', imageDataUrl: PNG })).body;
    replyByEva = (await call('POST', `${feed}/${parent.id}/replies`, 4, { text: 'Topp!' })).body;
    replyBySindre = (await call('POST', `${feed}/${parent.id}/replies`, 5, { text: 'Se her', imageDataUrl: PNG })).body;
    await call('POST', `${feed}/${parent.id}/reactions`, 2, { emoji: '👍' });
    await waitFor(async () => (await notificationsOf(3)).some((n) => n.type === 'reaction'));
    await waitFor(async () => (await notificationsOf(3)).filter((n) => n.type === 'reply').length === 2);
    assert.equal(await imageCount(), 2);
    const reactionNotification = (await notificationsOf(3)).find((n) => n.type === 'reaction');

    const response = await call('DELETE', `${feed}/${parent.id}`, 3);
    assert.equal(response.status, 200);
    assert.equal(response.body.deleted, true, 'the caller learns it became a placeholder');
    assert.ok(response.body.deletedAt > 0);

    const stored = await storedFeedComment(parent.id);
    assert.equal(stored.deleted, true);
    assert.equal(stored.text, '');
    assert.equal(stored.imageId, undefined);
    assert.deepEqual(stored.reactions, {});
    assert.deepEqual(stored.replies.map((reply) => reply.id), [replyByEva.id, replyBySindre.id]);
    assert.equal(await imageCount(), 1, "the parent's image is deleted, the reply's is kept");

    const update = broadcasts.at(-1);
    assert.equal(update.__type, 'comment_updated');
    assert.equal(update.patch.deleted, true);

    // The reaction on the deleted comment is now meaningless; reply notifications still point at live replies.
    await waitFor(() => directed.some((entry) => entry.data.__type === 'notification_removed' && entry.data.id === reactionNotification.id));
    const left = await notificationsOf(3);
    assert.equal(left.some((n) => n.type === 'reaction'), false);
    assert.equal(left.filter((n) => n.type === 'reply').length, 2);
    assert.equal(await db.collection(COLLECTIONS.feedBumps).countDocuments({ commentId: parent.id }), 0);
  });

  await t.test('a placeholder can be replied to, but not edited, reacted to or deleted again', async () => {
    assert.equal((await call('PATCH', `${feed}/${parent.id}`, 3, { text: 'tilbake' })).status, 409);
    assert.equal((await call('POST', `${feed}/${parent.id}/reactions`, 2, { emoji: '❤️' })).status, 409);
    assert.equal((await call('DELETE', `${feed}/${parent.id}`, 3)).status, 409);
    const reply = await call('POST', `${feed}/${parent.id}/replies`, 1, { text: 'Hva skjedde her?' });
    assert.equal(reply.status, 201);
    // Replies under a placeholder can still get reactions.
    assert.equal((await call('POST', `${feed}/${parent.id}/replies/${replyByEva.id}/reactions`, 2, { emoji: '😂' })).status, 200);
    await call('DELETE', `${feed}/${parent.id}/replies/${reply.body.id}`, 1);
  });

  await t.test('deleting the last reply removes the placeholder and the remaining images', async () => {
    assert.equal((await call('DELETE', `${feed}/${parent.id}/replies/${replyByEva.id}`, 4)).status, 204);
    assert.ok(await storedFeedComment(parent.id), 'still one reply left');
    const lastReply = await call('DELETE', `${feed}/${parent.id}/replies/${replyBySindre.id}`, 5);
    assert.deepEqual([lastReply.status, lastReply.body], [200, { removedComment: true }], 'the caller learns the placeholder went too');
    assert.equal(await storedFeedComment(parent.id), null);
    assert.equal(await imageCount(), 0);
    const last = broadcasts.at(-1);
    assert.deepEqual([last.__type, last.commentId, last.replyId], ['comment_deleted', parent.id, undefined]);
    await waitFor(async () => (await notificationsOf(3)).filter((n) => n.type === 'reply').length === 0);
  });

  await t.test('a comment without replies is hard-deleted; acting on it afterwards is 404', async () => {
    const lonely = (await call('POST', feed, 3, { text: 'Alene' })).body;
    assert.equal((await call('DELETE', `${feed}/${lonely.id}`, 3)).status, 204);
    assert.equal(await storedFeedComment(lonely.id), null);
    assert.equal(broadcasts.at(-1).__type, 'comment_deleted');
    assert.equal((await call('POST', `${feed}/${lonely.id}/replies`, 4, { text: 'for sent' })).status, 404);
    assert.equal((await call('POST', `${feed}/${lonely.id}/reactions`, 4, { emoji: '👍' })).status, 404);
    assert.equal((await call('PATCH', `${feed}/${lonely.id}`, 3, { text: 'x' })).status, 404);
    assert.equal((await call('DELETE', `${feed}/${lonely.id}`, 3)).status, 404);
  });

  await t.test('placeholders work the same inside an event document, polls included', async () => {
    const poll = (await call('POST', eventThread, 2, {
      text: 'Hva spiser vi?',
      poll: { question: 'Mat?', allowMultiple: false, options: [{ label: 'Pølser' }, { label: 'Burger' }] },
    })).body;
    await call('POST', `${eventThread}/${poll.id}/replies`, 3, { text: 'Burger!' });
    assert.equal((await call('DELETE', `${eventThread}/${poll.id}`, 2)).status, 200);

    const event = await db.collection(COLLECTIONS.events).findOne({ id: 'ev' });
    const stored = event.comments.find((comment) => comment.id === poll.id);
    assert.equal(stored.deleted, true);
    assert.equal(stored.poll, undefined);
    assert.equal(stored.replies.length, 1);
    assert.equal((await call('POST', `${eventThread}/${poll.id}/poll-votes`, 4, { optionId: 'x' })).status, 409);
  });

  await t.test('concurrent comments and reactions on an event all survive', async () => {
    const before = (await db.collection(COLLECTIONS.events).findOne({ id: 'ev' })).comments.length;
    const posted = await Promise.all(Array.from({ length: 10 }, (_, i) => call('POST', eventThread, (i % 5) + 1, { text: `Samtidig ${i}` })));
    assert.ok(posted.every((response) => response.status === 201));
    const after = (await db.collection(COLLECTIONS.events).findOne({ id: 'ev' })).comments;
    assert.equal(after.length, before + 10);

    const target = posted[0].body.id;
    await Promise.all([1, 2, 3, 4, 5].map((uid) => call('POST', `${eventThread}/${target}/reactions`, uid, { emoji: '🎉' })));
    const reacted = (await db.collection(COLLECTIONS.events).findOne({ id: 'ev' })).comments.find((comment) => comment.id === target);
    assert.deepEqual([...reacted.reactions['🎉']].sort(), [1, 2, 3, 4, 5]);
  });

  await t.test('only the author may edit or delete — not post owners, organizers or admins', async () => {
    const onPost = (await call('POST', feed, 3, { text: 'Min' })).body;
    for (const uid of [2, 1, 5]) { // post owner, admin, someone else
      assert.equal((await call('PATCH', `${feed}/${onPost.id}`, uid, { text: 'kapret' })).status, 403, `edit by ${uid}`);
      assert.equal((await call('DELETE', `${feed}/${onPost.id}`, uid)).status, 403, `delete by ${uid}`);
    }
    assert.equal((await call('PATCH', `${feed}/${onPost.id}`, 3, { text: 'Endret' })).status, 200);
    assert.equal((await call('DELETE', `${feed}/${onPost.id}`, 3)).status, 204);

    const onEvent = (await call('POST', eventThread, 5, { text: 'Gleder meg' })).body;
    for (const uid of [1, 4]) { // event owner/admin, co-organizer
      assert.equal((await call('DELETE', `${eventThread}/${onEvent.id}`, uid)).status, 403, `delete by ${uid}`);
    }
    assert.equal((await call('DELETE', `${eventThread}/${onEvent.id}`, 5)).status, 204);
  });

  await t.test('limits and validation', async () => {
    assert.equal((await call('POST', feed, 1, { text: 'x'.repeat(2000) })).status, 201);
    assert.equal((await call('POST', feed, 1, { text: 'x'.repeat(2001) })).status, 400);
    assert.equal((await call('POST', feed, 1, {})).status, 400);
    assert.equal((await call('POST', feed, 1, { text: '   \n  ' })).status, 400);
    assert.equal((await call('POST', feed, 1, { imageDataUrl: 'data:image/svg+xml;base64,PHN2Zy8+' })).status, 400, 'svg is not allowed');
    assert.equal((await call('POST', feed, 1, { imageDataUrl: `data:image/png;base64,${Buffer.alloc(3 * 1024 * 1024 + 1).toString('base64')}` })).status, 400);
    const comment = (await call('POST', feed, 1, { text: 'ok' })).body;
    assert.equal((await call('POST', `${feed}/${comment.id}/reactions`, 2, { emoji: '🐸' })).status, 400, 'not in the whitelist');
    assert.equal((await call('POST', `${feed}/${comment.id}/reactions`, 2, { emoji: 'reactions.$x' })).status, 400);
    assert.equal((await call('POST', `${feed}/nope/replies`, 2, { text: 'x' })).status, 404);
    assert.equal((await call('POST', '/comment-threads/nope/post/comments', 2, { text: 'x' })).status, 400);
    assert.equal((await call('POST', '/comment-threads/feed/missing/comments', 2, { text: 'x' })).status, 404);
  });

  await t.test('mute levels decide bumps, notifications and DMs', async () => {
    // A fresh thread: Per and Eva have both taken part.
    await db.collection(COLLECTIONS.feed).insertOne({ id: 'quiet', type: 'statusrapport_created', source: 'internal', payload: { text: 'Stille' }, createdAt: 3, actorUid: 2, actorName: 'Ola Hansen' });
    const quiet = '/comment-threads/feed/quiet';
    await call('POST', `${quiet}/comments`, 3, { text: 'Per her' });
    await call('POST', `${quiet}/comments`, 4, { text: 'Eva her' });
    await call('PUT', `${quiet}/mute`, 3, { level: 'all' });
    await call('PUT', `${quiet}/mute`, 4, { level: 'mentions' });
    await settle();
    const dmsBefore = dms.length;
    const perBefore = (await notificationsOf(3)).length;
    const evaBefore = (await notificationsOf(4)).length;

    const mention = (await call('POST', `${quiet}/comments`, 5, { text: '@Per Persen og @Eva Berg se her', mentions: [{ uid: 3 }, { uid: 4 }] })).body;
    await waitFor(() => dms.length > dmsBefore);
    await settle();
    assert.deepEqual(dms.slice(dmsBefore).map((dm) => dm.uid), [4], 'only Eva (mentions level) gets the DM');
    assert.match(dms.at(-1).message, new RegExp(`/innlegg/quiet#c-${mention.id}`));
    assert.equal((await notificationsOf(3)).length, perBefore, 'Per muted everything');
    assert.equal((await notificationsOf(4)).length, evaBefore + 1);
    assert.equal((await db.collection(COLLECTIONS.feedBumps).findOne({ uid: 4, feedItemId: 'quiet' })).reason, 'mention');
    assert.equal(await db.collection(COLLECTIONS.feedBumps).countDocuments({ uid: 3, feedItemId: 'quiet' }), 0);

    await call('POST', `${quiet}/comments`, 5, { text: 'Vanlig kommentar' });
    await settle();
    assert.equal((await notificationsOf(4)).length, evaBefore + 1, 'plain activity is silent at mentions level');
    assert.ok((await notificationsOf(2)).some((n) => n.type === 'comment' && n.target.id === 'quiet'), 'the unmuted owner is notified');
  });

  await t.test('threads that become unavailable reject further activity', async () => {
    await db.collection(COLLECTIONS.events).updateOne({ id: 'ev' }, { $set: { status: 'draft' } });
    assert.equal((await call('POST', eventThread, 3, { text: 'x' })).status, 404, 'drafts are hidden from non-admins');
    assert.equal((await call('POST', eventThread, 1, { text: 'x' })).status, 403, 'admins see it, but it is not published');
    await db.collection(COLLECTIONS.events).deleteOne({ id: 'ev' });
    assert.equal((await call('POST', eventThread, 1, { text: 'x' })).status, 404);
    assert.equal((await call('POST', '/comment-threads/event/ev/typing', 1)).status, 404);
    assert.equal((await call('PUT', '/comment-threads/event/ev/mute', 1, { level: 'all' })).status, 404);
    assert.equal((await call('POST', '/comment-threads/feed/event-post/comments', 1, { text: 'x' })).status, 404, 'its feed post leads nowhere');
  });

  await t.test('rate limits: 30 writes and 12 images per user, then 429', async () => {
    await db.collection(COLLECTIONS.feed).insertOne({ id: 'busy', type: 'statusrapport_created', source: 'internal', payload: { text: 'Travelt' }, createdAt: 4, actorUid: 2, actorName: 'Ola Hansen' });
    const busy = '/comment-threads/feed/busy/comments';
    const statuses = [];
    for (let i = 0; i < 31; i += 1) statuses.push((await call('POST', busy, 6, { text: `Melding ${i}` })).status);
    assert.deepEqual(statuses.slice(0, 30), Array(30).fill(201));
    const limited = await call('POST', busy, 6, { text: 'En til' });
    assert.equal(limited.status, 429);
    assert.match(limited.body.error, /for rask/);
    assert.equal((await call('POST', busy, 5, { text: 'Sindre er ikke begrenset' })).status, 201, 'other users are unaffected');

    const imageStatuses = [];
    for (let i = 0; i < 13; i += 1) imageStatuses.push((await call('POST', busy, 7, { imageDataUrl: PNG })).status);
    assert.deepEqual(imageStatuses, [...Array(12).fill(201), 429]);
  });
});
