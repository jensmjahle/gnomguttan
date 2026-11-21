import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { MongoClient } from 'mongodb';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { COLLECTIONS } from './mongo.js';
import { EXCHANGES, seedProfilesFromOlbors, syncOlborsProfile } from './olbors.js';
import { hashPassword } from './passwords.js';
import { ProfileError, cleanProfileField, cleanProfileFields } from './profileFields.js';
import {
  createProfileService,
  profileEvents,
  firstNameOf,
  firstNamePattern,
  profileView,
  registerAvatarRoutes,
  sniffImageType,
} from './profiles.js';

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
const pngDataUrl = `data:image/png;base64,${PNG.toString('base64')}`;

test('profile fields are validated the way the Ølbørs needs them', () => {
  assert.equal(cleanProfileField('weight', '82,5'), '82.5');
  assert.equal(cleanProfileField('shoe_size', 44), '44');
  assert.throws(() => cleanProfileField('height', '3 meter'), ProfileError);
  assert.throws(() => cleanProfileField('weight', 5), /mellom 20 og 400/);
  assert.equal(cleanProfileField('gender', 'Female'), 'female');
  assert.throws(() => cleanProfileField('gender', 'helikopter'), ProfileError);
  assert.equal(cleanProfileField('work_relationship', 'fulltidsjobb'), 'Fulltidsjobb');
  assert.equal(cleanProfileField('marital_status', '  Gift\n med  jobben '), 'Gift med jobben');
  assert.throws(() => cleanProfileField('phone', '1'.repeat(31)), /maks 30/);
  assert.deepEqual(cleanProfileFields({ weight: '80', phone: '', extra: 'x' }), { set: { weight: '80' }, unset: ['phone'] });
});

test('first names match as whole words, with genitive endings, in any case', () => {
  const jens = firstNamePattern('Jens');
  for (const text of ['Jens sa det', 'jens!', "Det var Jens' idé", 'JENS', 'Jens’ bil']) assert.ok(jens.test(text), text);
  for (const text of ['Jensen sa det', 'Ajens', 'jens2']) assert.ok(!jens.test(text), text);
  const mikkel = firstNamePattern('Mikkel');
  assert.ok(mikkel.test('Mikkels pizza'));
  assert.ok(!mikkel.test('Mikkelsen'));
  assert.ok(firstNamePattern('Bjørn').test('bjørn ble med') && !firstNamePattern('Bjørn').test('Bjørnar ble med'));
  assert.equal(firstNamePattern('A'), null);
  assert.equal(firstNameOf({ name: 'Kari N', fullName: 'Karianne Nordmann' }), 'Karianne');
  assert.equal(firstNameOf({ name: 'Ola Hansen' }), 'Ola');
});

test('hidden fields are left out for others but shown to the owner', () => {
  const user = {
    uid: 1, name: 'Kari', fullName: 'Kari Nordmann', email: 'kari@test.no', bio: 'Hei!', lastSeenAt: 5,
    profile: { phone: '12345678', weight: '70', ethnicity: 'Norsk' }, hiddenFields: ['email', 'weight', 'lastSeen'],
  };
  const other = profileView(user, { uid: 2 });
  assert.equal(other.email, undefined);
  assert.equal(other.lastSeenAt, undefined);
  assert.deepEqual(other.fields, { phone: '12345678', ethnicity: 'Norsk' });
  assert.equal(other.hiddenFields, undefined);
  assert.equal(other.fullName, 'Kari Nordmann');
  const self = profileView(user, { uid: 1 });
  assert.deepEqual(self.fields, user.profile);
  assert.deepEqual(self.hiddenFields, ['email', 'weight', 'lastSeen']);
  assert.equal(self.isSelf, true);
});

test('pictures are judged by their bytes', () => {
  assert.equal(sniffImageType(PNG), 'image/png');
  assert.equal(sniffImageType(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>')), null);
  assert.equal(sniffImageType(Buffer.from([0xff, 0xd8, 0xff, 0xe0, ...new Array(20).fill(0)])), 'image/jpeg');
});

test('profile service', { timeout: 60000 }, async (t) => {
  const memory = await MongoMemoryServer.create();
  const mongo = await MongoClient.connect(memory.getUri());
  t.after(async () => { await mongo.close(); await memory.stop(); });
  const db = mongo.db('profiles');
  const getDatabase = async () => db;
  await db.collection(COLLECTIONS.users).insertMany([
    { uid: 1, name: 'Kari Nordmann', email: 'kari@test.no' },
    { uid: 2, name: 'Ola Hansen', email: 'ola@test.no' },
    { uid: 3, name: 'Per Persen', email: 'per@test.no' },
  ]);
  await db.collection(COLLECTIONS.accounts).insertOne({ uid: 1, email: 'kari@test.no', passwordHash: await hashPassword('karis passord') });

  const synced = [];
  const fetchImpl = async (url) => {
    const uid = Number(new URL(url).searchParams.get('uid'));
    if (uid === 2) return new Response(PNG, { headers: { 'Content-Type': 'image/png' } });
    if (uid === 3) return new Response('<svg xmlns="http://www.w3.org/2000/svg"/>', { headers: { 'Content-Type': 'image/svg+xml' } });
    return new Response('', { status: 404 });
  };
  const service = createProfileService({
    getDatabase,
    vocechatHost: 'http://vocechat.test',
    syncOlbors: async (uid) => { synced.push(uid); },
    fetchImpl,
    log: {},
  });
  const kari = { uid: 1 };
  const rejects = (promise, status) => assert.rejects(promise, (e) => e instanceof ProfileError && e.status === status);

  await t.test('editing: name, full name, bio, fields and what is hidden', async () => {
    await rejects(service.updateProfile(kari, { name: 'ola hansen' }), 409);
    await rejects(service.updateProfile(kari, { name: '@Kari' }), 400);
    await rejects(service.updateProfile(kari, { bio: 'x'.repeat(161) }), 400);
    const updated = await service.updateProfile(kari, {
      name: 'Kari N',
      fullName: 'Kari Nordmann',
      bio: 'Glad i  fjellturer.\n\n\n\nOg øl.',
      fields: { weight: '70', gender: 'female', phone: '' },
      hiddenFields: ['weight', 'not-a-field'],
    });
    assert.equal(updated.name, 'Kari N');
    assert.equal(updated.bio, 'Glad i fjellturer.\n\nOg øl.');
    assert.deepEqual(updated.fields, { weight: '70', gender: 'female' });
    assert.deepEqual(updated.hiddenFields, ['weight']);
    assert.deepEqual(synced, [1], 'open Ølbørs exchanges are updated');
    assert.equal((await service.getProfile({ uid: 2 }, 1)).fields.weight, undefined);
    await rejects(service.getProfile({ uid: 2 }, 999), 404);
  });

  await t.test('changing email needs the password and a free address', async () => {
    await rejects(service.changeEmail(kari, { email: 'ny@test.no', password: 'feil' }), 403);
    await rejects(service.changeEmail(kari, { email: 'OLA@test.no', password: 'karis passord' }), 409);
    await rejects(service.changeEmail(kari, { email: 'ikke-en-epost', password: 'karis passord' }), 400);
    const updated = await service.changeEmail(kari, { email: 'Kari.Ny@Test.no', password: 'karis passord' });
    assert.equal(updated.email, 'kari.ny@test.no');
    assert.equal((await db.collection(COLLECTIONS.accounts).findOne({ uid: 1 })).email, 'kari.ny@test.no');
  });

  await t.test('pictures: real images only, and VoceChat avatars are copied for those without one', async () => {
    await rejects(service.uploadAvatar(kari, 'data:image/png;base64,' + Buffer.from('<html>').toString('base64')), 400);
    await rejects(service.uploadAvatar(kari, 'data:image/png;base64,' + Buffer.alloc(3 * 1024 * 1024).toString('base64')), 400);
    const { avatarUpdatedAt } = await service.uploadAvatar(kari, pngDataUrl);
    assert.ok(avatarUpdatedAt > 0);
    assert.equal((await db.collection(COLLECTIONS.avatars).findOne({ uid: 1 })).source, 'upload');

    assert.equal(await service.importVoceChatAvatars(), 1);
    const users = Object.fromEntries((await db.collection(COLLECTIONS.users).find().toArray()).map((u) => [u.uid, u]));
    assert.equal(users[1].avatarSource, 'upload', 'an uploaded picture is never replaced');
    assert.equal(users[2].avatarSource, 'vocechat');
    assert.equal(users[3].avatarSource, undefined, 'an SVG from VoceChat is not taken');
    assert.ok(users[3].avatarImportTriedAt, 'and not retried for a day');
    assert.equal(await service.importVoceChatAvatars(), 0);

    await service.removeAvatar({ uid: 2 });
    assert.equal(await service.avatarFor(2), null, 'removed pictures are not copied again');
  });

  await t.test('quotes by or about someone, matched on their first name', async () => {
    await db.collection(COLLECTIONS.overheard).insertMany([
      { id: 'a', text: 'Jeg tar en til', author: 'Kari', createdAt: 3 },
      { id: 'b', text: 'Hvor er Karis jakke?', author: 'Ola', createdAt: 2 },
      { id: 'c', text: 'Karianne kommer ikke', author: 'Per', createdAt: 1 },
      { id: 'd', text: 'Ingen nevnt', author: 'Per', createdAt: 4 },
    ]);
    const { firstName, quotes } = await service.quotesAbout(1);
    assert.equal(firstName, 'Kari');
    assert.deepEqual(quotes.map((q) => q.id), ['a', 'b']);
  });

  await t.test('avatar route: members by token, kiosks only for their own exchange', async () => {
    await db.collection(EXCHANGES).insertOne({ id: 'ex', kioskToken: 'kiosk-key', customers: [{ uid: 1 }] });
    const app = express();
    registerAvatarRoutes(app, service, {
      resolveUser: async (token) => {
        if (token === 'good') return { uid: 2 };
        const error = new Error('no');
        error.name = 'UnauthorizedError';
        throw error;
      },
      getDatabase,
      exchangesCollection: EXCHANGES,
    });
    const server = app.listen(0);
    t.after(() => server.close());
    const base = `http://127.0.0.1:${server.address().port}/avatars`;
    const ok = await fetch(`${base}/1?token=good`);
    assert.equal(ok.status, 200);
    assert.equal(ok.headers.get('content-type'), 'image/png');
    assert.equal(ok.headers.get('x-content-type-options'), 'nosniff');
    assert.deepEqual(Buffer.from(await ok.arrayBuffer()), PNG);
    assert.equal((await fetch(`${base}/1`)).status, 401);
    assert.equal((await fetch(`${base}/1?token=bad`)).status, 401);
    assert.equal((await fetch(`${base}/1?kiosk=ex&key=kiosk-key`)).status, 200);
    assert.equal((await fetch(`${base}/2?kiosk=ex&key=kiosk-key`)).status, 401, 'Ola is not in that exchange');
    assert.equal((await fetch(`${base}/1?kiosk=ex&key=wrong`)).status, 401);
    const none = await fetch(`${base}/3?token=good`);
    assert.equal(none.status, 404);
    assert.match(none.headers.get('cache-control'), /max-age=600/);
  });
});

test('Ølbørs takes over profile answers once, then copies the profile into open exchanges', { timeout: 60000 }, async (t) => {
  const memory = await MongoMemoryServer.create();
  const mongo = await MongoClient.connect(memory.getUri());
  t.after(async () => { await mongo.close(); await memory.stop(); });
  const db = mongo.db('olbors-profiles');
  await db.collection(COLLECTIONS.users).insertMany([
    { uid: 1, name: 'Kari' },
    { uid: 2, name: 'Ola', profile: { weight: '90' } },
    { uid: 3, name: 'Per', profileSeededAt: 1 },
  ]);
  const exchange = (id, status, created_at, customers) => ({ id, status, created_at, version: 1, customers, beers: [], kioskToken: 'k' });
  await db.collection(EXCHANGES).insertMany([
    exchange('old', 'closed', '2025-01-01', [
      { id: 'c1', uid: 1, weight: '60 kg', height: '170', gender: 'female', marital_status: 'Singel' },
      { id: 'c2', uid: 2, weight: '85', height: '185' },
      { id: 'c3', uid: 3, weight: '75' },
    ]),
    exchange('new', 'live', '2026-01-01', [
      { id: 'c4', uid: 1, weight: '65' },
      { id: 'c5', uid: 2 },
    ]),
  ]);

  assert.equal(await seedProfilesFromOlbors(db), 2);
  const users = Object.fromEntries((await db.collection(COLLECTIONS.users).find().toArray()).map((u) => [u.uid, u]));
  assert.deepEqual(users[1].profile, { weight: '65' }, 'the newest exchange with answers wins');
  assert.deepEqual(users[2].profile, { weight: '90', height: '185' }, 'what the profile already had is kept');
  assert.equal(users[3].profile, undefined, 'already seeded people are left alone');
  assert.equal(await seedProfilesFromOlbors(db), 0, 'runs once');

  await db.collection(COLLECTIONS.users).updateOne({ uid: 1 }, { $set: { profile: { weight: '66', gender: 'female' } } });
  await syncOlborsProfile(db, 1);
  const live = await db.collection(EXCHANGES).findOne({ id: 'new' });
  const closed = await db.collection(EXCHANGES).findOne({ id: 'old' });
  assert.deepEqual([live.customers[0].weight, live.customers[0].gender, live.version], ['66', 'female', 2]);
  assert.equal(closed.customers[0].weight, '60 kg', 'closed exchanges keep their history');
  await syncOlborsProfile(db, 1);
  assert.equal((await db.collection(EXCHANGES).findOne({ id: 'new' })).version, 2, 'no write when nothing changed');
});

test('profile events: going or organising, split into upcoming and previous', () => {
  const now = Date.UTC(2026, 10, 21, 12);
  const at = (days) => new Date(now + days * 24 * 3600 * 1000).toISOString();
  const event = (id, startsInDays, extra = {}) => ({ id, title: id, startsAt: at(startsInDays), createdBy: { uid: 9 }, responses: [], ...extra });
  const events = [
    event('fest', 3, { responses: [{ uid: 1, status: 'coming' }, { uid: 2, status: 'coming' }] }),
    event('tur', 1, { responses: [{ uid: 1, status: 'coming' }] }),
    event('kanskje', 2, { responses: [{ uid: 1, status: 'maybe' }] }),
    event('nei', 2, { responses: [{ uid: 1, status: 'cannot' }] }),
    event('arrangerer', 5, { createdBy: { uid: 1 } }),
    event('arrangerer-men-kan-ikke', 6, { createdBy: { uid: 1 }, responses: [{ uid: 1, status: 'cannot' }] }),
    event('medarrangør', 7, { coOrganizers: [{ uid: 1 }], timeMode: 'proposed' }),
    event('i-går', -1, { responses: [{ uid: 1, status: 'coming' }] }),
    event('forrige-uke', -7, { responses: [{ uid: 1, status: 'coming' }] }),
    event('pågår', -0.1, { endsAt: at(0.2), responses: [{ uid: 1, status: 'coming' }] }),
  ];
  const { upcoming, previous } = profileEvents(events, 1, now);
  assert.deepEqual(upcoming.map((e) => e.id), ['pågår', 'tur', 'fest', 'arrangerer', 'medarrangør']);
  assert.deepEqual(previous.map((e) => e.id), ['i-går', 'forrige-uke']);
  assert.equal(upcoming.find((e) => e.id === 'fest').coming, 2);
  assert.equal(upcoming.find((e) => e.id === 'arrangerer').organizer, true);
  assert.equal(upcoming.find((e) => e.id === 'medarrangør').timeMode, 'proposed');
});
