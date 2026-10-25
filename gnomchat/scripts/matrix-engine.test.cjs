const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');

function engine() {
  const sent = []; const calls = []; const clients = [];
  const events = [{ getId: () => '$one', getType: () => 'm.room.message', getContent: () => ({ body: 'Hei', msgtype: 'm.text' }),
    getSender: () => '@other:test', getTs: () => 123, isRedacted: () => false, isEncrypted: () => false }];
  const room = { roomId: '!room:test', name: 'Gjengen', getLiveTimeline: () => ({ getEvents: () => events }),
    getMyMembership: () => 'join', getType: () => undefined, getUnreadNotificationCount: () => 1,
    getLastActiveTimestamp: () => 123, getMember: id => ({ name: id }), getMembers: () => [], getUsersReadUpTo: () => [],
    findEventById: id => events.find(event => event.getId() === id) };
  const sdk = { ClientEvent: { Sync: 'sync', AccountData: 'account' }, EventType: { Direct: 'm.direct' },
    RoomEvent: {}, RoomMemberEvent: {}, MatrixEventEvent: {}, createClient: options => {
      const client = { options, on() {}, removeAllListeners() { calls.push('removeListeners'); },
        stopClient() { calls.push('stop'); }, async initRustCrypto() { calls.push('crypto'); },
        async startClient() { calls.push('sync'); }, getRooms: () => [room], getRoom: () => room,
        getAccountData: () => undefined, isRoomEncrypted: () => true,
        async sendReadReceipt(event) { calls.push(['read', event.getId()]); }, async setRoomReadMarkers(id, event) { calls.push(['marker', id, event]); },
        async sendMessage(id, content) { calls.push(['send', id, content]); },
        async uploadContent(blob) { calls.push(['upload', await blob.text()]); return { content_uri: 'mxc://test/file' }; },
        async logout() { calls.push('logout'); },
        async login(_type, credentials) { calls.push(['login', credentials]); return { access_token: 'token', user_id: '@me:test', device_id: 'device' }; },
      }; clients.push(client); return client;
    } };
  const mocks = {
    'matrix-js-sdk': sdk,
    'matrix-js-sdk/lib/crypto-api': { decodeRecoveryKey() {}, CryptoEvent: {}, VerificationPhase: {}, VerificationRequestEvent: {}, VerifierEvent: {} },
    '@matrix-org/matrix-sdk-crypto-wasm': { async initAsync() { calls.push('wasm'); } },
    'matrix-encrypt-attachment': { async encryptAttachment() { return { data: new TextEncoder().encode('ciphertext').buffer, info: { key: { k: 'secret' } } }; }, decryptAttachment() {} },
  };
  const window = { ReactNativeWebView: { postMessage: json => sent.push(JSON.parse(json)) }, addEventListener() {} };
  const code = ts.transpileModule(fs.readFileSync(path.join(root, 'matrix-engine/main.ts'), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(code, { exports: {}, window, console, setTimeout, clearTimeout, Blob,
    atob: value => Buffer.from(value, 'base64').toString('binary'),
    require: name => { assert.ok(Object.hasOwn(mocks, name), name); return mocks[name]; },
  });
  let id = 0;
  return { sent, calls, clients, async command(method, args = {}) {
    const request = ++id; await window.__gnomMatrixCommand({ id: request, method, args });
    const response = sent.find(item => item.type === 'response' && item.id === request);
    if (response.error) throw new Error(response.error);
    return response.result;
  } };
}
const session = { baseUrl: 'https://matrix.invalid', accessToken: 'token', userId: '@me:test', deviceId: 'device' };
test('native markdown normalizes international domains without the Node punycode module', () => {
  const { toASCII, toUnicode } = require('../src/utils/punycode.cjs');
  for (const hostname of ['gnomguttan.no', 'blåbær.no', 'bücher.de', '日本語.jp', '🍺.no']) {
    assert.equal(toASCII(hostname), new URL(`https://${hostname}`).hostname);
    assert.equal(toUnicode(toASCII(hostname)), hostname);
  }
  assert.equal(toASCII('jens@blåbær.no'), `jens@${new URL('https://blåbær.no').hostname}`);
});
test('local Matrix worker boots and initializes encryption before syncing', async () => {
  const runtime = engine(); assert.equal(runtime.sent[0].type, 'ready');
  await runtime.command('start', session);
  assert.ok(runtime.calls.indexOf('wasm') < runtime.calls.indexOf('crypto'));
  assert.ok(runtime.calls.indexOf('crypto') < runtime.calls.indexOf('sync'));
  assert.equal(runtime.sent.find(item => item.type === 'snapshot').rooms[0].name, 'Gjengen');
});
test('local Matrix worker does not send read receipts while hidden or in another room', async () => {
  const runtime = engine(); await runtime.command('start', session); await runtime.command('open', { id: '!room:test' });
  await runtime.command('read', { id: '!room:test', eventId: '$one' });
  assert.equal(runtime.calls.some(item => item[0] === 'read'), false);
  await runtime.command('visibility', { active: true });
  await runtime.command('read', { id: '!other:test', eventId: '$one' });
  assert.equal(runtime.calls.some(item => item[0] === 'read'), false);
  await runtime.command('read', { id: '!room:test', eventId: '$one' });
  assert.deepEqual(runtime.calls.find(item => item[0] === 'read'), ['read', '$one']);
});
test('encrypted attachments upload ciphertext and carry an encrypted file descriptor', async () => {
  const runtime = engine(); await runtime.command('start', session);
  await runtime.command('upload', { id: '!room:test', base64: Buffer.from('private image').toString('base64'), name: 'image.png', mimetype: 'image/png', msgtype: 'm.image' });
  assert.deepEqual(runtime.calls.find(item => item[0] === 'upload'), ['upload', 'ciphertext']);
  const content = runtime.calls.find(item => item[0] === 'send')[2];
  assert.equal(content.file.url, 'mxc://test/file'); assert.equal(content.url, undefined);
  assert.equal(content.file.key.k, 'secret');
});
test('Matrix login uses a separate mobile device and returns the native session', async () => {
  const runtime = engine(); const result = await runtime.command('login', { baseUrl: session.baseUrl, username: 'me', password: 'test-password' });
  assert.equal(result.deviceId, 'device'); assert.equal(result.accessToken, 'token');
  assert.equal(runtime.calls.find(item => item[0] === 'login')[1].initial_device_display_name, 'GnomChat mobil');
});
test('visible mobile screens use React Native rather than WebView pages', () => {
  const app = fs.readFileSync(path.join(root, 'App.tsx'), 'utf8');
  assert.match(app, /component=\{ChannelListScreen\}/); assert.match(app, /component=\{ChatScreen\}/);
  for (const file of fs.readdirSync(path.join(root, 'src/screens'))) {
    assert.doesNotMatch(fs.readFileSync(path.join(root, 'src/screens', file), 'utf8'), /from ['"]react-native-webview['"]/);
  }
  const runtime = fs.readFileSync(path.join(root, 'src/components/MatrixRuntime.tsx'), 'utf8');
  assert.match(runtime, /source=\{\{ html: MATRIX_ENGINE_HTML/);
  assert.doesNotMatch(runtime, /source=\{\{ uri:/);
  const gate = app.slice(app.indexOf('function LegacyGate'), app.indexOf('function useHeaderScreenOptions'));
  assert.doesNotMatch(gate, /useMatrixMobileStore/);
});
