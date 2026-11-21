// A tiny stand-in for the VoceChat API: enough for login, auth checks, avatars and bot DMs.
// Like the real one it keeps passwords as plain text. A test user's first login sets
// their password (any will do); the app then moves it over to its own, hashed, accounts.
import http from 'node:http';
import { makeBouncingGif, makeMountainPng } from './seed-media.mjs';

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

// Channels and a few files posted in them, for the media copy (Galleri and Arkiv).
const GROUPS = [
  { gid: 1, name: 'Generelt', is_public: true, members: [] },
  { gid: 2, name: 'Hytta', is_public: true, members: [] },
  { gid: 3, name: 'Styret', is_public: false, members: [1, 2] },
];

function channelFiles() {
  const day = 24 * 3600 * 1000;
  const now = Date.now();
  const png = makeMountainPng();
  const gif = makeBouncingGif();
  const pdf = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n');
  const files = [
    { mid: 901, from_uid: 1, gid: 1, name: 'solnedgang.png', type: 'image/png', ext: 'png', body: png, at: now - 2 * day },
    { mid: 902, from_uid: 2, gid: 2, name: 'hytta-tur.png', type: 'image/png', ext: 'png', body: png, at: now - 9 * day },
    { mid: 903, from_uid: 3, gid: 2, name: 'dansing.gif', type: 'image/gif', ext: 'gif', body: gif, at: now - 40 * day },
    { mid: 904, from_uid: 1, gid: 3, name: 'styremote.png', type: 'image/png', ext: 'png', body: png, at: now - 5 * day },
    { mid: 905, from_uid: 4, gid: 1, name: 'referat.pdf', type: 'application/pdf', ext: 'pdf', body: pdf, at: now - 12 * day },
    { mid: 906, from_uid: 2, gid: -1, name: 'privat.png', type: 'image/png', ext: 'png', body: png, at: now - day },
  ];
  return files.map((f) => ({
    ...f,
    path: `2026/11/${f.mid}`,
    listing: {
      mid: f.mid, from_uid: f.from_uid, gid: f.gid, ext: f.ext, content_type: f.type, content: `2026/11/${f.mid}`,
      properties: JSON.stringify({ name: f.name, size: f.body.length, content_type: f.type }), created_at: f.at, expired: false,
    },
  }));
}

export function startFakeVoceChat({ users, port, log = console.log }) {
  const files = channelFiles();
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

    if (route === '/api/group') { json(200, GROUPS); return; }

    if (route === '/api/admin/system/files') {
      if (!byToken(token)) { json(401, {}); return; }
      json(200, url.searchParams.has('page') ? [] : files.map((f) => f.listing));
      return;
    }

    if (route === '/api/resource/file') {
      const file = files.find((f) => f.path === url.searchParams.get('file_path'));
      if (!file) { json(404, {}); return; }
      res.writeHead(200, { 'Content-Type': file.type, 'Content-Length': file.body.length });
      res.end(file.body);
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
