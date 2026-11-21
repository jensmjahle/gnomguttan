import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { MongoClient } from 'mongodb';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { createCommentService } from './comments.js';
import { createNotificationService, describeFeedItem, mergeActors, settingAllows } from './notifications.js';
import { COLLECTIONS } from './mongo.js';

test('mergeActors puts the newest actor first, unique and capped', () => {
  const a = { uid: 1, name: 'A' };
  const b = { uid: 2, name: 'B' };
  const c = { uid: 3, name: 'C' };
  const d = { uid: 4, name: 'D' };
  assert.deepEqual(mergeActors([a, b], b), [b, a]);
  assert.deepEqual(mergeActors([c, b, a], d).map((x) => x.uid), [4, 3, 2]);
});

test('settingAllows maps types to settings, with "threads" off by default', () => {
  assert.equal(settingAllows('mention', {}), true);
  assert.equal(settingAllows('thread', {}), false);
  assert.equal(settingAllows('thread', { threads: true }), true);
  assert.equal(settingAllows('reaction', { reactions: false }), false);
  assert.equal(settingAllows('nonsense', {}), false);
});

test('describeFeedItem gives a short name per post type', () => {
  assert.equal(describeFeedItem({ type: 'community_event_created', payload: { title: 'Grillfest' } }), 'Grillfest');
  assert.equal(describeFeedItem({ type: 'statusrapport_created', payload: { text: 'x'.repeat(60) } }).length, 40);
  assert.equal(describeFeedItem({ type: 'lamp_toggled', payload: {} }), 'lampa');
  assert.equal(describeFeedItem({ type: 'github_issue_opened', source: 'github', payload: { title: 'Bug' } }), 'Bug');
});

async function waitFor(check, timeoutMs = 3000) {
  const started = Date.now();
  for (;;) {
    if (await check()) return;
    if (Date.now() - started > timeoutMs) throw new Error('Timed out waiting for condition');
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

function stripInternal(document) {
  if (!document) return null;
  const { _id, feedItemId, ...rest } = document;
  const reactions = Object.fromEntries(Object.entries(rest.reactions ?? {}).filter(([, uids]) => uids.length > 0));
  return { ...rest, reactions, replies: (rest.replies ?? []).map((reply) => stripInternal(reply)) };
}

test('notifications from comment activity, with grouping, settings and mutes', async (t) => {
  const memory = await MongoMemoryServer.create({ instance: { launchTimeout: 60000 } });
  const client = new MongoClient(memory.getUri());
  await client.connect();
  const db = client.db('notifications-test');
  t.after(async () => {
    await client.close();
    await memory.stop();
  });

  const users = {
    1: { uid: 1, name: 'Kari', avatarUpdatedAt: 1 },
    2: { uid: 2, name: 'Ola', avatarUpdatedAt: 1 },
    3: { uid: 3, name: 'Per', avatarUpdatedAt: 1 },
    4: { uid: 4, name: 'Eva', avatarUpdatedAt: 1 },
  };
  await db.collection(COLLECTIONS.users).insertMany(Object.values(users).map(({ uid, name }) => ({ uid, name })));
  await db.collection(COLLECTIONS.feed).insertOne({
    id: 'post', type: 'statusrapport_created', source: 'internal', payload: { text: 'Fjelltur i helga?' }, createdAt: 1, actorUid: 1, actorName: 'Kari',
  });

  const pushed = [];
  const sendFeedEventToUsers = (uids, data) => pushed.push({ uids, data });
  const notifications = createNotificationService({ getDatabase: async () => db, sendFeedEventToUsers });
  const comments = createCommentService({
    getDatabase: async () => db,
    normalizeComment: stripInternal,
    normalizePerson: (person) => ({ uid: person.uid, name: person.name }),
    normalizePoll: (poll) => poll,
    sanitizeEventDocument: (document) => document,
    canUserViewCommunityEvent: () => true,
    queueMatrixEventChange: async () => {},
    broadcastFeedEvent: () => {},
    sendFeedEventToUsers,
    notify: notifications.notify,
    botApiKey: '',
    vocechatHost: '',
    publicUrl: 'https://example.test',
  });

  const app = express();
  app.use(express.json());
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
  const notificationsFor = (uid) => db.collection(COLLECTIONS.notifications).find({ uid }).sort({ updatedAt: -1 }).toArray();
  const thread = '/comment-threads/feed/post/comments';

  let olaComment;
  await t.test('a comment on your post notifies you, with a link to the comment', async () => {
    olaComment = (await call('POST', thread, 2, { text: 'Jeg er med!' })).body;
    await waitFor(async () => (await notificationsFor(1)).length === 1);
    const [notification] = await notificationsFor(1);
    assert.equal(notification.type, 'comment');
    assert.equal(notification.subject, 'post');
    assert.equal(notification.context, 'Fjelltur i helga?');
    assert.equal(notification.snippet, 'Jeg er med!');
    assert.equal(notification.link, `/innlegg/post#c-${olaComment.id}`);
    assert.equal(notification.readAt, null);

    await waitFor(() => pushed.some((entry) => entry.data.__type === 'notification'));
    const live = pushed.filter((entry) => entry.data.__type === 'notification');
    assert.deepEqual(live.map((entry) => entry.uids), [[1]], 'pushed only to the recipient');
    assert.equal(live[0].data.notification.actorCount, 1);
    assert.equal(live[0].data.notification.uid, undefined, 'internal fields are not sent');
  });

  await t.test('unread comment notifications group; once read a new one starts', async () => {
    await call('POST', thread, 3, { text: 'Jeg også' });
    await waitFor(async () => (await notificationsFor(1))[0]?.actorUids.length === 2);
    const grouped = await notificationsFor(1);
    assert.equal(grouped.length, 1);
    assert.deepEqual(grouped[0].actors.map((actor) => actor.uid), [3, 2]);

    // Ola (participant) is not notified: "threads" is off by default.
    assert.equal((await notificationsFor(2)).length, 0);

    const list = await call('GET', '/notifications', 1);
    assert.equal(list.body.unreadCount, 1);
    assert.equal(list.body.items[0].actorCount, 2);
    assert.equal((await call('POST', `/notifications/${list.body.items[0].id}/read`, 1)).body.unreadCount, 0);

    await call('POST', thread, 4, { text: 'Og jeg!' });
    await waitFor(async () => (await notificationsFor(1)).length === 2);
  });

  await t.test('mentions and replies are separate and never grouped', async () => {
    await call('POST', `${thread}/${olaComment.id}/replies`, 1, { text: 'Topp @Per', mentions: [{ uid: 3 }] });
    await waitFor(async () => (await notificationsFor(2)).length === 1 && (await notificationsFor(3)).length === 1);
    assert.equal((await notificationsFor(2))[0].type, 'reply');
    const [mention] = await notificationsFor(3);
    assert.equal(mention.type, 'mention');
    assert.match(mention.link, /^\/innlegg\/post#c-/);
  });

  await t.test('turning a setting off suppresses that type', async () => {
    assert.equal((await call('PUT', '/notifications/settings', 2, { replies: false })).body.replies, false);
    assert.equal((await call('PUT', '/notifications/settings', 2, { nope: true })).status, 400);
    assert.equal((await call('PUT', '/notifications/settings', 2, { replies: 'yes' })).status, 400);
    const settings = (await call('GET', '/notifications/settings', 2)).body;
    assert.deepEqual(settings, { mentions: true, replies: false, ownPosts: true, threads: false, reactions: true, newEvents: true, toast: true, tabTitle: true, push: true });

    await call('POST', `${thread}/${olaComment.id}/replies`, 4, { text: 'Svar til Ola' });
    await new Promise((resolve) => setTimeout(resolve, 200));
    assert.equal((await notificationsFor(2)).length, 1, 'no new reply notification');
  });

  await t.test('reactions notify the author on add only, grouped per comment', async () => {
    await call('POST', `${thread}/${olaComment.id}/reactions`, 3, { emoji: '🔥' });
    await waitFor(async () => (await notificationsFor(2)).some((n) => n.type === 'reaction'));
    await call('POST', `${thread}/${olaComment.id}/reactions`, 4, { emoji: '😂' });
    await waitFor(async () => (await notificationsFor(2)).find((n) => n.type === 'reaction')?.actorUids.length === 2);
    const reaction = (await notificationsFor(2)).find((n) => n.type === 'reaction');
    assert.deepEqual(reaction.emojis, ['😂', '🔥']);
    assert.equal(reaction.subject, 'comment');

    const before = (await notificationsFor(2)).length;
    await call('POST', `${thread}/${olaComment.id}/reactions`, 3, { emoji: '🔥' }); // removes the reaction
    await new Promise((resolve) => setTimeout(resolve, 200));
    assert.equal((await notificationsFor(2)).length, before);
  });

  await t.test('a muted thread suppresses comment and reaction notifications', async () => {
    await call('PUT', '/comment-threads/feed/post/mute', 1, { level: 'all' });
    const before = (await notificationsFor(1)).length;
    const own = (await call('POST', thread, 1, { text: 'Min egen' })).body;
    await call('POST', thread, 3, { text: 'Hei Kari' });
    await call('POST', `${thread}/${own.id}/reactions`, 4, { emoji: '👍' });
    await new Promise((resolve) => setTimeout(resolve, 250));
    assert.equal((await notificationsFor(1)).length, before);
  });

  await t.test('list pagination and read-all', async () => {
    const first = await call('GET', '/notifications?limit=1', 3);
    assert.equal(first.body.items.length, 1);
    assert.equal(first.body.hasMore, (await notificationsFor(3)).length > 1);
    if (first.body.hasMore) {
      const next = await call('GET', `/notifications?limit=1&before=${first.body.items[0].updatedAt}`, 3);
      assert.notEqual(next.body.items[0].id, first.body.items[0].id);
    }
    const all = (await call('GET', '/notifications', 3)).body.items;
    await call('POST', `/notifications/${all[0].id}/read`, 3);
    const unreadOnly = (await call('GET', '/notifications?unread=1', 3)).body;
    assert.ok(unreadOnly.items.every((n) => n.readAt === null));
    assert.equal(unreadOnly.items.length, all.length - 1);

    assert.deepEqual((await call('POST', '/notifications/read-all', 3)).body, { unreadCount: 0 });
    assert.equal((await call('GET', '/notifications', 3)).body.unreadCount, 0);
    assert.deepEqual((await call('GET', '/notifications?unread=1', 3)).body.items, []);
  });

  await t.test('direct notify() skips the actor and respects settings', async () => {
    await call('PUT', '/notifications/settings', 4, { newEvents: false });
    await notifications.notify({
      type: 'event', recipients: [1, 2, 3, 4], actor: users[1], subject: 'event',
      target: { kind: 'event', id: 'ev' }, context: 'Grillfest', link: '/arrangementer/ev',
    });
    const events = await db.collection(COLLECTIONS.notifications).find({ type: 'event' }).toArray();
    assert.deepEqual(events.map((n) => n.uid).sort(), [2, 3]);
    assert.ok(events[0].expiresAt instanceof Date);
  });
});
