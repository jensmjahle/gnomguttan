// End-to-end test of the Matrix engine page (matrix-engine.html) against a real homeserver.
//
// Needs a local Synapse on 127.0.0.1:8008 with registration enabled, users @kari and @ola
// (password "passord123"), `push: include_content: true` and `ip_range_whitelist: [127.0.0.1]`,
// plus `npx vite build && npx vite preview --port 4173`. Then: node scripts/matrix-engine/e2e.mjs
import pw from 'playwright'; const { chromium } = pw;
import express from 'express';
import { registerMatrixPushGateway, MATRIX_PUSH_APP_ID } from '../../server/matrixPushGateway.js';

const HS = 'http://127.0.0.1:8008';
const ENGINE = 'http://localhost:4173/matrix-engine.html';
const PUSHKEY = 'ExponentPushToken[testdevice]';

// Fake push gateway backend (no Mongo): the pushkey is registered.
const pushed = [];
const db = { collection: () => ({ find: () => ({ project: () => ({ toArray: async () => [{ token: PUSHKEY }] }) }) }) };
const app = express();
app.use(express.json());
registerMatrixPushGateway(app, { getDatabase: async () => db, sendToTokens: async (_db, messages) => { pushed.push(...messages); } });
const gw = app.listen(8099);

const browser = await chromium.launch();
async function engine(name) {
  const page = await browser.newPage();
  page.on('console', (m) => { if (m.type() === 'error') console.log(`[${name} console]`, m.text().slice(0, 200)); });
  await page.exposeFunction('__onEvent', (e) => { (page.__events ||= []).push(e); });
  await page.addInitScript(() => { window.gnomEngine = { onEvent: (e) => window.__onEvent(e) }; });
  await page.goto(ENGINE);
  let id = 0;
  const call = (cmd, args = {}) => page.evaluate(([id, cmd, args]) => new Promise((resolve, reject) => {
    const prev = window.gnomEngine.onEvent;
    window.gnomEngine.onEvent = (e) => {
      prev(e);
      if (e.event === 'reply' && e.id === id) { window.gnomEngine.onEvent = prev; e.ok ? resolve(e.result) : reject(new Error(e.error)); }
    };
    window.gnomEngine.receive({ id, cmd, args });
  }), [++id, cmd, args]);
  const waitFor = async (pred, label, ms = 30000) => {
    const start = Date.now();
    for (;;) {
      const hit = (page.__events || []).slice().reverse().find(pred);
      if (hit) return hit;
      if (Date.now() - start > ms) throw new Error(`${name}: timed out waiting for ${label}`);
      await new Promise((r) => setTimeout(r, 200));
    }
  };
  return { page, call, waitFor, events: () => page.__events || [] };
}

const ok = (cond, msg) => { if (!cond) throw new Error(`FAIL: ${msg}`); console.log(`✓ ${msg}`); };

try {
  const kari = await engine('kari');
  const ola = await engine('ola');
  ok(kari.events().some((e) => e.event === 'ready' && e.version === 1), 'engine reports ready with protocol v1');

  const sk = await kari.call('login', { baseUrl: HS, user: 'kari', password: 'passord123', deviceName: 'test' });
  ok(sk.userId === '@kari:localhost' && sk.accessToken, 'login returns a session');
  await ola.call('login', { baseUrl: HS, user: 'ola', password: 'passord123', deviceName: 'test' });
  await kari.waitFor((e) => e.event === 'status' && e.status === 'online' && e.cryptoReady, 'kari online');
  await ola.waitFor((e) => e.event === 'status' && e.status === 'online' && e.cryptoReady, 'ola online');
  ok(true, 'both clients synced with crypto ready');

  await ola.call('setPusher', { pushkey: PUSHKEY, gatewayUrl: 'http://127.0.0.1:8099/_matrix/push/v1/notify', appId: MATRIX_PUSH_APP_ID, deviceName: 'Olas telefon' });
  ok(true, 'pusher registered on the homeserver');

  const { roomId } = await kari.call('createRoom', { name: 'Gjengen', topic: 'Test', encrypted: true, space: false });
  await kari.call('invite', { roomId, userId: '@ola:localhost' });
  const invited = await ola.waitFor((e) => e.event === 'rooms' && e.rooms.some((r) => r.roomId === roomId && r.membership === 'invite'), 'invite');
  ok(invited.rooms.find((r) => r.roomId === roomId).inviter, 'ola sees the invite with inviter');
  await ola.call('join', { target: roomId });
  await kari.waitFor((e) => e.event === 'rooms' && e.rooms.some((r) => r.roomId === roomId && r.memberCount === 2), 'ola joined', 30000);

  await ola.call('watchRoom', { roomId });
  await kari.call('watchRoom', { roomId });
  await new Promise((r) => setTimeout(r, 1500));
  await kari.call('send', { roomId, text: 'Hei **alle** sammen' });
  const got = await ola.waitFor((e) => e.event === 'timeline' && e.timeline.items.some((i) => i.kind === 'text' && i.body === 'Hei **alle** sammen'), 'decrypted message', 40000);
  const message = got.timeline.items.find((i) => i.body === 'Hei **alle** sammen');
  ok(message.senderName === 'kari' && !message.own, 'ola decrypts the encrypted message from kari');
  const olaRoom = (await ola.waitFor((e) => e.event === 'rooms' && e.rooms.some((r) => r.roomId === roomId), 'rooms')).rooms.find((r) => r.roomId === roomId);
  ok(olaRoom.encrypted, 'room is marked encrypted');

  await ola.call('react', { roomId, eventId: message.id, key: '🔥' });
  await kari.waitFor((e) => e.event === 'timeline' && e.timeline.items.some((i) => i.id === message.id && i.reactions.some((r) => r.key === '🔥' && r.count === 1)), 'reaction');
  ok(true, 'reaction shows up for kari');
  await ola.call('react', { roomId, eventId: message.id, key: '🔥' });
  await kari.waitFor((e) => e.event === 'timeline' && e.timeline.items.some((i) => i.id === message.id && i.reactions.length === 0), 'reaction removed');
  ok(true, 'reacting again removes the reaction');

  await kari.call('edit', { roomId, eventId: message.id, text: 'Hei alle (redigert)' });
  await ola.waitFor((e) => e.event === 'timeline' && e.timeline.items.some((i) => i.id === message.id && i.edited && i.body === 'Hei alle (redigert)'), 'edit');
  ok(true, 'edits replace the shown text');

  await ola.call('send', { roomId, text: 'Svar!', replyTo: message.id });
  const reply = await kari.waitFor((e) => e.event === 'timeline' && e.timeline.items.some((i) => i.body === 'Svar!' && i.replyTo?.id === message.id), 'reply');
  ok(reply.timeline.items.find((i) => i.body === 'Svar!').replyTo.senderName === 'kari', 'replies carry the quoted message');

  await kari.call('createPoll', { roomId, question: 'Pizza?', answers: ['Ja', 'Nei'] });
  const pollEv = await ola.waitFor((e) => e.event === 'timeline' && e.timeline.items.some((i) => i.kind === 'poll'), 'poll');
  const poll = pollEv.timeline.items.find((i) => i.kind === 'poll');
  await ola.call('votePoll', { roomId, eventId: poll.id, answerIds: [poll.poll.answers[0].id] });
  await kari.waitFor((e) => e.event === 'timeline' && e.timeline.items.some((i) => i.kind === 'poll' && i.poll.totalVotes === 1 && i.poll.answers[0].count === 1), 'vote', 30000);
  ok(true, 'poll votes are counted');

  // 1x1 red PNG
  const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==';
  await kari.call('sendFile', { roomId, base64: png, name: 'rod.png', mimetype: 'image/png' });
  const img = await ola.waitFor((e) => e.event === 'timeline' && e.timeline.items.some((i) => i.kind === 'image'), 'image', 30000);
  const media = img.timeline.items.find((i) => i.kind === 'image').media;
  ok(media.file && media.w === 1, 'encrypted image arrives with dimensions');
  const fetched = await ola.call('media', { ref: media });
  ok(fetched.base64 === png, 'media is downloaded and decrypted byte-for-byte');

  await kari.call('sendLocation', { roomId, latitude: 59.91, longitude: 10.75, accuracy: 10 });
  await ola.waitFor((e) => e.event === 'timeline' && e.timeline.items.some((i) => i.kind === 'location' && i.location.latitude === 59.91), 'location');
  ok(true, 'locations are parsed');

  const details = await kari.call('roomDetails', { roomId });
  ok(details.members.length === 2 && details.canEdit.name, 'room details list members and permissions');

  const { roomId: dm } = await kari.call('createDirect', { userId: '@ola:localhost' });
  await ola.waitFor((e) => e.event === 'rooms' && e.rooms.some((r) => r.roomId === dm && r.isDirect), 'dm invite', 30000);
  ok(true, 'direct messages are flagged as direct');

  await ola.call('markRead', { roomId });
  await ola.waitFor((e) => e.event === 'rooms' && e.rooms.some((r) => r.roomId === roomId && r.unread === 0), 'read');
  ok(true, 'marking read clears unread count');

  // Synapse pushes the encrypted messages to our gateway.
  for (let i = 0; i < 50 && pushed.length === 0; i++) await new Promise((r) => setTimeout(r, 200));
  ok(pushed.length > 0, `homeserver pushed ${pushed.length} notification(s) through the gateway`);
  console.log('  sample push:', JSON.stringify({ title: pushed[0].title, body: pushed[0].body, data: pushed[0].data }));

  const profile = await kari.call('profile');
  ok(profile.userId === '@kari:localhost', 'profile works');
  await kari.call('logout');
  await kari.waitFor((e) => e.event === 'status' && e.status === 'stopped', 'stopped');
  ok(true, 'logout stops the client');
  console.log('\nALL ENGINE CHECKS PASSED');
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  await browser.close();
  gw.close();
}
