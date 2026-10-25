const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
function loadTs(file, mocks = {}, globals = {}) {
  const source = fs.readFileSync(path.join(root, file), 'utf8');
  const compiled = ts.transpileModule(source, {
    fileName: file,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const exports = {};
  const context = {
    exports, URL, console: { warn() {} },
    require(id) {
      assert.ok(Object.hasOwn(mocks, id), `Unexpected runtime import: ${id}`);
      const value = mocks[id];
      if (value instanceof Error) throw value;
      return value;
    },
    ...globals,
  };
  vm.runInNewContext(compiled, context, { filename: file });
  return exports;
}

test('Expo Go never evaluates notifications, even when its native topic module is missing', () => {
  // Deliberately omit the package mock: loading it would fail this test.
  const { getNotifications } = loadTs('src/services/notifications.ts', {
    expo: { isRunningInExpoGo: () => true },
  });
  assert.equal(getNotifications(), null);
  assert.equal(getNotifications(), null);
});

test('development/production builds retain the notification API', () => {
  const native = { setNotificationHandler() {}, getExpoPushTokenAsync() {} };
  const { getNotifications } = loadTs('src/services/notifications.ts', {
    expo: { isRunningInExpoGo: () => false }, 'expo-notifications': native,
  });
  assert.equal(getNotifications(), native);
  assert.equal(getNotifications(), native);
});

test('an outdated custom native build can still open the app without notifications', () => {
  const { getNotifications } = loadTs('src/services/notifications.ts', {
    expo: { isRunningInExpoGo: () => false },
    'expo-notifications': new Error('Cannot find native module ExpoTopicSubscriptionModule'),
  });
  assert.equal(getNotifications(), null);
});

test('the app entry point initializes in Expo Go without any notification native API', () => {
  const notifications = loadTs('src/services/notifications.ts', {
    expo: { isRunningInExpoGo: () => true },
  });
  const source = ts.createSourceFile('App.tsx', fs.readFileSync(path.join(root, 'App.tsx'), 'utf8'), ts.ScriptTarget.Latest, true);
  const mocks = { 'react/jsx-runtime': {} };
  for (const node of source.statements) {
    if (ts.isImportDeclaration(node) && !node.importClause?.isTypeOnly && node.moduleSpecifier.text !== 'expo-notifications') {
      mocks[node.moduleSpecifier.text] = {};
    }
  }
  Object.assign(mocks, {
    '@/services/notifications': notifications,
    'react-native': { StyleSheet: { create: styles => styles } },
    '@react-navigation/native': { createNavigationContainerRef: () => ({}) },
    '@react-navigation/native-stack': { createNativeStackNavigator: () => ({}) },
    '@react-navigation/bottom-tabs': { createBottomTabNavigator: () => ({}) },
  });
  assert.equal(typeof loadTs('App.tsx', mocks).default, 'function');
});

function sourceFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? sourceFiles(full) : /\.tsx?$/.test(entry.name) ? [full] : [];
  });
}

test('no app entry point or screen eagerly imports expo-notifications', () => {
  for (const file of [path.join(root, 'App.tsx'), ...sourceFiles(path.join(root, 'src'))]) {
    const ast = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
    const visit = node => {
      if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
          node.moduleSpecifier?.text === 'expo-notifications') {
        assert.ok(node.isTypeOnly || node.importClause?.isTypeOnly, `Eager import in ${file}`);
      }
      if (ts.isCallExpression(node) && node.expression.getText(ast) === 'require' &&
          node.arguments[0]?.text === 'expo-notifications') {
        assert.equal(file, path.join(root, 'src', 'services', 'notifications.ts'));
      }
      ts.forEachChild(node, visit);
    };
    visit(ast);
  }
});

const mobile = loadTs('src/utils/mobileChat.ts');
test('chat navigation accepts query/hash URLs but rejects other origins and paths', () => {
  const base = 'https://gnomguttan.no/mobile-chat';
  for (const url of [base, `${base}?a=1`, `${base}#room`, `${base}/`]) {
    assert.equal(mobile.isChatDocument(url, base), true, url);
  }
  for (const url of ['https://gnomguttan.no.evil/mobile-chat', 'https://evil.test/mobile-chat',
    'http://gnomguttan.no/mobile-chat', `${base}-other`, 'about:blank', 'invalid']) {
    assert.equal(mobile.isChatDocument(url, base), false, url);
  }
});

test('message alerts are hidden only while that room is actually visible', () => {
  const data = { eventId: '$event', roomId: '!room' };
  assert.equal(mobile.shouldPresentMessage(data, { activeRoom: '!room', chatVisible: true }, true), false);
  // Gallery/settings can be foregrounded with the same room still selected in the WebView.
  assert.equal(mobile.shouldPresentMessage(data, { activeRoom: '!room', chatVisible: false }, true), true);
  assert.equal(mobile.shouldPresentMessage(data, { activeRoom: '!room', chatVisible: true }, false), true);
  assert.equal(mobile.shouldPresentMessage(data, { activeRoom: '!other', chatVisible: true }, true), true);
  assert.equal(mobile.shouldPresentMessage(undefined, { activeRoom: null, chatVisible: false }, true), false);
});

function sessionHarness(fetch) {
  let state = { user: { uid: 1, name: 'First' }, token: 'old', refreshToken: 'old-refresh', expiresAt: 0 };
  const store = { getState: () => ({ ...state,
    setAuth: session => { state = { ...state, ...session }; },
    clearAuth: () => { state = { user: null, token: null, refreshToken: null, expiresAt: null }; },
  }) };
  const api = loadTs('src/services/session.ts', {
    '@/config': { config: { vocechatHost: 'https://test.invalid' } },
    '@/store/authStore': { useAuthStore: store },
  }, { fetch });
  return { api, state: () => state, switchUser: () => {
    state = { user: { uid: 2, name: 'Second' }, token: 'new-login', refreshToken: 'new-refresh', expiresAt: 0 };
  } };
}

for (const status of [200, 401, 403]) {
  test(`a late refresh (${status}) cannot overwrite or log out a newer login`, async () => {
    let resolve;
    const harness = sessionHarness(() => new Promise(done => { resolve = done; }));
    const pending = harness.api.refreshVoceChatToken(true);
    harness.switchUser();
    resolve({ ok: status === 200, status, json: async () => ({ token: 'old-renewed', refresh_token: 'old-refresh', expired_in: 3600 }) });
    assert.equal(await pending, false);
    assert.equal(harness.state().token, 'new-login');
    assert.equal(harness.state().user.uid, 2);
  });
}

test('concurrent refresh calls share one request for the same login', async () => {
  let calls = 0;
  let resolve;
  const harness = sessionHarness(() => { calls++; return new Promise(done => { resolve = done; }); });
  const first = harness.api.refreshVoceChatToken(true);
  const second = harness.api.refreshVoceChatToken(true);
  assert.equal(calls, 1);
  resolve({ ok: true, json: async () => ({ token: 'renewed', refresh_token: 'refresh', expired_in: 3600 }) });
  assert.equal(await first, true);
  assert.equal(await second, true);
  assert.equal(harness.state().token, 'renewed');
});

test('a newer login can refresh while the previous account still has a pending request', async () => {
  const requests = [];
  const harness = sessionHarness(() => new Promise(resolve => requests.push(resolve)));
  const old = harness.api.refreshVoceChatToken(true);
  harness.switchUser();
  const current = harness.api.refreshVoceChatToken(true);
  assert.equal(requests.length, 2);
  requests[0]({ ok: false, status: 401 });
  assert.equal(await old, false);
  requests[1]({ ok: true, json: async () => ({ token: 'second-renewed', refresh_token: 'second-refresh', expired_in: 3600 }) });
  assert.equal(await current, true);
  assert.equal(harness.state().token, 'second-renewed');
  assert.equal(harness.state().user.uid, 2);
});
