import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { MongoClient } from 'mongodb';

const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function waitFor(check, description, timeout = 30000) {
  const until = Date.now() + timeout;
  while (Date.now() < until) { if (await check()) return; await pause(100); }
  throw new Error(`Timed out: ${description}`);
}
test('arrangement API sends new Matrix notices and preserves the existing VoceChat bot', { timeout: 120000 }, async t => {
  const memory = await MongoMemoryServer.create({ instance: { launchTimeout: 60000 } }); const mongo = new MongoClient(memory.getUri()); await mongo.connect(); const db = mongo.db('matrix-routes');
  const storageDir = await mkdtemp(path.join(tmpdir(), 'gnom-matrix-routes-')); const notices = [], legacy = []; const uid = '@gnomen:localhost'; let sync = 0; let child; let output = '';
  const fake = http.createServer(async (req, res) => {
    const route = decodeURIComponent(new URL(req.url, 'http://localhost').pathname); let raw = ''; for await (const chunk of req) raw += chunk;
    let body = {}; let status = 200;
    if (route === '/api/user/me') body = { uid: 1, name: 'Gnomen', is_admin: true };
    else if (route.startsWith('/api/bot/send_to_group/')) { legacy.push(raw); body = { mid: legacy.length }; }
    else if (route === '/api/group') body = [];
    else if (route === '/api/user/events') { res.writeHead(200, { 'Content-Type': 'text/event-stream' }); res.write(': test stream\n\n'); return; }
    else if (route.endsWith('/login')) body = { access_token: 'route-local-token', user_id: uid, device_id: 'BOT-ROUTES' };
    else if (route.endsWith('/whoami')) body = { user_id: uid, device_id: 'BOT-ROUTES' };
    else if (route.includes('/directory/room/')) body = { room_id: '!notices:localhost', servers: ['localhost'] };
    else if (route.endsWith('/joined_rooms')) body = { joined_rooms: ['!notices:localhost'] };
    else if (route.includes('/state/m.room.create')) body = { creator: uid, room_version: '10' };
    else if (route.includes('/state/m.room.encryption') || route.includes('/account_data/')) { status = 404; body = { errcode: 'M_NOT_FOUND' }; }
    else if (route.endsWith('/keys/upload')) body = { one_time_key_counts: { signed_curve25519: 50 } };
    else if (route.endsWith('/keys/query')) body = { device_keys: {}, failures: {} };
    else if (route.endsWith('/sync')) { await pause(100); body = { next_batch: String(++sync), rooms: { join: {} }, to_device: { events: [] }, device_lists: { changed: [], left: [] }, device_one_time_keys_count: { signed_curve25519: 50 } }; }
    else if (route.endsWith('/filter')) body = { filter_id: '0' };
    else if (route.includes('/send/')) { notices.push(JSON.parse(raw)); body = { event_id: '$route'+notices.length }; }
    res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body));
  });
  fake.listen(0, '127.0.0.1'); await new Promise(resolve => fake.once('listening', resolve)); const matrixUrl = `http://127.0.0.1:${fake.address().port}`;
  const portFinder = http.createServer(); portFinder.listen(0, '127.0.0.1'); await new Promise(resolve => portFinder.once('listening', resolve)); const port = portFinder.address().port; await new Promise(resolve => portFinder.close(resolve));
  t.after(async () => { if (child && child.exitCode === null) { child.kill('SIGTERM'); await new Promise(resolve => child.once('exit', resolve)); } fake.closeAllConnections(); await new Promise(resolve => fake.close(resolve)); await mongo.close(); await memory.stop(); const resolved = path.resolve(storageDir); assert(resolved.startsWith(path.resolve(tmpdir())+path.sep)&&path.basename(resolved).startsWith('gnom-matrix-')); await rm(resolved, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }); });
  child = spawn(process.execPath, ['server/index.js'], { cwd: process.cwd(), windowsHide: true, env: { ...process.env, NODE_ENV: 'test', PORT: String(port), MONGODB_URI: memory.getUri(), MONGODB_DB: 'matrix-routes', VOCECHAT_HOST: matrixUrl, VOCECHAT_BOT_API_KEY: 'legacy-local-key', VOCECHAT_BOT_TARGET_GROUP_ID: '1', MATRIX_BOT_ENABLED: 'true', MATRIX_BOT_HOMESERVER_URL: matrixUrl, MATRIX_BOT_USERNAME: uid, MATRIX_BOT_PASSWORD: 'route-local-password', MATRIX_BOT_ACCESS_TOKEN: '', MATRIX_BOT_TARGET_ROOM_ID: '', MATRIX_BOT_TARGET_ROOM_ALIAS: '#kosegjengen:localhost', MATRIX_BOT_STORAGE_DIR: storageDir, APP_PUBLIC_URL: 'https://gnomguttan.no', GITHUB_TOKEN: '', GITHUB_WEBHOOK_SECRET: '', HOME_ASSISTANT_TOKEN: '', VALHEIM_SERVER_ADDRESS: '' }, stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout.on('data', data => { output += data; }); child.stderr.on('data', data => { output += data; });
  await waitFor(()=>output.includes('[server] listening'), 'server startup'); const base = `http://127.0.0.1:${port}`;
  const request = async (method, route, data) => { const response = await fetch(base+'/app-api'+route, { method, headers: { 'X-API-Key': 'local-user-token', 'Content-Type': 'application/json' }, ...(data ? { body: JSON.stringify(data) } : {}) }); assert(response.ok, await response.clone().text()); return response.status === 204 ? null : response.json(); };
  const runtime = await (await fetch(base+'/env.js')).text(); assert(!runtime.includes('route-local-password')); assert(!runtime.includes('route-local-token')); assert(!runtime.includes('MATRIX_BOT_PASSWORD'));
  const draft = await request('POST', '/community-events', { id: 'bot-event', title: 'Testtur', status: 'draft', startsAt: '2099-10-10T16:00:00Z' }); await pause(300); assert.equal(notices.length, 0); assert.equal(legacy.length, 0);
  let published = await request('PUT', '/community-events/'+draft.id, { status: 'published' }); await waitFor(()=>notices.length===1 && legacy.length===1, 'both publication bots'); assert.match(legacy[0], /Testtur ble opprettet/); assert.equal(notices[0].msgtype, 'm.notice'); assert.match(notices[0].body, /arrangementer\/bot-event/);
  published = await request('PUT', '/community-events/'+draft.id, { location: 'Bymarka', comments: [{ id: 'comment-1', text: 'Ta med kaffe!', author: { uid: 1, name: 'Gnomen' }, createdAt: Date.now() }] }); await waitFor(()=>notices.length===2, 'discussion and detail update'); assert.match(notices[1].body, /Endret sted/); assert.match(notices[1].body, /Nytt innlegg/); assert.equal(legacy.length, 1);
  await request('PUT', '/community-events/'+draft.id, { title: published.title, comments: published.comments }); await pause(300); assert.equal(notices.length, 2);
  await request('POST', '/community-events/'+draft.id+'/respond', { status: 'coming' }); await waitFor(()=>notices.length===3, 'RSVP update'); assert.match(notices[2].body, /Gnomen kommer/);
  await request('POST', '/community-events/'+draft.id+'/respond', { status: 'coming' }); await pause(300); assert.equal(notices.length, 3);
  await request('DELETE', '/community-events/'+draft.id); await waitFor(()=>notices.length===4, 'event deletion'); assert.match(notices[3].body, /er slettet/); assert.equal(legacy.length, 1);
  assert.equal(await db.collection('matrix_bot_outbox').countDocuments({ state: 'pending' }), 0); assert(!output.includes('route-local-password')); assert(!output.includes('route-local-token'));
});
