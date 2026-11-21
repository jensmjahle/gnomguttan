// Boots the real server/index.js against an in-memory MongoDB and a fake VoceChat,
// and exercises the feed wiring that only exists in index.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { MongoClient } from 'mongodb';
import { MongoMemoryServer } from 'mongodb-memory-server';

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
const USERS = {
  t1: { uid: 1, name: 'Kari Nordmann' },
  t2: { uid: 2, name: 'Ola Hansen' },
  t3: { uid: 3, name: 'Per Persen' },
  t4: { uid: 4, name: 'Eva Berg' },
};
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function waitFor(check, label, timeout = 8000) {
  const until = Date.now() + timeout;
  while (Date.now() < until) {
    if (await check()) return;
    await pause(50);
  }
  throw new Error(`Timed out: ${label}`);
}

test('feed routes in server/index.js', { timeout: 180000 }, async (t) => {
  const memory = await MongoMemoryServer.create({ instance: { launchTimeout: 60000 } });
  const dms = [];
  const vocechat = http.createServer(async (req, res) => {
    const route = new URL(req.url, 'http://x').pathname;
    let raw = '';
    for await (const chunk of req) raw += chunk;
    if (route === '/api/user/me') {
      const user = USERS[req.headers['x-api-key']];
      res.writeHead(user ? 200 : 401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(user ? { ...user, avatar_updated_at: 1, is_admin: false } : {}));
      return;
    }
    if (route.startsWith('/api/bot/send_to_user/')) dms.push({ uid: Number(route.split('/').pop()), message: raw });
    if (route.endsWith('/events')) { res.writeHead(200, { 'Content-Type': 'text/event-stream' }); res.write(': ok\n\n'); return; }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end('[]');
  });
  await new Promise((resolve) => vocechat.listen(0, '127.0.0.1', resolve));

  const portFinder = http.createServer();
  await new Promise((resolve) => portFinder.listen(0, '127.0.0.1', resolve));
  const port = portFinder.address().port;
  await new Promise((resolve) => portFinder.close(resolve));

  let output = '';
  const child = spawn(process.execPath, ['server/index.js'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      NODE_ENV: 'test',
      PORT: String(port),
      MONGODB_URI: memory.getUri(),
      MONGODB_DB: 'feed-routes',
      VOCECHAT_HOST: `http://127.0.0.1:${vocechat.address().port}`,
      VOCECHAT_BOT_API_KEY: 'bot-key',
      VOCECHAT_BOT_TARGET_GROUP_ID: '',
      MATRIX_BOT_ENABLED: 'false',
      APP_PUBLIC_URL: 'https://gnom.test',
      GITHUB_TOKEN: '',
      GITHUB_WEBHOOK_SECRET: '',
      HOME_ASSISTANT_URL: '',
      HOME_ASSISTANT_TOKEN: '',
      JELLYFIN_HOST: '',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.on('data', (chunk) => { output += chunk; });
  child.stderr.on('data', (chunk) => { output += chunk; });

  const streams = [];
  t.after(async () => {
    streams.forEach((stream) => stream.close());
    if (child.exitCode === null) {
      child.kill('SIGTERM');
      await new Promise((resolve) => child.once('exit', resolve));
    }
    vocechat.closeAllConnections();
    vocechat.close();
    await memory.stop();
  });

  const base = `http://127.0.0.1:${port}/app-api`;
  await waitFor(() => fetch(`${base}/health`).then((res) => res.ok).catch(() => false), `server boot\n${output}`, 60000);

  async function api(method, path, token, body) {
    const res = await fetch(base + path, {
      method,
      headers: { 'Content-Type': 'application/json', 'X-API-Key': token },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    return { status: res.status, body: text ? JSON.parse(text) : undefined, headers: res.headers };
  }
  function openStream(token) {
    const messages = [];
    const controller = new AbortController();
    (async () => {
      const res = await fetch(`${base}/feed/events?token=${token}`, { signal: controller.signal });
      const decoder = new TextDecoder();
      let buffer = '';
      for await (const chunk of res.body) {
        buffer += decoder.decode(chunk, { stream: true });
        let index;
        while ((index = buffer.indexOf('\n\n')) >= 0) {
          const block = buffer.slice(0, index);
          buffer = buffer.slice(index + 2);
          if (block.startsWith('data: ')) messages.push(JSON.parse(block.slice(6)));
        }
      }
    })().catch(() => {});
    const stream = { messages, close: () => controller.abort() };
    streams.push(stream);
    return stream;
  }

  // Every user must have called the API once to be known (and mentionable).
  for (const token of Object.keys(USERS)) assert.equal((await api('GET', '/me', token)).status, 200);
  const kari = openStream('t1');
  const ola = openStream('t2');
  const eva = openStream('t4');
  await pause(300);

  let post;
  await t.test('statusrapport mentions: stored, DM with a post link, and a notification', async () => {
    post = (await api('POST', '/statusrapport', 't2', { text: 'Hei @Kari Nordmann', mentions: [{ uid: 1 }, { uid: 3 }] })).body;
    assert.deepEqual(post.payload.mentions, [{ uid: 1, name: 'Kari Nordmann' }]);
    await waitFor(() => dms.some((dm) => dm.uid === 1), 'mention DM');
    assert.match(dms.find((dm) => dm.uid === 1).message, new RegExp(`https://gnom.test/innlegg/${post.id}`));
    await waitFor(async () => (await api('GET', '/notifications', 't1')).body.items.some((n) => n.type === 'mention'), 'mention notification');
  });

  let comment;
  await t.test('comments bump the post for related users only, pushed live to them', async () => {
    comment = (await api('POST', `/comment-threads/feed/${post.id}/comments`, 't3', { text: 'Gøy!' })).body;
    await waitFor(() => ola.messages.some((m) => m.__type === 'feed_bump'), 'feed_bump to Ola');
    await waitFor(() => kari.messages.some((m) => m.__type === 'feed_bump'), 'feed_bump to Kari');
    assert.equal(ola.messages.find((m) => m.__type === 'feed_bump').item.bump.reason, 'own_post');
    assert.equal(kari.messages.find((m) => m.__type === 'feed_bump').item.bump.reason, 'post_mention', 'mentioned in the post');
    await waitFor(() => eva.messages.some((m) => m.__type === 'comment_added'), 'everyone gets the comment itself');
    assert.equal(eva.messages.some((m) => m.__type === 'feed_bump' || m.__type === 'notification'), false, 'Eva is not related');

    const page = (await api('GET', '/feed', 't2')).body;
    assert.equal(page.items[0].id, post.id);
    assert.equal(page.items[0].bump.commentId, comment.id);
    assert.equal(page.items[0].comments.length, 1);
    const single = (await api('GET', `/feed/${post.id}`, 't2')).body;
    assert.equal(single.bump.reason, 'own_post');
    assert.equal((await api('GET', '/feed/does-not-exist', 't2')).status, 404);
  });

  await t.test('a post reaction notifies its author once (adding, not removing)', async () => {
    await api('POST', `/feed/${post.id}/reactions`, 't1', { emoji: '❤️' });
    await waitFor(async () => (await api('GET', '/notifications', 't2')).body.items.some((n) => n.type === 'reaction'), 'reaction notification');
    await api('POST', `/feed/${post.id}/reactions`, 't1', { emoji: '❤️' });
    await pause(300);
    assert.equal((await api('GET', '/notifications', 't2')).body.items.filter((n) => n.type === 'reaction').length, 1);
  });

  await t.test('comment images: token required, nosniff and immutable caching', async () => {
    const withImage = (await api('POST', `/comment-threads/feed/${post.id}/comments`, 't1', { imageDataUrl: PNG })).body;
    const ok = await fetch(`${base}/comment-images/${withImage.imageId}?token=t2`);
    assert.equal(ok.status, 200);
    assert.equal(ok.headers.get('content-type'), 'image/png');
    assert.equal(ok.headers.get('x-content-type-options'), 'nosniff');
    assert.match(ok.headers.get('cache-control'), /immutable/);
    assert.equal((await fetch(`${base}/comment-images/${withImage.imageId}`)).status, 401);
    assert.equal((await fetch(`${base}/comment-images/not-an-id?token=t2`)).status, 400);
  });

  let event;
  let eventPost;
  await t.test('publishing an event notifies everyone else', async () => {
    event = (await api('POST', '/community-events', 't1', { title: 'Grillfest', startsAt: new Date(Date.now() + 864e5).toISOString(), status: 'published' })).body;
    await waitFor(async () => (await api('GET', '/notifications', 't3')).body.items.some((n) => n.type === 'event'), 'event notification');
    assert.equal((await api('GET', '/notifications', 't1')).body.items.some((n) => n.type === 'event'), false, 'not to the creator');
    await waitFor(async () => (await api('GET', '/feed', 't3')).body.items.some((i) => i.type === 'community_event_created'), 'event post');
    eventPost = (await api('GET', '/feed', 't3')).body.items.find((i) => i.type === 'community_event_created');
  });

  await t.test('editing an event without sending comments keeps them; legacy array saves keep others\' comments', async () => {
    const mine = (await api('POST', `/comment-threads/event/${event.id}/comments`, 't1', { text: 'Velkommen' })).body;
    await api('POST', `/comment-threads/event/${event.id}/comments/${mine.id}/replies`, 't2', { text: 'Takk!' });
    const theirs = (await api('POST', `/comment-threads/event/${event.id}/comments`, 't3', { text: 'Gleder meg', imageDataUrl: PNG })).body;

    assert.equal((await api('PUT', `/community-events/${event.id}`, 't1', { title: 'Grillfest!' })).body.comments.length, 2);

    // A legacy client (the mobile app) sends an array without both comments and with a new one.
    await api('PUT', `/community-events/${event.id}`, 't1', { comments: [{ id: 'from-app', author: { uid: 99, name: 'Fake' }, text: 'Fra appen' }] });
    const comments = (await api('GET', `/community-events/${event.id}`, 't1')).body.comments;
    const byId = Object.fromEntries(comments.map((c) => [c.id, c]));
    assert.equal(byId[mine.id].deleted, true, 'own comment with a reply becomes a placeholder');
    assert.equal(byId[mine.id].replies.length, 1);
    assert.equal(byId[theirs.id].text, 'Gleder meg', "someone else's comment can't be removed");
    assert.equal(byId['from-app'].author.uid, 1, 'attributed to the caller');
    event.imageId = theirs.imageId;
  });

  await t.test('deleting an event removes its post, notifications and images, live', async () => {
    assert.equal((await api('DELETE', `/community-events/${event.id}`, 't1')).status, 204);
    await waitFor(() => kari.messages.some((m) => m.__type === 'feed_item_removed' && m.feedItemId === eventPost.id), 'feed_item_removed');
    assert.equal((await api('GET', `/feed/${eventPost.id}`, 't3')).status, 404);
    assert.equal((await api('GET', '/feed', 't3')).body.items.some((i) => i.id === eventPost.id), false);
    await waitFor(async () => !(await api('GET', '/notifications', 't3')).body.items.some((n) => n.type === 'event'), 'event notification removed');
    assert.equal((await fetch(`${base}/comment-images/${event.imageId}?token=t1`)).status, 404);
    assert.equal((await api('POST', `/comment-threads/feed/${eventPost.id}/comments`, 't3', { text: 'x' })).status, 404);
  });

  await t.test('meows travel on the shared feed stream (one connection per tab)', async () => {
    const before = eva.messages.length;
    assert.equal((await api('POST', '/meow', 't1', {})).status, 200);
    await waitFor(() => eva.messages.slice(before).some((m) => m.__type === 'meow'), 'meow on the feed stream');
  });

  await t.test('the server filters by type (bumps included), so a page is never empty for nothing', async () => {
    const client = new MongoClient(memory.getUri());
    await client.connect();
    const db = client.db('feed-routes');
    const now = Date.now();
    // 25 newer lamp posts: with filtering in the browser these would fill the whole first page.
    await db.collection('feed_items').insertMany(Array.from({ length: 25 }, (_, i) => ({
      id: `lamp-${i}`, type: 'lamp_toggled', source: 'internal', payload: { isOn: true }, createdAt: now + 1000 + i, actorUid: 3, actorName: 'Per Persen',
    })));

    assert.equal((await api('GET', '/feed?limit=20', 't2')).body.items[0].type, 'lamp_toggled', 'unfiltered, lamps come first');
    const filtered = (await api('GET', '/feed?limit=20&types=statusrapport_created', 't2')).body;
    assert.ok(filtered.items.length > 0, 'older visible posts are reached');
    assert.ok(filtered.items.every((item) => item.type === 'statusrapport_created'));

    // A bumped post of a hidden type doesn't take a place either, but leads when its type is shown.
    await db.collection('feed_bumps').insertOne({ uid: 2, feedItemId: 'lamp-0', bumpedAt: now + 99_999, reason: 'participant', byUid: 3, byName: 'Per Persen' });
    assert.ok((await api('GET', '/feed?types=statusrapport_created', 't2')).body.items.every((item) => item.type === 'statusrapport_created'));
    assert.equal((await api('GET', '/feed?types=lamp_toggled', 't2')).body.items[0].id, 'lamp-0');

    // Paging through one type: only that type, every post once.
    const seen = [];
    let before;
    for (let guard = 0; guard < 20; guard += 1) {
      const page = (await api('GET', `/feed?limit=4&types=lamp_toggled${before ? `&before=${before}` : ''}`, 't2')).body;
      seen.push(...page.items.map((item) => item.id));
      assert.ok(page.items.every((item) => item.type === 'lamp_toggled'));
      if (!page.hasMore) break;
      before = page.items.at(-1).sortAt;
    }
    assert.equal(seen.length, 25);
    assert.equal(new Set(seen).size, 25);

    assert.deepEqual((await api('GET', '/feed?types=', 't2')).body, { items: [], hasMore: false }, 'everything filtered away');
    await client.close();
  });
});
