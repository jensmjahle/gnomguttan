// Boots the real server/index.js against an in-memory MongoDB and a fake VoceChat,
// and checks the login wiring that only exists in index.js: the middleware, token
// query parameters, legacy VoceChat tokens, rate limits and the cutoff.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { MongoMemoryServer } from 'mongodb-memory-server';

const VOCECHAT_USERS = [
  { uid: 1, name: 'Kari Nordmann', email: 'kari@test.no', password: 'karis-passord', is_admin: true },
  { uid: 2, name: 'Ola Hansen', email: 'ola@test.no', password: 'olas-passord', is_admin: false },
];

async function freePort() {
  const server = http.createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  await new Promise((resolve) => server.close(resolve));
  return port;
}

async function startVoceChat() {
  const server = http.createServer(async (req, res) => {
    const route = new URL(req.url, 'http://x').pathname;
    let raw = '';
    for await (const chunk of req) raw += chunk;
    const json = (status, body) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)); };
    if (route === '/api/token/login') {
      const { email, password } = JSON.parse(raw).credential;
      const user = VOCECHAT_USERS.find((u) => u.email === email);
      if (!user) return json(404, {});
      if (user.password !== password) return json(401, {});
      const { password: _password, ...info } = user;
      return json(200, { token: `vc-${user.uid}`, refresh_token: 'r', expired_in: 300, user: { ...info, avatar_updated_at: 1 } });
    }
    if (route === '/api/user/me') {
      const user = VOCECHAT_USERS.find((u) => req.headers['x-api-key'] === `vc-${u.uid}`);
      if (!user) return json(401, {});
      const { password: _password, ...info } = user;
      return json(200, { ...info, avatar_updated_at: 1 });
    }
    if (route.endsWith('/events')) { res.writeHead(200, { 'Content-Type': 'text/event-stream' }); res.write(': ok\n\n'); return; }
    json(200, {});
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return server;
}

async function startServer(t, memory, vocechat, extraEnv = {}) {
  const port = await freePort();
  let output = '';
  const child = spawn(process.execPath, ['server/index.js'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      NODE_ENV: 'test',
      PORT: String(port),
      MONGODB_URI: memory.getUri(),
      MONGODB_DB: `auth-routes-${port}`,
      VOCECHAT_HOST: `http://127.0.0.1:${vocechat.address().port}`,
      VOCECHAT_BOT_API_KEY: '',
      VOCECHAT_BOT_TARGET_GROUP_ID: '',
      VOCECHAT_CUTOFF: '',
      MATRIX_BOT_ENABLED: 'false',
      APP_PUBLIC_URL: 'https://gnom.test',
      GITHUB_TOKEN: '',
      GITHUB_WEBHOOK_SECRET: '',
      HOME_ASSISTANT_URL: '',
      HOME_ASSISTANT_TOKEN: '',
      JELLYFIN_HOST: '',
      ...extraEnv,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.on('data', (chunk) => { output += chunk; });
  child.stderr.on('data', (chunk) => { output += chunk; });
  t.after(() => { if (child.exitCode === null) child.kill('SIGTERM'); });

  const base = `http://127.0.0.1:${port}/app-api`;
  for (let i = 0; i < 300; i++) {
    if (await fetch(`${base}/health`).then((r) => r.ok).catch(() => false)) break;
    if (child.exitCode !== null) throw new Error(`server exited:\n${output}`);
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  const call = async (path, { method = 'GET', body, token, headers = {} } = {}) => {
    const res = await fetch(`${base}${path}`, {
      method,
      headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { 'X-API-Key': token } : {}), ...headers },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    return { status: res.status, headers: res.headers, body: text ? JSON.parse(text) : null };
  };
  return { call, base };
}

test('login routes in server/index.js', { timeout: 180000 }, async (t) => {
  const memory = await MongoMemoryServer.create({ instance: { launchTimeout: 60000 } });
  const vocechat = await startVoceChat();
  t.after(async () => { vocechat.close(); await memory.stop(); });
  const { call, base } = await startServer(t, memory, vocechat);

  await t.test('logging in gives a session that works for the API and live updates, and logging out ends it', async () => {
    const login = await call('/auth/login', { method: 'POST', body: { email: 'kari@test.no', password: 'karis-passord', remember: true } });
    assert.equal(login.status, 200);
    assert.equal(login.headers.get('cache-control'), 'no-store');
    assert.match(login.body.token, /^gns_/);
    assert.equal(login.body.vocechatLegacy, true);

    const me = await call('/me', { token: login.body.token });
    assert.equal(me.status, 200);
    assert.equal(me.body.uid, 1);
    assert.equal(me.body.isAdmin, true);

    const stream = await fetch(`${base}/feed/events?token=${encodeURIComponent(login.body.token)}`);
    assert.equal(stream.status, 200);
    await stream.body.cancel();

    const sessions = await call('/auth/sessions', { token: login.body.token });
    assert.equal(sessions.body.length, 1);
    assert.equal(sessions.body[0].current, true);
    assert.equal(sessions.body[0].remember, true);

    const out = await call('/auth/logout', { method: 'POST', token: login.body.token });
    assert.equal(out.status, 200);
    assert.equal((await call('/me', { token: login.body.token })).status, 401);
    const deadStream = await fetch(`${base}/feed/events?token=${encodeURIComponent(login.body.token)}`);
    assert.equal(deadStream.status, 401);
  });

  await t.test('VoceChat tokens still work until the cutoff, and bad tokens are refused', async () => {
    assert.equal((await call('/me', { token: 'vc-2' })).body.uid, 2);
    assert.equal((await call('/me', { token: 'gns_made-up' })).status, 401);
    assert.equal((await call('/me', { token: 'nonsense' })).status, 401);
    assert.equal((await call('/me')).status, 401);
  });

  await t.test('wrong passwords are rate limited with Retry-After, and the error is the same for unknown emails', async () => {
    const unknown = await call('/auth/login', { method: 'POST', body: { email: 'ingen@test.no', password: 'whatever1' } });
    const wrong = await call('/auth/login', { method: 'POST', body: { email: 'ola@test.no', password: 'feil-passord' } });
    assert.equal(unknown.status, 401);
    assert.deepEqual(unknown.body, wrong.body);
    for (let i = 0; i < 7; i++) await call('/auth/login', { method: 'POST', body: { email: 'ola@test.no', password: `feil-${i}` } });
    const blocked = await call('/auth/login', { method: 'POST', body: { email: 'ola@test.no', password: 'olas-passord' } });
    assert.equal(blocked.status, 429);
    assert.ok(Number(blocked.headers.get('retry-after')) > 0);
  });

  await t.test('only admins can make invite and reset links', async () => {
    const kari = (await call('/auth/login', { method: 'POST', body: { email: 'kari@test.no', password: 'karis-passord' } })).body.token;
    const ola = (await call('/me', { token: 'vc-2' })).body;
    assert.equal(ola.isAdmin, false);
    assert.equal((await call('/auth/admin/invites', { method: 'POST', token: 'vc-2', body: {} })).status, 403);
    assert.equal((await call('/auth/admin/users', { token: 'vc-2' })).status, 403);

    const invite = await call('/auth/admin/invites', { method: 'POST', token: kari, body: { note: 'Per' } });
    assert.equal(invite.status, 200);
    assert.match(invite.body.url, /^https:\/\/gnom\.test\/registrer#gni_/);
    const token = invite.body.url.split('#')[1];
    const joined = await call('/auth/register', { method: 'POST', body: { token, name: 'Per Persen', email: 'per@test.no', password: 'pers lange passord' } });
    assert.equal(joined.status, 200);
    assert.equal(joined.body.user.uid, 100000);
    assert.equal(joined.body.vocechatLegacy, true);

    const users = await call('/auth/admin/users', { token: kari });
    const per = users.body.find((u) => u.uid === 100000);
    assert.deepEqual([per.hasAccount, per.accountSource], [true, 'invite']);
    assert.equal(users.body.find((u) => u.uid === 2).hasAccount, false, 'Ola only ever used a VoceChat token');

    const reset = await call('/auth/admin/users/2/reset-link', { method: 'POST', token: kari });
    assert.match(reset.body.url, /\/tilbakestill#gnr_/);
  });
});

test('after VOCECHAT_CUTOFF only our own logins work', { timeout: 120000 }, async (t) => {
  const memory = await MongoMemoryServer.create({ instance: { launchTimeout: 60000 } });
  const vocechat = await startVoceChat();
  t.after(async () => { vocechat.close(); await memory.stop(); });
  const { call } = await startServer(t, memory, vocechat, { VOCECHAT_CUTOFF: '2020-01-01' });

  assert.equal((await call('/me', { token: 'vc-1' })).status, 401);
  const login = await call('/auth/login', { method: 'POST', body: { email: 'kari@test.no', password: 'karis-passord' } });
  assert.equal(login.status, 401, 'not migrated before the cutoff, so VoceChat is no longer asked');
});
