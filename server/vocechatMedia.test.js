import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import express from 'express';
import { MongoClient } from 'mongodb';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { COLLECTIONS } from './mongo.js';
import {
  createVoceChatMediaService,
  fileKind,
  registerVoceChatMediaFileRoutes,
  registerVoceChatMediaRoutes,
} from './vocechatMedia.js';

const FILES = [
  { mid: 1, from_uid: 1, gid: 1, ext: 'jpg', content_type: 'image/jpeg', content: '2024/1/1/aaa', properties: '{"name":"hytta.jpg","size":5}', created_at: 1000, expired: false },
  { mid: 2, from_uid: 2, gid: 2, ext: 'png', content_type: 'image/png', content: '2024/1/2/bbb', properties: '{"name":"hemmelig.png"}', created_at: 2000, expired: false },
  { mid: 3, from_uid: 1, gid: -1, ext: 'jpg', content_type: 'image/jpeg', content: '2024/1/3/dm', properties: '{}', created_at: 3000, expired: false },
  { mid: 4, from_uid: 1, gid: 1, ext: 'jpg', content_type: 'image/jpeg', content: '2024/1/4/gone', properties: '{}', created_at: 4000, expired: true },
  { mid: 5, from_uid: 3, gid: 1, ext: 'pdf', content_type: 'application/pdf', content: '2024/1/5/ccc', properties: '{"name":"referat.pdf"}', created_at: 5000, expired: false },
  { mid: 6, from_uid: 3, gid: 1, ext: 'html', content_type: 'text/html', content: '2024/1/6/ddd', properties: '{"name":"side.html"}', created_at: 6000, expired: false },
  { mid: 7, from_uid: 3, gid: 1, ext: 'mp4', content_type: 'video/mp4', content: '2024/1/7/missing', properties: '{}', created_at: 7000, expired: false },
];
const BODIES = {
  '2024/1/1/aaa': 'JPEGDATA', '2024/1/2/bbb': 'PNGDATA', '2024/1/5/ccc': '%PDF-1.4', '2024/1/6/ddd': '<script>alert(1)</script>',
};

test('fileKind buckets like the archive filters', () => {
  assert.equal(fileKind('image/jpeg', ''), 'image');
  assert.equal(fileKind('', 'MOV'), 'video');
  assert.equal(fileKind('application/pdf', ''), 'pdf');
  assert.equal(fileKind('text/plain', ''), 'doc');
  assert.equal(fileKind('application/zip', 'zip'), 'file');
});

test('VoceChat media copy', { timeout: 60000 }, async (t) => {
  const memory = await MongoMemoryServer.create();
  const mongo = await MongoClient.connect(memory.getUri());
  const dir = mkdtempSync(path.join(tmpdir(), 'vc-media-'));
  t.after(async () => { await mongo.close(); await memory.stop(); rmSync(dir, { recursive: true, force: true }); });
  const db = mongo.db('media');
  await db.collection(COLLECTIONS.vocechatMedia).createIndex({ filePath: 1 }, { unique: true });

  let clock = Date.UTC(2026, 10, 1);
  let vocechatToken = 'vc-ok';
  const requests = [];
  const fetchImpl = async (url) => {
    const u = new URL(url);
    requests.push(u.pathname + u.search);
    if (u.pathname === '/api/group') {
      return Response.json([{ gid: 1, name: 'Generelt', is_public: true, members: [] }, { gid: 2, name: 'Hemmelig', is_public: false, members: [1, 2] }]);
    }
    if (u.pathname === '/api/admin/system/files') {
      if (vocechatToken !== 'vc-ok') return new Response('{}', { status: 401 });
      return Response.json(u.searchParams.has('page') ? [] : FILES);
    }
    if (u.pathname === '/api/resource/file') {
      const body = BODIES[u.searchParams.get('file_path')];
      if (!body) return new Response('nope', { status: 404 });
      return new Response(u.searchParams.get('thumbnail') ? `THUMB:${body}` : body);
    }
    return new Response('{}', { status: 404 });
  };
  const service = createVoceChatMediaService({
    getDatabase: async () => db,
    vocechatHost: 'http://vocechat.test',
    mediaDir: dir,
    fetchImpl,
    now: () => clock,
    log: {},
  });

  await t.test('a sync copies channel files only, with thumbnails, and marks the ones VoceChat lost', async () => {
    assert.equal(service.requestSync(vocechatToken).started, true);
    await service.idle();
    const items = await db.collection(COLLECTIONS.vocechatMedia).find().sort({ mid: 1 }).toArray();
    assert.deepEqual(items.map((i) => i.mid), [1, 2, 5, 6, 7], 'no DM (gid -1) or expired files');
    const byMid = Object.fromEntries(items.map((i) => [i.mid, i]));
    assert.deepEqual(items.map((i) => i.status), ['stored', 'stored', 'stored', 'stored', 'missing']);
    assert.equal(readFileSync(path.join(dir, byMid[1].id), 'utf8'), 'JPEGDATA');
    assert.equal(readFileSync(path.join(dir, byMid[1].thumbnailFile), 'utf8'), 'THUMB:JPEGDATA');
    assert.equal(byMid[5].thumbnailFile, null, 'only images get thumbnails');
    assert.equal(byMid[1].name, 'hytta.jpg');
    assert.ok(!existsSync(path.join(dir, `${byMid[1].id}.part`)));
  });

  await t.test('syncs are throttled to every 10 minutes unless forced; files are not fetched twice', async () => {
    assert.equal(service.requestSync(vocechatToken).started, false);
    requests.length = 0;
    assert.equal(service.requestSync(vocechatToken, { force: true }).started, true);
    await service.idle();
    assert.ok(!requests.some((r) => r.startsWith('/api/resource/file')), 'nothing new to download');
    clock += 11 * 60_000;
    assert.equal(service.requestSync(vocechatToken).started, true);
    await service.idle();
  });

  await t.test('an expired VoceChat token is reported and lets the next person try at once', async () => {
    vocechatToken = 'expired';
    clock += 11 * 60_000;
    service.requestSync(vocechatToken);
    await service.idle();
    const status = await service.status();
    assert.match(status.lastSyncError, /utløpt/);
    assert.equal(service.requestSync('vc-ok').started, true);
    await service.idle();
    vocechatToken = 'vc-ok';
  });

  await t.test('private channels are only listed for their members and admins', async () => {
    const outsider = { uid: 3, isAdmin: false };
    const member = { uid: 2, isAdmin: false };
    const admin = { uid: 9, isAdmin: true };
    assert.deepEqual((await service.list(outsider)).map((i) => i.mid), [6, 5, 1]);
    assert.deepEqual((await service.list(member)).map((i) => i.mid), [6, 5, 2, 1]);
    assert.deepEqual((await service.list(admin, { kind: 'image' })).map((i) => i.mid), [2, 1]);
    assert.deepEqual((await service.list(member, { gid: 1, kind: 'pdf' })).map((i) => i.name), ['referat.pdf']);
    assert.deepEqual((await service.visibleGroups(outsider)).map((g) => g.name), ['Generelt']);
    const status = await service.status();
    assert.deepEqual([status.stored, status.pending, status.missing], [4, 0, 1]);
  });

  await t.test('routes: token required, privacy respected, risky types downloaded, ranges supported', async () => {
    const users = { 'tok-outsider': { uid: 3, isAdmin: false }, 'tok-member': { uid: 2, isAdmin: false } };
    const app = express();
    const api = express.Router();
    registerVoceChatMediaFileRoutes(api, service, {
      resolveUser: async (token) => {
        if (users[token]) return users[token];
        const error = new Error('no');
        error.name = 'UnauthorizedError';
        throw error;
      },
    });
    api.use((req, res, next) => { req.currentUser = users[req.get('X-API-Key')]; if (!req.currentUser) { res.sendStatus(401); return; } next(); });
    registerVoceChatMediaRoutes(api, service);
    app.use(api);
    const server = app.listen(0);
    t.after(() => server.close());
    const base = `http://127.0.0.1:${server.address().port}`;
    const ids = Object.fromEntries((await db.collection(COLLECTIONS.vocechatMedia).find().toArray()).map((i) => [i.mid, i.id]));

    assert.equal((await fetch(`${base}/vocechat-media/${ids[1]}/file`)).status, 401);
    const image = await fetch(`${base}/vocechat-media/${ids[1]}/file?token=tok-outsider`);
    assert.equal(image.status, 200);
    assert.equal(image.headers.get('content-type'), 'image/jpeg');
    assert.equal(image.headers.get('x-content-type-options'), 'nosniff');
    assert.match(image.headers.get('content-security-policy'), /sandbox/);
    assert.equal(await image.text(), 'JPEGDATA');
    assert.equal(await (await fetch(`${base}/vocechat-media/${ids[1]}/thumbnail?token=tok-outsider`)).text(), 'THUMB:JPEGDATA');

    assert.equal((await fetch(`${base}/vocechat-media/${ids[2]}/file?token=tok-outsider`)).status, 404, 'private channel');
    assert.equal((await fetch(`${base}/vocechat-media/${ids[2]}/file?token=tok-member`)).status, 200);

    const html = await fetch(`${base}/vocechat-media/${ids[6]}/file?token=tok-member`);
    assert.equal(html.headers.get('content-type'), 'application/octet-stream');
    assert.match(html.headers.get('content-disposition'), /attachment; filename="side.html"/);

    const part = await fetch(`${base}/vocechat-media/${ids[1]}/file?token=tok-member`, { headers: { Range: 'bytes=2-4' } });
    assert.equal(part.status, 206);
    assert.equal(await part.text(), 'EGD');

    const listing = await fetch(`${base}/vocechat-media?kind=image`, { headers: { 'X-API-Key': 'tok-outsider' } });
    assert.deepEqual((await listing.json()).map((i) => [i.mid, i.groupName, i.stored]), [[1, 'Generelt', true]]);

    // Not copied yet: redirect to VoceChat's public link for now.
    await db.collection(COLLECTIONS.vocechatMedia).updateOne({ mid: 5 }, { $set: { status: 'pending' } });
    const pending = await fetch(`${base}/vocechat-media/${ids[5]}/file?token=tok-member`, { redirect: 'manual' });
    assert.equal(pending.status, 302);
    assert.equal(pending.headers.get('location'), 'http://vocechat.test/api/resource/file?file_path=2024%2F1%2F5%2Fccc');
    await service.idle();
  });
});
