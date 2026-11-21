import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MongoClient } from 'mongodb';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { AuthError, createAuthService, hashToken, isSessionToken } from './auth.js';
import { COLLECTIONS } from './mongo.js';
import { hashPassword, passwordProblem, verifyPassword } from './passwords.js';
import { createRateLimiter } from './rateLimit.js';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

test('passwords: scrypt hashes verify, never contain the password, and differ per salt', async () => {
  const a = await hashPassword('hemmelig-passord');
  const b = await hashPassword('hemmelig-passord');
  assert.match(a, /^scrypt\$32768\$8\$1\$/);
  assert.ok(!a.includes('hemmelig'));
  assert.notEqual(a, b);
  assert.equal(await verifyPassword('hemmelig-passord', a), true);
  assert.equal(await verifyPassword('hemmelig-passorD', a), false);
  assert.equal(await verifyPassword('hemmelig-passord', 'plaintext'), false);
  // The same word typed with a decomposed "ø" still matches.
  const nordic = await hashPassword('blåbærsyltetøy');
  assert.equal(await verifyPassword('blåbærsyltetøy'.normalize('NFD'), nordic), true);
});

test('passwordProblem rejects short, common and personal passwords', () => {
  assert.match(passwordProblem('kort'), /minst 8/);
  assert.match(passwordProblem('passord123'), /lett å gjette/);
  assert.match(passwordProblem('aaaaaaaaaa'), /lett å gjette/);
  assert.match(passwordProblem('kari@test.no', { email: 'kari@test.no' }), /e-post/);
  assert.match(passwordProblem('kari.nordmann', { email: 'kari.nordmann@test.no' }), /e-post/);
  assert.match(passwordProblem('Kari Nordmann', { name: 'kari nordmann' }), /navnet/);
  assert.equal(passwordProblem('en lang og grei setning'), null);
});

test('rate limiter blocks after max hits and opens when the window passes', () => {
  let t = 0;
  const limiter = createRateLimiter({ windowMs: 1000, max: 2, now: () => t });
  limiter.hit('a');
  assert.equal(limiter.blockedFor('a'), 0);
  limiter.hit('a');
  assert.equal(limiter.blockedFor('a'), 1000);
  assert.equal(limiter.blockedFor('b'), 0);
  t = 1000;
  assert.equal(limiter.blockedFor('a'), 0);
  limiter.hit('a');
  limiter.reset('a');
  assert.equal(limiter.blockedFor('a'), 0);
});

test('auth service', { timeout: 120000 }, async (t) => {
  const memory = await MongoMemoryServer.create();
  const mongo = await MongoClient.connect(memory.getUri());
  t.after(async () => { await mongo.close(); await memory.stop(); });

  let dbIndex = 0;
  let clock = Date.UTC(2026, 10, 1);
  const vocechatUsers = [
    { uid: 1, name: 'Kari Nordmann', email: 'Kari@Test.no', password: 'vocechat-passord', is_admin: true },
    { uid: 2, name: 'Ola Hansen', email: 'ola@test.no', password: 'olas-gamle-passord' },
  ];

  async function setup({ cutoff = null, vocechatDown = false } = {}) {
    const db = mongo.db(`auth-${dbIndex++}`);
    await db.collection(COLLECTIONS.accounts).createIndex({ email: 1 }, { unique: true });
    await db.collection(COLLECTIONS.accounts).createIndex({ uid: 1 }, { unique: true });
    await db.collection(COLLECTIONS.sessions).createIndex({ tokenHash: 1 }, { unique: true });
    const calls = [];
    const fetchImpl = async (url, init = {}) => {
      const route = new URL(url).pathname;
      const body = init.body ? JSON.parse(init.body) : null;
      calls.push({ route, body, key: init.headers?.['X-API-Key'] });
      if (vocechatDown) throw new Error('ECONNREFUSED');
      const json = (status, payload) => new Response(JSON.stringify(payload), { status, headers: { 'Content-Type': 'application/json' } });
      if (route === '/api/token/login') {
        const user = vocechatUsers.find((u) => u.email.toLowerCase() === body.credential.email);
        if (!user) return json(404, {});
        if (user.password !== body.credential.password) return json(401, {});
        const { password: _password, ...info } = user;
        return json(200, { token: `vc-${user.uid}`, refresh_token: 'r', expired_in: 300, user: { ...info, avatar_updated_at: 7 } });
      }
      if (route === '/api/user/change_password') return json(200, {});
      return json(200, {});
    };
    const auth = createAuthService({
      getDatabase: async () => db,
      vocechatHost: 'http://vocechat.test',
      vocechatCutoff: cutoff,
      publicUrl: 'https://gnom.test',
      fetchImpl,
      now: () => clock,
    });
    return { db, auth, calls };
  }

  const loginAs = (auth, email, password, extra = {}) => auth.login({ email, password, ip: '10.0.0.1', userAgent: 'test', ...extra });
  const rejects = (promise, status) => assert.rejects(promise, (error) => error instanceof AuthError && error.status === status);

  await t.test('first login checks VoceChat once, stores our own hash, and gives a working session', async () => {
    const { db, auth, calls } = await setup();
    const result = await loginAs(auth, ' KARI@test.no ', 'vocechat-passord');
    assert.ok(isSessionToken(result.token));
    // The picture date is ours (pictures are copied separately), not VoceChat's.
    assert.deepEqual(result.user, { uid: 1, name: 'Kari Nordmann', email: 'kari@test.no', avatarUpdatedAt: 0, isAdmin: true });
    assert.equal(result.vocechatLegacy, true);

    const account = await db.collection(COLLECTIONS.accounts).findOne({ uid: 1 });
    assert.equal(account.source, 'vocechat-login');
    assert.ok(!JSON.stringify(account).includes('vocechat-passord'));
    assert.equal(await verifyPassword('vocechat-passord', account.passwordHash), true);
    assert.ok(calls.some((c) => c.route === '/api/token/logout' && c.key === 'vc-1'), 'the VoceChat session it opened is closed again');

    const session = await db.collection(COLLECTIONS.sessions).findOne({ uid: 1 });
    assert.equal(session.tokenHash, hashToken(result.token));
    assert.ok(!JSON.stringify(session).includes(result.token), 'only the hash of the token is stored');
    assert.equal((await auth.resolveSession(result.token)).user.uid, 1);

    calls.length = 0;
    await loginAs(auth, 'kari@test.no', 'vocechat-passord');
    assert.equal(calls.length, 0, 'VoceChat is not asked again');
    await rejects(loginAs(auth, 'kari@test.no', 'feil-passord'), 401);
    assert.equal(calls.length, 0);
  });

  await t.test('wrong VoceChat passwords and unknown emails are refused; VoceChat being down is a 503', async () => {
    const { db, auth } = await setup();
    await rejects(loginAs(auth, 'ola@test.no', 'feil'), 401);
    await rejects(loginAs(auth, 'ukjent@test.no', 'hva-som-helst'), 401);
    await rejects(loginAs(auth, 'ola@test.no', 'x'.repeat(2000)), 401);
    assert.equal(await db.collection(COLLECTIONS.accounts).countDocuments(), 0);
    const down = await setup({ vocechatDown: true });
    await rejects(loginAs(down.auth, 'ola@test.no', 'olas-gamle-passord'), 503);
  });

  await t.test('after the cutoff VoceChat is never asked, but migrated accounts still log in', async () => {
    const { auth, calls } = await setup({ cutoff: clock + DAY });
    await loginAs(auth, 'kari@test.no', 'vocechat-passord');
    clock += 2 * DAY;
    calls.length = 0;
    await rejects(loginAs(auth, 'ola@test.no', 'olas-gamle-passord'), 401);
    assert.equal(calls.length, 0);
    assert.equal(auth.vocechatLegacyActive(), false);
    const again = await loginAs(auth, 'kari@test.no', 'vocechat-passord');
    assert.equal(again.vocechatLegacy, false);
  });

  await t.test('too many wrong passwords lock that email for a while; a right one resets the count', async () => {
    const { auth } = await setup();
    await loginAs(auth, 'kari@test.no', 'vocechat-passord');
    for (let i = 0; i < 7; i++) await rejects(loginAs(auth, 'kari@test.no', `feil-${i}`), 401);
    await loginAs(auth, 'kari@test.no', 'vocechat-passord');
    for (let i = 0; i < 8; i++) await rejects(loginAs(auth, 'kari@test.no', `feil-${i}`), 401);
    await assert.rejects(loginAs(auth, 'kari@test.no', 'vocechat-passord'), (e) => e.status === 429 && e.retryAfterMs > 0);
    clock += 16 * MINUTE;
    await loginAs(auth, 'kari@test.no', 'vocechat-passord');
  });

  await t.test('sessions: "Husk meg" lasts 30 days from last use, otherwise 12 hours; both can be revoked', async () => {
    const { auth } = await setup();
    const browser = await loginAs(auth, 'kari@test.no', 'vocechat-passord');
    const remembered = await loginAs(auth, 'kari@test.no', 'vocechat-passord', { remember: true });
    assert.equal(browser.remember, false);
    assert.equal(browser.expiresAt, clock + 12 * HOUR);
    assert.equal(remembered.expiresAt, clock + 30 * DAY);

    clock += 11 * HOUR;
    assert.ok(await auth.resolveSession(browser.token), 'used within 12 hours, so it slides forward');
    clock += 11 * HOUR;
    assert.ok(await auth.resolveSession(browser.token));
    clock += 13 * HOUR;
    assert.equal(await auth.resolveSession(browser.token), null, 'idle for 13 hours');

    assert.ok(await auth.resolveSession(remembered.token));
    const list = await auth.listSessions(1, (await auth.resolveSession(remembered.token)).sessionId);
    assert.equal(list.length, 1);
    assert.equal(list[0].current, true);

    await auth.revokeSessions({ uid: 1 });
    assert.equal(await auth.resolveSession(remembered.token), null, 'revoking beats the short cache');
  });

  await t.test('a remembered session still ends after 180 days, however active', async () => {
    const { auth } = await setup();
    const session = await loginAs(auth, 'kari@test.no', 'vocechat-passord', { remember: true });
    for (let day = 0; day < 179; day += 20) {
      clock += 20 * DAY;
      if (day + 20 < 180) assert.ok(await auth.resolveSession(session.token), `day ${day + 20}`);
    }
    clock += 2 * DAY;
    assert.equal(await auth.resolveSession(session.token), null);
  });

  await t.test('changing password needs the old one, logs out other devices and updates VoceChat', async () => {
    const { db, auth, calls } = await setup();
    const here = await loginAs(auth, 'ola@test.no', 'olas-gamle-passord');
    const elsewhere = await loginAs(auth, 'ola@test.no', 'olas-gamle-passord', { remember: true });
    const { sessionId } = await auth.resolveSession(here.token);

    await rejects(auth.changePassword({ uid: 2, sessionId, currentPassword: 'feil', newPassword: 'et nytt passord' }), 403);
    await rejects(auth.changePassword({ uid: 2, sessionId, currentPassword: 'olas-gamle-passord', newPassword: 'kort' }), 400);
    const result = await auth.changePassword({ uid: 2, sessionId, currentPassword: 'olas-gamle-passord', newPassword: 'et nytt passord' });
    assert.deepEqual(result, { signedOut: 1, vocechatSynced: true });
    assert.deepEqual(calls.find((c) => c.route === '/api/user/change_password').body, { old_password: 'olas-gamle-passord', new_password: 'et nytt passord' });

    assert.ok(await auth.resolveSession(here.token));
    assert.equal(await auth.resolveSession(elsewhere.token), null);
    await rejects(loginAs(auth, 'ola@test.no', 'olas-gamle-passord'), 401);
    await loginAs(auth, 'ola@test.no', 'et nytt passord');
    assert.equal(await db.collection(COLLECTIONS.accounts).countDocuments({ uid: 2 }), 1);
  });

  await t.test('invites: single use, new uids from 100000, unique names and emails', async () => {
    const { db, auth } = await setup();
    await db.collection(COLLECTIONS.users).insertOne({ uid: 2, name: 'Ola Hansen', email: 'ola@test.no' });
    const admin = { uid: 1, name: 'Kari Nordmann' };
    const invite = await auth.createLink('invite', { createdBy: admin, note: 'Til Per' });
    assert.match(invite.url, /^https:\/\/gnom\.test\/registrer#gni_[\w-]{40,}$/);
    const token = invite.url.split('#')[1];
    assert.deepEqual(await auth.checkInvite({ token, ip: 'x' }), { expiresAt: invite.expiresAt, invitedBy: 'Kari Nordmann' });
    assert.equal((await auth.listInvites()).length, 1);

    const base = { token, email: 'per@test.no', password: 'pers eget passord', ip: 'x', userAgent: 'test' };
    await rejects(auth.register({ ...base, name: 'ola hansen' }), 409);
    await rejects(auth.register({ ...base, name: 'Per', email: 'OLA@test.no' }), 409);
    await rejects(auth.register({ ...base, name: '@Per' }), 400);
    await rejects(auth.register({ ...base, name: 'Per', password: 'passord123' }), 400);

    const per = await auth.register({ ...base, name: '  Per   Persen ', remember: true });
    assert.equal(per.user.uid, 100000);
    assert.equal(per.user.name, 'Per Persen');
    assert.equal(per.remember, true);
    assert.equal((await db.collection(COLLECTIONS.accounts).findOne({ uid: 100000 })).invitedBy, 1);
    await rejects(auth.register({ ...base, name: 'Eva', email: 'eva@test.no' }), 404);
    assert.equal((await auth.listInvites()).length, 0);

    const second = await auth.createLink('invite', { createdBy: admin });
    const eva = await auth.register({ ...base, token: second.url.split('#')[1], name: 'Eva', email: 'eva@test.no' });
    assert.equal(eva.user.uid, 100001);

    const stale = await auth.createLink('invite', { createdBy: admin });
    clock += 8 * DAY;
    await rejects(auth.checkInvite({ token: stale.url.split('#')[1], ip: 'x' }), 404);
  });

  await t.test('reset links: work for people not migrated yet, replace older links and log out everywhere', async () => {
    const { db, auth } = await setup();
    await db.collection(COLLECTIONS.users).insertOne({ uid: 2, name: 'Ola Hansen', email: 'ola@test.no' });
    const admin = { uid: 1, name: 'Kari Nordmann' };
    const first = await auth.createLink('reset', { uid: 2, createdBy: admin });
    const second = await auth.createLink('reset', { uid: 2, createdBy: admin });
    await rejects(auth.checkReset({ token: first.url.split('#')[1], ip: 'x' }), 404);
    const token = second.url.split('#')[1];
    assert.equal((await auth.checkReset({ token, ip: 'x' })).name, 'Ola Hansen');

    const result = await auth.resetPassword({ token, password: 'helt nytt passord', ip: 'x', userAgent: 't' });
    assert.equal(result.user.uid, 2);
    assert.equal((await db.collection(COLLECTIONS.accounts).findOne({ uid: 2 })).source, 'reset');
    await rejects(auth.resetPassword({ token, password: 'helt nytt passord', ip: 'x', userAgent: 't' }), 404);

    const other = await loginAs(auth, 'ola@test.no', 'helt nytt passord');
    const again = await auth.createLink('reset', { uid: 2, createdBy: admin });
    await auth.resetPassword({ token: again.url.split('#')[1], password: 'enda et passord', ip: 'x', userAgent: 't' });
    assert.equal(await auth.resolveSession(other.token), null, 'old sessions are gone after a reset');
  });

  await t.test('disabled users can neither log in nor keep using a session', async () => {
    const { db, auth } = await setup();
    const session = await loginAs(auth, 'kari@test.no', 'vocechat-passord');
    await db.collection(COLLECTIONS.users).updateOne({ uid: 1 }, { $set: { disabled: true } });
    clock += 20_000; // past the 10 s cache
    assert.equal(await auth.resolveSession(session.token), null);
    await rejects(loginAs(auth, 'kari@test.no', 'vocechat-passord'), 403);
  });
});

test('importing from VoceChat\'s database hashes the passwords and leaves moved accounts alone', { timeout: 60000 }, async (t) => {
  const { DatabaseSync } = await import('node:sqlite');
  const { mkdtempSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const path = await import('node:path');
  const { importVoceChatAccounts } = await import('./vocechatImport.js');

  const dir = mkdtempSync(path.join(tmpdir(), 'vocechat-'));
  const sqlitePath = path.join(dir, 'db.sqlite');
  const sqlite = new DatabaseSync(sqlitePath);
  sqlite.exec(`create table user (uid integer primary key, name text, password text, email text, is_admin boolean,
    avatar_updated_at timestamp, is_bot boolean default false, is_guest boolean default false)`);
  const insert = sqlite.prepare('insert into user (uid, name, password, email, is_admin, avatar_updated_at, is_bot) values (?, ?, ?, ?, ?, ?, ?)');
  insert.run(1, 'Kari Nordmann', 'plain-kari', 'Kari@Test.no', 1, '2024-05-01 12:00:00', 0);
  insert.run(2, 'Ola Hansen', 'plain-ola', 'ola@test.no', 0, '1970-01-01 00:00:00', 0);
  insert.run(3, 'Google-Per', null, 'per@test.no', 0, '1970-01-01 00:00:00', 0);
  insert.run(4, 'Botten', 'x', 'bot@test.no', 0, '1970-01-01 00:00:00', 1);
  insert.run(5, 'Dobbel', 'plain-5', 'eva@test.no', 0, '1970-01-01 00:00:00', 0);
  sqlite.close();

  const memory = await MongoMemoryServer.create();
  const mongo = await MongoClient.connect(memory.getUri());
  t.after(async () => { await mongo.close(); await memory.stop(); rmSync(dir, { recursive: true, force: true }); });
  const db = mongo.db('import');
  const getDatabase = async () => db;
  // Ola already moved by logging in and chose a new password; Eva's email belongs to another account.
  await db.collection(COLLECTIONS.accounts).insertMany([
    { uid: 2, email: 'ola@test.no', passwordHash: await hashPassword('olas nye passord') },
    { uid: 100000, email: 'eva@test.no', passwordHash: 'x' },
  ]);

  const dry = await importVoceChatAccounts({ sqlitePath, getDatabase, dryRun: true });
  assert.deepEqual(dry.imported.map((u) => u.uid), [1]);
  assert.equal(await db.collection(COLLECTIONS.accounts).countDocuments({ uid: 1 }), 0, 'a dry run writes nothing');

  const report = await importVoceChatAccounts({ sqlitePath, getDatabase });
  assert.deepEqual(report.imported.map((u) => u.uid), [1]);
  assert.equal(report.alreadyMoved, 1);
  assert.deepEqual(report.skipped.map((s) => s.uid), [3, 4]);
  assert.deepEqual(report.conflicts.map((c) => c.uid), [5]);

  const kari = await db.collection(COLLECTIONS.accounts).findOne({ uid: 1 });
  assert.equal(kari.source, 'vocechat-import');
  assert.equal(kari.email, 'kari@test.no');
  assert.ok(!JSON.stringify(kari).includes('plain-kari'));
  assert.equal(await verifyPassword('plain-kari', kari.passwordHash), true);
  const kariUser = await db.collection(COLLECTIONS.users).findOne({ uid: 1 });
  assert.deepEqual([kariUser.name, kariUser.isAdmin], ['Kari Nordmann', true]);
  const ola = await db.collection(COLLECTIONS.accounts).findOne({ uid: 2 });
  assert.equal(await verifyPassword('olas nye passord', ola.passwordHash), true, 'their own password wins');
});
