import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { createMatrixBotTransport, readMatrixBotConfig } from './matrixBotTransport.js';

async function removeTestStorage(storageDir) {
  const resolved = path.resolve(storageDir);
  assert(resolved.startsWith(path.resolve(tmpdir()) + path.sep) && path.basename(resolved).startsWith('gnom-matrix-'));
  await rm(resolved, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
}
const quiet = { info() {}, warn() {}, error() {} };
function fakeSdk(state) {
  class MatrixClient {
    constructor() { this.crypto = { onRoomJoin: async () => {}, encryptRoomEvent: async (_room, _type, content) => { if (state.failCrypto) throw { code: 'ENCRYPTION_FAILED' }; state.encryptedBodies.push(content); return { algorithm: 'm.megolm.v1.aes-sha2', ciphertext: 'ciphertext' }; } }; }
    async resolveRoom(target) { return target.startsWith('#') ? '!resolvedRoom' : target; }
    async getWhoAmI() { return { user_id: '@gnomen:matrix.test', device_id: 'BOT-1' }; }
    async getJoinedRooms() { return []; }
    async joinRoom(room) { state.joined.push(room); }
    async getRoomStateEvent(_room, type) { if (type === 'm.room.create') return { type: state.space ? 'm.space' : undefined }; if (state.stateError) throw state.stateError; if (!state.encryption) throw { body: { errcode: 'M_NOT_FOUND' } }; return state.encryption; }
    async start() { state.starts++; }
    stop() { state.stops++; }
    async doRequest(method, endpoint, _qs, body) { state.sent.push({ method, endpoint, body }); return { event_id: '$sent' }; }
  }
  return { MatrixClient, SimpleFsStorageProvider: class {}, RustSdkCryptoStorageProvider: class {}, StoreType: { Sqlite: 0 }, LogLevel: { WARN: 1 }, LogService: { setLevel() {}, setLogger() {} } };
}
test('bot configuration validates target and URLs and keeps credentials server-side', () => {
  assert.equal(readMatrixBotConfig({}).enabled, false);
  assert.equal(readMatrixBotConfig({ MATRIX_BOT_ENABLED: 'true', MATRIX_BOT_TARGET_ROOM_ALIAS: '#alias:server' }).roomId, '#alias:server');
  assert.equal(readMatrixBotConfig({ MATRIX_BOT_ENABLED: 'true', MATRIX_BOT_TARGET_ROOM_ID: '!opaqueRoomId' }).roomId, '!opaqueRoomId');
  assert.throws(() => readMatrixBotConfig({ MATRIX_BOT_ENABLED: 'true', MATRIX_BOT_TARGET_ROOM_ID: '!room:server', MATRIX_BOT_HOMESERVER_URL: 'http://external.test' }), /HTTPS/);
});
test('persistent login, encrypted transport, failures and session mismatch', async t => {
  const storageDir = await mkdtemp(path.join(tmpdir(), 'gnom-matrix-transport-')); t.after(() => removeTestStorage(storageDir));
  const config = { enabled: true, baseUrl: 'https://matrix.test', username: 'gnomen', password: 'only-for-test', roomId: '!room:matrix.test', storageDir };
  const state = { starts: 0, stops: 0, joined: [], sent: [], encryptedBodies: [], encryption: { algorithm: 'm.megolm.v1.aes-sha2' } }; let logins = 0;
  const fetchImpl = async () => { logins++; return { ok: true, json: async () => ({ access_token: 'private-test-token', user_id: '@gnomen:matrix.test', device_id: 'BOT-1' }) }; };
  const options = { sdkLoader: async () => fakeSdk(state), fetchImpl, logger: quiet };
  let transport = await createMatrixBotTransport(config, options); const content = { msgtype: 'm.notice', body: 'Et arrangement er opprettet.' };
  const prepared = await transport.prepare(config.roomId, content); assert.equal(prepared.type, 'm.room.encrypted'); assert(!JSON.stringify(prepared).includes(content.body));
  await transport.send(config.roomId, prepared, 'stable-transaction'); await transport.send(config.roomId, prepared, 'stable-transaction'); assert.deepEqual(state.sent[0], state.sent[1]); assert.match(state.sent[0].endpoint, /m.room.encrypted\/stable-transaction$/);
  const reused = await transport.prepare(config.roomId, content, prepared); assert.equal(reused, prepared); assert.equal(state.encryptedBodies.length, 1);
  state.stateError = { body: { errcode: 'M_FORBIDDEN' } }; await assert.rejects(transport.prepare(config.roomId, content)); assert.equal(state.sent.length, 2); state.stateError = null;
  state.encryption = { algorithm: 'future.algorithm' }; await assert.rejects(transport.prepare(config.roomId, content), { code: 'MATRIX_BOT_UNSUPPORTED_ENCRYPTION' });
  state.encryption = null; assert.equal((await transport.prepare(config.roomId, content)).type, 'm.room.message'); assert.equal(await transport.prepare(config.roomId, content, prepared), prepared);
  state.encryption = { algorithm: 'm.megolm.v1.aes-sha2' }; state.failCrypto = true; await assert.rejects(transport.prepare(config.roomId, content)); state.failCrypto = false;
  transport.stop(); transport = await createMatrixBotTransport({ ...config, password: '' }, options); assert.equal(logins, 1); transport.stop();
  transport = await createMatrixBotTransport({ ...config, roomId: '#kosegjengen:matrix.test' }, options);
  const aliasPrepared = await transport.prepare('#kosegjengen:matrix.test', content);
  assert.equal(aliasPrepared.roomId, '!resolvedRoom');
  await transport.send('#kosegjengen:matrix.test', aliasPrepared, 'alias-transaction');
  assert.match(state.sent.at(-1).endpoint, /rooms\/!resolvedRoom\/send/);
  await assert.rejects(transport.prepare('#kosegjengen:matrix.test', content, { ...aliasPrepared, roomId: '!different' }), { code: 'MATRIX_BOT_TARGET_CHANGED' });
  transport.stop();
  const session = JSON.parse(await readFile(path.join(storageDir, 'session.json'), 'utf8')); assert.equal(session.deviceId, 'BOT-1'); assert.equal(session.password, undefined);
  await assert.rejects(createMatrixBotTransport({ ...config, accessToken: 'different-device-token' }, options), { code: 'MATRIX_BOT_SESSION_MISMATCH' });
  state.space = true; await assert.rejects(createMatrixBotTransport(config, options), { code: 'MATRIX_BOT_TARGET_IS_SPACE' });
});
test('partial storage without the matching session is rejected rather than replacing crypto identity', async t => {
  const storageDir = await mkdtemp(path.join(tmpdir(), 'gnom-matrix-partial-')); t.after(() => removeTestStorage(storageDir)); await writeFile(path.join(storageDir, 'sync.json'), '{}');
  await assert.rejects(createMatrixBotTransport({ baseUrl: 'https://matrix.test', storageDir, username: 'gnomen', password: 'test' }, { sdkLoader: async () => fakeSdk({}), logger: quiet, fetchImpl: async () => { throw new Error('Must not login'); } }), { code: 'MATRIX_BOT_STORAGE_INCOMPLETE' });
});
test('native Rust SDK encrypts a notice and uses a stable transaction against a local Matrix API', { timeout: 60000 }, async t => {
  const storageDir = await mkdtemp(path.join(tmpdir(), 'gnom-matrix-native-')); const uid = '@gnomen:localhost', device = 'BOT-NATIVE', room = '!notices:localhost'; const requests = []; let deviceKeys; let tick = 0; let underlying;
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost'), route = decodeURIComponent(url.pathname); let raw = ''; for await (const chunk of req) raw += chunk;
    const data = raw ? JSON.parse(raw) : {}; let response = {}; let status = 200;
    if (route.endsWith('/login')) response = { user_id: uid, device_id: device, access_token: 'native-local-test-token' };
    else if (route.endsWith('/whoami')) response = { user_id: uid, device_id: device };
    else if (route.endsWith('/joined_rooms')) response = { joined_rooms: [room] };
    else if (route.includes('/state/m.room.create')) response = { creator: uid, room_version: '10' };
    else if (route.includes('/state/m.room.encryption')) response = { algorithm: 'm.megolm.v1.aes-sha2' };
    else if (route.includes('/state/m.room.history_visibility')) response = { history_visibility: 'shared' };
    else if (route.endsWith('/joined_members')) response = { joined: { [uid]: { display_name: 'Gnomen' } } };
    else if (route.endsWith('/members')) response = { chunk: [{ type: 'm.room.member', state_key: uid, content: { membership: 'join' } }] };
    else if (route.endsWith('/keys/upload')) { deviceKeys ||= data.device_keys; response = { one_time_key_counts: { signed_curve25519: 50 } }; }
    else if (route.endsWith('/keys/query')) response = { device_keys: deviceKeys ? { [uid]: { [device]: deviceKeys } } : {}, failures: {}, master_keys: {}, self_signing_keys: {}, user_signing_keys: {} };
    else if (route.endsWith('/keys/claim')) response = { one_time_keys: {}, failures: {} };
    else if (route.includes('/send/')) { requests.push({ route, data }); response = { event_id: '$native-event' }; }
    else if (route.endsWith('/sync')) { await new Promise(resolve => setTimeout(resolve, 100)); response = { next_batch: String(++tick), rooms: { join: {} }, to_device: { events: [] }, device_lists: { changed: [], left: [] }, device_one_time_keys_count: { signed_curve25519: 50 } }; }
    else if (route.endsWith('/filter')) response = { filter_id: '0' };
    else if (route.endsWith('/versions')) response = { versions: ['v1.11'] };
    else if (route.includes('/account_data/')) { status = 404; response = { errcode: 'M_NOT_FOUND' }; }
    res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(response));
  });
  server.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  const [sdk, crypto] = await Promise.all([import('matrix-bot-sdk'), import('@matrix-org/matrix-sdk-crypto-nodejs')]);
  const sdkLoader = async () => ({ ...sdk, StoreType: crypto.StoreType, MatrixClient: class extends sdk.MatrixClient { constructor(...args) { super(...args); underlying = this; } } });
  let transport;
  t.after(async () => { transport?.stop(); underlying?.stop(); await new Promise(resolve => setTimeout(resolve, 200)); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); underlying?.crypto?.engine?.machine?.close(); await removeTestStorage(storageDir); });
  const config = readMatrixBotConfig({ MATRIX_BOT_ENABLED: 'true', MATRIX_BOT_HOMESERVER_URL: `http://127.0.0.1:${server.address().port}`, MATRIX_BOT_USERNAME: uid, MATRIX_BOT_PASSWORD: 'local-test-only', MATRIX_BOT_TARGET_ROOM_ID: room, MATRIX_BOT_STORAGE_DIR: storageDir });
  transport = await createMatrixBotTransport(config, { sdkLoader, logger: quiet });
  const prepared = await transport.prepare(room, { msgtype: 'm.notice', body: 'Hemmelig arrangementsvarsel' }); assert.equal(prepared.type, 'm.room.encrypted'); assert(prepared.content.ciphertext); assert.equal(prepared.content.algorithm, 'm.megolm.v1.aes-sha2'); assert(!JSON.stringify(prepared).includes('Hemmelig arrangementsvarsel'));
  await transport.send(room, prepared, 'stable-native-transaction'); await transport.send(room, prepared, 'stable-native-transaction'); assert.equal(requests.length, 2); assert.deepEqual(requests[0], requests[1]);
});
