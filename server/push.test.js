import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { MongoClient } from 'mongodb';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { COLLECTIONS } from './mongo.js';
import { createPushService } from './pushNotifications.js';
import { createNotificationService, pushTextFor } from './notifications.js';
import { MATRIX_PUSH_APP_ID, describeMatrixNotification, registerMatrixPushGateway } from './matrixPushGateway.js';

const TOKEN_A = 'ExponentPushToken[aaaa]';
const TOKEN_B = 'ExponentPushToken[bbbb]';
const TOKEN_OFF = 'ExponentPushToken[off]';

async function withDb(t) {
  const memory = await MongoMemoryServer.create({ instance: { launchTimeout: 60000 } });
  const client = new MongoClient(memory.getUri());
  await client.connect();
  const db = client.db('push-test');
  t.after(async () => { await client.close(); await memory.stop(); });
  await db.collection(COLLECTIONS.pushTokens).insertMany([
    { token: TOKEN_A, uid: 1 },
    { token: TOKEN_B, uid: 2 },
    { token: TOKEN_OFF, uid: 2, disabledAt: 1 },
  ]);
  return db;
}

function fakeExpo() {
  const sent = [];
  const fetchImpl = async (_url, init) => {
    const messages = JSON.parse(init.body);
    sent.push(...messages);
    return new Response(JSON.stringify({ data: messages.map(() => ({ status: 'ok' })) }), { status: 200 });
  };
  return { sent, fetchImpl };
}

test('pushTextFor words notifications like the website', () => {
  const base = { actors: [{ uid: 1, name: 'Kari' }], actorCount: 1, context: 'Grillfest', target: { kind: 'feed', id: 'x' } };
  assert.deepEqual(pushTextFor({ ...base, type: 'comment', subject: 'event', snippet: 'Jeg kommer!' }), {
    title: 'Kari', body: 'kommenterte arrangementet ditt «Grillfest»: Jeg kommer!',
  });
  assert.equal(pushTextFor({ ...base, type: 'reaction', subject: 'post', emojis: ['🔥'], actorCount: 3, actors: [{ name: 'Kari' }, { name: 'Ola' }] }).title, 'Kari og 2 andre');
  assert.match(pushTextFor({ ...base, type: 'event', subject: 'event' }).body, /nytt arrangement «Grillfest»/);
});

test('describeMatrixNotification hides encrypted content and names the room', () => {
  assert.deepEqual(describeMatrixNotification({ type: 'm.room.encrypted', sender_display_name: 'Ola', room_name: 'Gjengen' }), {
    title: 'Ola – Gjengen', body: 'Sendte en kryptert melding',
  });
  assert.equal(describeMatrixNotification({ type: 'm.room.message', sender: '@ola:x', content: { msgtype: 'm.text', body: 'hei' } }).body, 'hei');
  assert.equal(describeMatrixNotification({ type: 'm.room.message', sender_display_name: 'Ola', room_name: 'Ola', content: { msgtype: 'm.image' } }).title, 'Ola');
});

test('app notifications are pushed to the recipient, throttled when grouped, and respect the push setting', async (t) => {
  const db = await withDb(t);
  const { sent, fetchImpl } = fakeExpo();
  const push = createPushService({ getDatabase: async () => db, fetchImpl });
  const service = createNotificationService({ getDatabase: async () => db, sendFeedEventToUsers: () => {}, sendPush: push.sendToUsers });
  const actor = { uid: 9, name: 'Kari' };
  const base = { type: 'reaction', actor, subject: 'post', target: { kind: 'feed', id: 'p1' }, context: 'Innlegg', link: '/innlegg/p1', groupKey: 'reaction:post:p1' };

  await service.notify({ ...base, recipients: [1, 2], emoji: '👍' });
  await new Promise((resolve) => setTimeout(resolve, 100));
  assert.deepEqual(sent.map((m) => m.to).sort(), [TOKEN_A, TOKEN_B]);
  assert.equal(sent[0].channelId, 'activity');
  assert.equal(sent[0].data.link, '/innlegg/p1');
  assert.equal(sent[0].badge, 1);

  // A second reaction updates the grouped notification but doesn't buzz again right away.
  await service.notify({ ...base, recipients: [1], emoji: '🔥', actor: { uid: 8, name: 'Ola' } });
  await new Promise((resolve) => setTimeout(resolve, 100));
  assert.equal(sent.length, 2);

  await db.collection(COLLECTIONS.notificationSettings).insertOne({ uid: 1, push: false });
  await service.notify({ ...base, type: 'mention', groupKey: undefined, recipients: [1, 2] });
  await new Promise((resolve) => setTimeout(resolve, 100));
  assert.deepEqual(sent.slice(2).map((m) => m.to), [TOKEN_B]);
});

test('the Matrix push gateway only delivers to registered pushkeys and rejects the rest', async (t) => {
  const db = await withDb(t);
  const { sent, fetchImpl } = fakeExpo();
  const push = createPushService({ getDatabase: async () => db, fetchImpl });
  const app = express();
  app.use(express.json());
  registerMatrixPushGateway(app, { getDatabase: async () => db, sendToTokens: push.sendToTokens });
  const server = app.listen(0);
  t.after(() => server.close());
  const url = `http://127.0.0.1:${server.address().port}/_matrix/push/v1/notify`;
  const post = (body) => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

  const res = await post({ notification: {
    event_id: '$e', room_id: '!r:x', type: 'm.room.message', sender: '@kari:x', sender_display_name: 'Kari', room_name: 'Gjengen',
    content: { msgtype: 'm.text', body: 'Hei alle' }, counts: { unread: 3 },
    devices: [
      { app_id: MATRIX_PUSH_APP_ID, pushkey: TOKEN_A },
      { app_id: MATRIX_PUSH_APP_ID, pushkey: TOKEN_OFF },
      { app_id: MATRIX_PUSH_APP_ID, pushkey: 'ExponentPushToken[unknown]' },
    ],
  } });
  assert.equal(res.status, 200);
  assert.deepEqual((await res.json()).rejected.sort(), [TOKEN_OFF, 'ExponentPushToken[unknown]'].sort());
  assert.equal(sent.length, 1);
  assert.deepEqual({ to: sent[0].to, title: sent[0].title, body: sent[0].body, badge: sent[0].badge, data: sent[0].data }, {
    to: TOKEN_A, title: 'Kari – Gjengen', body: 'Hei alle', badge: 3, data: { type: 'matrix', roomId: '!r:x', eventId: '$e' },
  });

  // Count-only updates (room read elsewhere) send nothing.
  await post({ notification: { counts: { unread: 0 }, devices: [{ app_id: MATRIX_PUSH_APP_ID, pushkey: TOKEN_A }] } });
  assert.equal(sent.length, 1);
  assert.equal((await post({})).status, 400);
});
