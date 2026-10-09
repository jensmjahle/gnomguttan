import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { MongoClient } from 'mongodb';
import { buildMatrixEventNotice } from './matrixEventNotices.js';
import { createMatrixInfoBot, MATRIX_BOT_OUTBOX } from './matrixInfoBot.js';
import { marked } from 'marked';

const actor = { uid: 1, name: 'Gnomen' };
const event = { id: 'event-1', title: 'Tur med gjengen', status: 'published', updatedAt: 100, startsAt: '2026-10-09T16:00:00Z', responses: [], comments: [], todos: [], timeProposals: [] };
const config = { enabled: true, roomId: '!notices:localhost', publicUrl: 'https://gnomguttan.no' };
const logger = { info() {}, warn() {}, error() {} };
test('published events get a linked notice; drafts and timestamp-only edits do not', () => {
  assert.equal(buildMatrixEventNotice(null, { ...event, status: 'draft' }, actor), null);
  assert.equal(buildMatrixEventNotice(event, { ...event, updatedAt: 200 }, actor), null);
  const notice = buildMatrixEventNotice({ ...event, status: 'draft' }, event, actor);
  assert.equal(notice.kind, 'created'); assert.equal(notice.content.msgtype, 'm.notice');
  assert.match(notice.content.body, /Si fra om du kommer/); assert.match(notice.content.formatted_body, /https:\/\/gnomguttan.no\/arrangementer\/event-1/);
  assert.match(notice.content.formatted_body, /<strong>🎉 Nytt arrangement<\/strong>/);
  assert.match(notice.content['org.gnomguttan.markdown'], /\*\*🎉 Nytt arrangement\*\*/);
  assert.match(notice.content.body, /9\. oktober 2026/);
  assert(notice.content.body.includes('\n'));
  const markdownTitle = buildMatrixEventNotice(null, { ...event, title: '[Klikk](javascript:alert(1)) *tur*' }, actor).content['org.gnomguttan.markdown'];
  assert(!marked.parse(markdownTitle).includes('href="javascript:'));
  const unsafe = buildMatrixEventNotice(null, { ...event, title: '<img src=x onerror=alert(1)>' }, { name: '<script>bad</script>' });
  assert(!unsafe.content.formatted_body.includes('<img')); assert(unsafe.content.formatted_body.includes('&lt;img'));
});
test('detail changes, discussion, votes, todos and RSVP are summarized without no-op spam', () => {
  const updated = { ...event, location: 'Bymarka', comments: [{ id: 'c1', text: 'Hvem blir med?', poll: { id: 'p1', question: 'Tid?', options: [{ id: 'o1', label: 'Tidlig', votes: [] }] } }], todos: [{ id: 't1', title: 'Ta med kaffe', mode: 'open' }], responses: [{ uid: 1, name: 'Gnomen', status: 'coming', respondedAt: 100 }] };
  const notice = buildMatrixEventNotice(event, updated, actor); assert.equal(notice.kind, 'updated');
  assert.match(notice.content.body, /Endret sted/); assert.match(notice.content.body, /Gnomen kommer/); assert.match(notice.content.body, /Oppgavelisten/); assert.match(notice.content.body, /Ny avstemning/); assert.match(notice.content.body, /Nytt innlegg/);
  assert.equal(buildMatrixEventNotice(updated, { ...updated, responses: [{ ...updated.responses[0], respondedAt: 999 }], updatedAt: 999 }, actor), null);
  const voted = structuredClone(updated); voted.comments[0].poll.options[0].votes = [1];
  assert.match(buildMatrixEventNotice(updated, voted, actor).content.body, /Diskusjonen er oppdatert/);
  const reply = structuredClone(updated); reply.comments[0].replies = [{ id: 'r1', text: 'Ja!' }];
  assert(buildMatrixEventNotice(updated, reply, actor));
  const proposal = { ...event, timeProposals: [{ id: 'd1', startsAt: '2026-10-10T10:00:00Z', votes: [2, 1] }] };
  assert.equal(buildMatrixEventNotice(proposal, { ...proposal, timeProposals: [{ ...proposal.timeProposals[0], votes: [1, 2] }] }, actor), null);
  assert.match(buildMatrixEventNotice(event, null, actor).content.body, /er slettet/);
  assert.match(buildMatrixEventNotice(event, { ...event, responses: [{ uid: 1, status: 'coming' }] }, actor).content.formatted_body, /<strong>✅ Deltakersvar<\/strong>/);
  assert.match(buildMatrixEventNotice(event, { ...event, comments: [{ id: 'poll', poll: { id: 'poll-1', question: 'Når?', options: [] } }] }, actor).content.formatted_body, /<strong>🗳️ Ny avstemning<\/strong>/);
});
test('disabled bot never opens a database or touches Matrix', async () => {
  const bot = createMatrixInfoBot({ config: { enabled: false }, getDatabase: () => { throw new Error('Unexpected DB'); }, createTransport: () => { throw new Error('Unexpected Matrix'); }, logger });
  bot.start(); assert.equal(await bot.enqueueChange(null, event, actor), false); await bot.processPending(); await bot.stop();
});
test('durable queue retries a lost response with identical ciphertext and transaction ID after restart', async t => {
  const memory = await MongoMemoryServer.create({ instance: { launchTimeout: 60000 } }); const client = new MongoClient(memory.getUri()); await client.connect(); const db = client.db('matrix-bot-tests');
  t.after(async () => { await client.close(); await memory.stop(); });
  let clock = 1000; const sends = []; let fail = true; let encryptions = 0; const logs = [];
  const transport = { async prepare(_room, _content, previous) { if (previous) return previous; encryptions++; return { type: 'm.room.encrypted', content: { ciphertext: 'test-ciphertext' } }; }, async send(room, prepared, txn) { sends.push({ room, prepared, txn }); if (fail) { fail = false; throw Object.assign(new Error('secret-token-must-not-log'), { errcode: 'M_TIMEOUT', request: { headers: { Authorization: 'secret' } } }); } return '$delivered'; }, stop() {} };
  const options = { getDatabase: async () => db, config, createTransport: async () => transport, now: () => clock, logger: { ...logger, warn: message => logs.push(message) } };
  let bot = createMatrixInfoBot(options); await bot.enqueueChange(null, event, actor); await bot.enqueueChange(null, event, actor); assert.equal(await db.collection(MATRIX_BOT_OUTBOX).countDocuments(), 1);
  await bot.processPending(); let job = await db.collection(MATRIX_BOT_OUTBOX).findOne({}); assert.equal(job.state, 'pending'); assert.equal(job.attempts, 1); assert.equal(job.prepared.type, 'm.room.encrypted');
  assert(!JSON.stringify(logs).includes('secret')); assert.equal(job.lastErrorCode, 'M_TIMEOUT'); await bot.stop();
  clock += 60000; bot = createMatrixInfoBot(options); await bot.processPending(); job = await db.collection(MATRIX_BOT_OUTBOX).findOne({}); assert.equal(job.state, 'sent'); assert.equal(job.eventId, '$delivered'); assert.equal(job.content, undefined); assert.equal(job.prepared, undefined); assert(job.sentAt instanceof Date);
  assert.equal(encryptions, 1); assert.equal(sends.length, 2); assert.deepEqual(sends[0], sends[1]); await bot.enqueueChange(null, event, actor); await bot.processPending(); assert.equal(sends.length, 2); await bot.stop();
  await t.test('unpublishing removes pending announcements, and repeated RSVP status makes no job', async () => {
    await db.collection(MATRIX_BOT_OUTBOX).deleteMany({}); bot = createMatrixInfoBot(options); await bot.enqueueChange(null, event, actor); await bot.enqueueChange(event, { ...event, status: 'draft', updatedAt: 200 }, actor); assert.equal(await db.collection(MATRIX_BOT_OUTBOX).countDocuments(), 0);
    const responded = { ...event, responses: [{ uid: 1, status: 'coming', respondedAt: 100 }] };
    assert.equal(await bot.enqueueChange(responded, { ...responded, responses: [{ uid: 1, status: 'coming', respondedAt: 999 }] }, actor), false);
    await bot.enqueueChange(event, null, actor); assert.equal((await db.collection(MATRIX_BOT_OUTBOX).findOne({})).kind, 'deleted'); await bot.stop();
  });
  await t.test('failed Matrix connection retains jobs and a later worker can deliver', async () => {
    await db.collection(MATRIX_BOT_OUTBOX).deleteMany({}); bot = createMatrixInfoBot({ ...options, createTransport: async () => { throw { errcode: 'M_FORBIDDEN' }; } });
    await bot.enqueueChange(null, event, actor); await bot.processPending(); assert.equal((await db.collection(MATRIX_BOT_OUTBOX).findOne({})).state, 'pending'); await bot.stop();
    bot = createMatrixInfoBot(options); await bot.processPending(); assert.equal((await db.collection(MATRIX_BOT_OUTBOX).findOne({})).state, 'sent'); await bot.stop();
  });
});
