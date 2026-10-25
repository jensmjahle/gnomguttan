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
    getSender: () => '@other:test', getTs: () => 123, isRedacted: () => false, isEncrypted: () => false, isDecryptionFailure: () => false }];
  let permission = true; let readCursor = '$one';
  const stateEvents = {};
  const room = { roomId: '!room:test', name: 'Gjengen', getLiveTimeline: () => ({ getEvents: () => events }),
    getMyMembership: () => 'join', getType: () => undefined, getUnreadNotificationCount: () => 1,
    getLastActiveTimestamp: () => 123, getMember: id => ({ name: id }), getMembers: () => [], getUsersReadUpTo: () => [],
    findEventById: id => events.find(event => event.getId() === id), getEventReadUpTo: () => readCursor, hasEncryptionStateEvent: () => true,
    currentState: { maySendStateEvent: () => permission, getStateEvents: type => ({ getContent: () => stateEvents[type] || {} }) },
    canInvite: () => permission, getJoinRule: () => 'invite', getHistoryVisibility: () => 'shared', getCanonicalAlias: () => '#test:test', async loadMembersIfNeeded() {} };
  const sdk = { ClientEvent: { Sync: 'sync', AccountData: 'account' }, EventType: { Direct: 'm.direct', RoomMessage: 'm.room.message', RoomMessageEncrypted: 'm.room.encrypted', Sticker: 'm.sticker' }, MsgType: { Text: 'm.text', Image: 'm.image', Audio: 'm.audio', File: 'm.file' },
    RoomEvent: {}, RoomMemberEvent: {}, MatrixEventEvent: {}, createClient: options => {
      const client = { options, on() {}, removeAllListeners() { calls.push('removeListeners'); },
        stopClient() { calls.push('stop'); }, async initRustCrypto() { calls.push('crypto'); },
        async startClient() { calls.push('sync'); }, getRooms: () => [room], getRoom: () => room,
        getAccountData: () => undefined, async getAccountDataFromServer() { return {}; }, async setAccountDataRaw(type, content) { calls.push(['account', type, content]); }, isRoomEncrypted: () => true,
        async sendReadReceipt(event) { readCursor = event.getId(); calls.push(['read', event.getId()]); }, async setRoomReadMarkers(id, event) { calls.push(['marker', id, event]); },
        async sendMessage(id, content) { calls.push(['send', id, content]); },
        async sendEvent(id, type, content) { calls.push(['event', id, type, content]); },
        async relations() { return { events: events.filter(event => event.getType() === 'm.reaction') }; }, async redactEvent(id, eventId) { calls.push(['redact', id, eventId]); },
        async createRoom(options) { calls.push(['create', options]); return { room_id: '!created:test' }; },
        async sendStateEvent(id, type, content) { stateEvents[type] = content; calls.push(['state', id, type, content]); },
        getRoomPushRule: () => undefined, async setRoomMutePushRule(scope, id, muted) { calls.push(['mute', scope, id, muted]); },
        async getProfileInfo(id) { calls.push(['profile', id]); return { displayname: 'Gnom', avatar_url: 'mxc://test/avatar' }; }, async setDisplayName(name) { calls.push(['displayName', name]); },
        async publicRooms(options) { calls.push(['directory', options]); return { chunk: [], next_batch: 'next' }; },
        secretStorage: { async getDefaultKeyId() { return 'key'; }, async getKey() { return ['key', {}]; }, async checkKey(bytes) { return Buffer.from(bytes).equals(Buffer.alloc(32, 7)); } },
        getCrypto: () => ({ async userHasCrossSigningKeys() { return false; }, async loadSessionBackupPrivateKeyFromSecretStorage() {}, async restoreKeyBackup() { return { imported: 4 }; } }),
        async uploadContent(blob) { calls.push(['upload', await blob.text()]); return { content_uri: 'mxc://test/file' }; },
        async logout() { calls.push('logout'); },
        async login(_type, credentials) { calls.push(['login', credentials]); return { access_token: 'token', user_id: '@me:test', device_id: 'device' }; },
      }; clients.push(client); return client;
    } };
  const mocks = {
    'matrix-js-sdk': sdk,
    'matrix-js-sdk/lib/crypto-api': { ...require(path.join(root, '../node_modules/matrix-js-sdk/lib/crypto-api/recovery-key.js')), ...require(path.join(root, '../node_modules/matrix-js-sdk/lib/crypto-api/key-passphrase.js')), CryptoEvent: {}, VerificationPhase: {}, VerificationRequestEvent: {}, VerifierEvent: {} },
    '@matrix-org/matrix-sdk-crypto-wasm': { async initAsync() { calls.push('wasm'); } },
    'matrix-encrypt-attachment': { async encryptAttachment() { return { data: new TextEncoder().encode('ciphertext').buffer, info: { key: { k: 'secret' } } }; }, decryptAttachment() {} },
  };
  const sdkRoot = path.join(root, '../node_modules/matrix-js-sdk/lib');
  for (const name of ['PollStartEvent', 'PollResponseEvent', 'PollEndEvent']) mocks[`matrix-js-sdk/lib/extensible_events_v1/${name}`] = require(path.join(sdkRoot, `extensible_events_v1/${name}.js`));
  mocks['matrix-js-sdk/lib/@types/polls'] = require(path.join(sdkRoot, '@types/polls.js'));
  mocks['matrix-js-sdk/lib/content-helpers'] = require(path.join(sdkRoot, 'content-helpers.js'));
  mocks['matrix-js-sdk/lib/models/poll'] = { PollEvent: { Responses: 'responses', End: 'end' }, Poll: class {
    constructor(event) { this.pollEvent = new mocks['matrix-js-sdk/lib/extensible_events_v1/PollStartEvent'].PollStartEvent({ type: event.getType(), content: event.getContent() }); this.isEnded = false; }
    on() {} removeAllListeners() {} onNewRelation() {} async getResponses() { return { getRelations: () => [] }; }
  } };
  mocks['../../src/services/matrixMarkdown'] = { markdownContent: source => ({ msgtype: 'm.text', body: source, format: 'org.matrix.custom.html', formatted_body: `<p>${source}</p>`, 'org.gnomguttan.markdown': source }) };
  const loadLocal = file => {
    const exports = {};
    const compiled = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    vm.runInNewContext(compiled, { exports, URLSearchParams, Blob, File, require: name => { assert.ok(Object.hasOwn(mocks, name), name); return mocks[name]; } });
    return exports;
  };
  mocks['../../src/services/matrixMedia'] = loadLocal(path.join(root, '../src/services/matrixMedia.ts'));
  mocks['../../src/services/matrixLocation'] = loadLocal(path.join(root, '../src/services/matrixLocation.ts'));
  mocks['./recovery'] = loadLocal(path.join(root, 'matrix-engine/recovery.ts'));
  mocks['./unread'] = loadLocal(path.join(root, 'matrix-engine/unread.ts'));
  const window = { ReactNativeWebView: { postMessage: json => sent.push(JSON.parse(json)) }, addEventListener() {} };
  const code = ts.transpileModule(fs.readFileSync(path.join(root, 'matrix-engine/main.ts'), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(code, { exports: {}, window, console, setTimeout, clearTimeout, Blob, File,
    atob: value => Buffer.from(value, 'base64').toString('binary'),
    require: name => { assert.ok(Object.hasOwn(mocks, name), name); return mocks[name]; },
  });
  let id = 0;
  return { sent, calls, clients, events, room, setPermission: value => { permission = value; }, normalizeRecoveryKey: mocks['./recovery'].normalizeRecoveryKey, async command(method, args = {}) {
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

test('private rooms and spaces are created with the requested Matrix settings', async () => {
  const runtime = engine(); await runtime.command('start', session);
  await runtime.command('createRoom', { name: 'Gjengen', topic: 'Planer', encrypted: true });
  const options = runtime.calls.find(item => item[0] === 'create')[1];
  assert.equal(options.visibility, 'private'); assert.equal(options.initial_state[0].type, 'm.room.encryption');
  await runtime.command('createRoom', { name: 'Gnomguttan', space: true });
  assert.equal(runtime.calls.filter(item => item[0] === 'create')[1][1].creation_content.type, 'm.space');
  await assert.rejects(runtime.command('createRoom', { name: ' ' }), /navn/);
});
test('room changes require the current Matrix permission before any mutation', async () => {
  const runtime = engine(); await runtime.command('start', session); runtime.setPermission(false);
  await assert.rejects(runtime.command('roomUpdate', { id: '!room:test', name: 'Changed' }), /tillatelse/);
  assert.equal(runtime.calls.some(item => item[0] === 'state'), false);
  runtime.setPermission(true); await runtime.command('roomUpdate', { id: '!room:test', name: 'Changed' });
  assert.equal(runtime.calls.find(item => item[0] === 'state')[2], 'm.room.name');
});
test('member profiles and directory requests target the requested user/query', async () => {
  const runtime = engine(); await runtime.command('start', session);
  const profile = await runtime.command('profile', { userId: '@other:test' });
  assert.equal(profile.id, '@other:test'); assert.equal(runtime.calls.find(item => item[0] === 'profile')[1], '@other:test');
  await runtime.command('directory', { query: 'gnom', since: 'page2' });
  const options = runtime.calls.find(item => item[0] === 'directory')[1];
  assert.equal(options.filter.generic_search_term, 'gnom'); assert.equal(options.since, 'page2');
});
test('clipboard line breaks, nonbreaking spaces and zero-width characters do not corrupt recovery', async () => {
  const runtime = engine(); await runtime.command('start', session);
  const { encodeRecoveryKey } = require(path.join(root, '../node_modules/matrix-js-sdk/lib/crypto-api/recovery-key.js'));
  const key = encodeRecoveryKey(Buffer.alloc(32, 7));
  for (const separator of ['\n', '\r\n', '\t', '\u00a0', '\u202f', '\u200b']) {
    const imported = await runtime.command('recover', { key: key.replace(/ /g, separator) }); assert.equal(imported, 4);
  }
  await assert.rejects(runtime.command('recover', { key: 'account-password0' }), /ikke en gyldig Matrix/);
  await assert.rejects(runtime.command('recover', { key: '111111' }), /ufullstendig|skrivefeil/);
});
test('an unread boundary is captured before a receipt and remains a stable snapshot', async () => {
  const runtime = engine(); await runtime.command('start', session);
  runtime.events.push({ ...runtime.events[0], getId: () => '$two', getTs: () => 456 });
  const opened = await runtime.command('open', { id: '!room:test' }); assert.equal(opened.firstUnreadId, '$two');
  await runtime.command('visibility', { active: true }); await runtime.command('read', { id: '!room:test', eventId: '$two' });
  assert.equal(opened.firstUnreadId, '$two');
  assert.equal((await runtime.command('open', { id: '!room:test' })).firstUnreadId, null);
});
test('polls use the same SDK event encoding as the web client and reject invalid answers', async () => {
  const runtime = engine(); await runtime.command('start', session);
  await runtime.command('createPoll', { id: '!room:test', question: 'Når?', answers: ['Fredag', 'Lørdag'] });
  const sent = runtime.calls.find(item => item[0] === 'event');
  const { PollStartEvent } = require(path.join(root, '../node_modules/matrix-js-sdk/lib/extensible_events_v1/PollStartEvent.js'));
  const decoded = new PollStartEvent({ type: sent[2], content: sent[3] });
  assert.equal(decoded.question.text, 'Når?'); assert.equal(decoded.answers.length, 2);
  await assert.rejects(runtime.command('createPoll', { id: '!room:test', question: 'Når?', answers: ['Samme', 'Samme'] }), /forskjellige/);
});
test('reaction toggling removes a reaction created by another session instead of duplicating it', async () => {
  const runtime = engine(); await runtime.command('start', session);
  runtime.events.push({ getId: () => '$reaction', getSender: () => session.userId, getType: () => 'm.reaction', isRedacted: () => false, getContent: () => ({ 'm.relates_to': { rel_type: 'm.annotation', event_id: '$one', key: '👍' } }) });
  await runtime.command('react', { id: '!room:test', eventId: '$one', key: '👍' });
  assert.equal(runtime.calls.some(item => item[0] === 'redact' && item[2] === '$reaction'), true);
  assert.equal(runtime.calls.some(item => item[0] === 'event'), false);
});
test('location validation and markdown sending preserve their Matrix message types', async () => {
  const runtime = engine(); await runtime.command('start', session);
  await assert.rejects(runtime.command('location', { id: '!room:test', latitude: 100, longitude: 0 }), /Ugyldig/);
  await runtime.command('location', { id: '!room:test', latitude: 63.4, longitude: 10.4, accuracy: 10 });
  assert.equal(runtime.calls.find(item => item[0] === 'send')[2].msgtype, 'm.location');
  await runtime.command('send', { id: '!room:test', body: '**Hei**', replyTo: '$original' });
  const content = runtime.calls.filter(item => item[0] === 'send').at(-1)[2];
  assert.equal(content.format, 'org.matrix.custom.html'); assert.equal(content['org.gnomguttan.markdown'], '**Hei**');
  assert.equal(content['m.relates_to']['m.in_reply_to'].event_id, '$original');
});
test('native bubbles group consecutive messages but split across day/time/special messages', () => {
  const source = fs.readFileSync(path.join(root, 'src/utils/matrixMessages.ts'), 'utf8');
  const exports = {}; vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, { exports });
  const first = { sender: '@a:test', timestamp: new Date(2026, 9, 25, 12, 0).getTime(), body: 'one' };
  assert.equal(exports.messagesConnect(first, { ...first, timestamp: first.timestamp + 1000 }), true);
  assert.equal(exports.messagesConnect(first, { ...first, sender: '@b:test' }), false);
  assert.equal(exports.messagesConnect(first, { ...first, timestamp: first.timestamp + 301000 }), false);
  assert.equal(exports.messagesConnect(first, { ...first, sticker: true }), false);
  assert.equal(exports.messagesConnect({ ...first, timestamp: new Date(2026, 9, 25, 23, 59).getTime() }, { ...first, timestamp: new Date(2026, 9, 26, 0, 0).getTime() }), false);
  assert.equal(exports.mediaKind({ msgtype: 'm.file', media: { mimetype: 'video/mp4', name: 'clip.mp4' } }), 'video');
  assert.equal(exports.mediaKind({ msgtype: 'm.file', media: { mimetype: 'audio/ogg;codecs=opus', name: 'voice.ogg' } }), 'audio');
  assert.equal(exports.mediaKind({ msgtype: 'm.file', media: { name: 'voice.m4a' } }), 'audio');
  assert.equal(exports.mediaKind({ msgtype: 'm.file', media: { name: 'paper.pdf' } }), 'file');
});
