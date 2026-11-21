// A tiny stand-in for the VoceChat API: enough for login, auth checks, avatars and bot DMs.
// Like the real one it keeps passwords as plain text. A test user's first login sets
// their password (any will do); the app then moves it over to its own, hashed, accounts.
import http from 'node:http';

const COLORS = ['#6366f1', '#f59e0b', '#22c55e', '#ec4899', '#3b82f6', '#14b8a6', '#ef4444'];

function initials(name) {
  return name.split(/\s+/).slice(0, 2).map((word) => word[0]?.toUpperCase() ?? '').join('');
}

function userInfo(user) {
  return {
    uid: user.uid,
    email: user.email,
    name: user.name,
    gender: 0,
    language: 'nb',
    is_admin: Boolean(user.isAdmin),
    is_bot: false,
    avatar_updated_at: 1,
    create_by: 'sandbox',
    msg_smtp_notify_enable: false,
  };
}

export function startFakeVoceChat({ users, port, log = console.log }) {
  const byToken = (token) => users.find((user) => token === `sandbox-${user.uid}`);

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const route = url.pathname;
    let raw = '';
    for await (const chunk of req) raw += chunk;

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-API-Key');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

    const json = (status, body) => {
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(body));
    };
    const token = req.headers['x-api-key'] || url.searchParams.get('api-key') || '';

    if (route === '/api/token/login' && req.method === 'POST') {
      const credential = JSON.parse(raw || '{}')?.credential ?? {};
      const email = String(credential.email ?? '').trim().toLowerCase();
      const user = users.find((entry) => entry.email === email);
      if (!user) { json(404, { reason: 'Ukjent testbruker' }); return; }
      if (user.password && user.password !== credential.password) { json(401, { reason: 'Feil passord' }); return; }
      user.password ??= credential.password;
      log(`[fake-vocechat] ${user.name} logged in`);
      json(200, { server_id: 'sandbox', token: `sandbox-${user.uid}`, refresh_token: `refresh-${user.uid}`, expired_in: 30 * 24 * 3600, user: userInfo(user) });
      return;
    }

    if (route === '/api/token/logout') { json(200, {}); return; }

    if (route === '/api/user/change_password' && req.method === 'POST') {
      const user = byToken(token);
      const body = JSON.parse(raw || '{}');
      if (!user) { json(401, {}); return; }
      if (user.password && user.password !== body.old_password) { json(403, {}); return; }
      user.password = body.new_password;
      log(`[fake-vocechat] ${user.name} changed their VoceChat password`);
      json(200, {});
      return;
    }

    if (route === '/api/token/renew' && req.method === 'POST') {
      const body = JSON.parse(raw || '{}');
      if (!byToken(body.token)) { json(401, {}); return; }
      json(200, { token: body.token, refresh_token: body.refresh_token, expired_in: 30 * 24 * 3600 });
      return;
    }

    if (route === '/api/resource/avatar') {
      const user = users.find((entry) => entry.uid === Number(url.searchParams.get('uid')));
      const label = user ? initials(user.name) : '?';
      const color = COLORS[(user?.uid ?? 0) % COLORS.length];
      res.writeHead(200, { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'max-age=3600' });
      res.end(`<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96"><rect width="96" height="96" fill="${color}"/><text x="50%" y="50%" dy=".35em" text-anchor="middle" font-family="Helvetica,Arial,sans-serif" font-size="38" font-weight="700" fill="#fff">${label}</text></svg>`);
      return;
    }

    if (route.endsWith('/events')) {
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' });
      res.write(': sandbox\n\n');
      const heartbeat = setInterval(() => res.write(': heartbeat\n\n'), 20000);
      req.on('close', () => clearInterval(heartbeat));
      return;
    }

    if (route.startsWith('/api/bot/send_to_user/')) {
      const user = users.find((entry) => entry.uid === Number(route.split('/').pop()));
      log(`[fake-vocechat] 📨 bot DM to ${user?.name ?? route.split('/').pop()}:\n    ${raw.replace(/\n/g, '\n    ')}`);
      json(200, 1);
      return;
    }

    if (route.startsWith('/api/bot/send_to_group/')) {
      log(`[fake-vocechat] bot group message: ${raw.slice(0, 120)}`);
      json(200, 1);
      return;
    }

    if (route === '/api/user/me') {
      const user = byToken(token);
      if (!user) { json(401, {}); return; }
      json(200, userInfo(user));
      return;
    }

    if (route === '/api/user') { json(200, users.map(userInfo)); return; }

    const userMatch = route.match(/^\/api\/user\/(\d+)$/);
    if (userMatch) {
      const user = users.find((entry) => entry.uid === Number(userMatch[1]));
      if (user) json(200, userInfo(user)); else json(404, {});
      return;
    }

    json(200, req.method === 'GET' ? [] : {});
  });

  return new Promise((resolve) => server.listen(port, '127.0.0.1', () => resolve(server)));
}
