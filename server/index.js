import 'dotenv/config';
import express from 'express';
import { randomUUID, createHmac, timingSafeEqual } from 'node:crypto';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import {
  HomeAssistantError,
  getHomeAssistantEntityState,
  getHomeAssistantEntityId,
  toggleHomeAssistantEntity,
} from './homeAssistant.js';
import { startCommunityEventReminderScheduler } from './communityEventReminders.js';
import { buildRuntimeEnvJs } from './runtime.js';
import { COLLECTIONS, closeDatabase, ensureIndexes, getDatabase } from './mongo.js';
import { writeFeedItem, sanitizeFeedDocument } from './feed.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const distDir = path.join(rootDir, 'dist');

const port = Number(process.env.PORT ?? 3001);
const vocechatHost = trimTrailingSlash(process.env.VOCECHAT_HOST ?? 'https://chat.gnomguttan.no');
const jellyfinHost = trimTrailingSlash(process.env.JELLYFIN_HOST ?? '');
const jellyfinToken = process.env.JELLYFIN_TOKEN?.trim() ?? '';
const botApiKey = process.env.VOCECHAT_BOT_API_KEY?.trim() ?? '';
const botTargetGroupId = process.env.VOCECHAT_BOT_TARGET_GROUP_ID?.trim() ?? '';
const githubWebhookSecret = process.env.GITHUB_WEBHOOK_SECRET?.trim() ?? '';
const isProduction = process.env.NODE_ENV === 'production';
let stopCommunityEventReminderScheduler = () => {};

const app = express();
app.disable('x-powered-by');

const meowClients = new Set();
const feedClients = new Set();

const authCache = new Map();
const AUTH_CACHE_TTL_MS = 60_000;
const INFO_MESSAGE = 'Det er opprettet et arrangement som du m\u00e5 inn og svare p\u00e5 gnomguttan.no.';

function buildEventAnnouncementMessage(event) {
  const title = typeof event?.title === 'string' && event.title.trim() ? event.title.trim() : 'Et arrangement';
  return `${title} ble opprettet på gnomguttan.no. GÅ INN og SVAR om du KOMMER!`;
}

app.get('/env.js', (_req, res) => {
  res.status(200);
  res.setHeader('Content-Type', 'application/javascript');
  res.setHeader('Cache-Control', 'no-store');
  res.end(buildRuntimeEnvJs());
});

app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

app.use('/bot', async (req, res) => {
  if (!botApiKey) {
    res.status(503).json({ error: 'Bot proxy is not configured.' });
    return;
  }

  try {
    const target = new URL(req.originalUrl.replace(/^\/bot/, '/api/bot'), vocechatHost);
    await proxyRequest(req, res, target, {
      'X-API-Key': botApiKey,
    });
  } catch (error) {
    console.error('[Proxy] Bot request failed', error);
    if (!res.headersSent) {
      res.status(502).json({ error: 'Bot proxy request failed.' });
    }
  }
});

app.use('/jellyfin', async (req, res) => {
  if (!jellyfinHost) {
    res.status(503).json({ error: 'Jellyfin proxy is not configured.' });
    return;
  }

  try {
    const target = new URL(req.originalUrl.replace(/^\/jellyfin/, '') || '/', jellyfinHost);
    await proxyRequest(req, res, target, {
      'X-Emby-Token': jellyfinToken,
    });
  } catch (error) {
    console.error('[Proxy] Jellyfin request failed', error);
    if (!res.headersSent) {
      res.status(502).json({ error: 'Jellyfin proxy request failed.' });
    }
  }
});

const appApi = express.Router();
appApi.get('/health', (_req, res) => {
  res.json({ ok: true });
});

// SSE subscription — before authMiddleware because EventSource can't send custom headers.
// Token is passed as a query parameter instead.
appApi.get('/meow/events', async (req, res) => {
  const ip = req.ip ?? req.socket?.remoteAddress ?? 'unknown';
  const token = typeof req.query.token === 'string' ? req.query.token.trim() : '';

  if (!token) {
    console.error(`[Meow] Unauthorized SSE connection attempt from ${ip} — missing token`);
    res.status(401).json({ error: 'Missing token.' });
    return;
  }

  let user;
  try {
    user = await resolveCurrentUser(token);
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      console.error(`[Meow] Unauthorized SSE connection attempt from ${ip} — invalid token`);
      res.status(401).json({ error: 'Invalid token.' });
      return;
    }
    console.error(`[Meow] Auth unavailable during SSE connect from ${ip}`, error);
    res.status(503).json({ error: 'Auth unavailable.' });
    return;
  }

  console.log(`[Meow] ${user.name} connected (${meowClients.size + 1} listeners)`);

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.socket?.setNoDelay(true);
  res.flushHeaders();

  meowClients.add(res);

  const heartbeat = setInterval(() => {
    try { res.write(':heartbeat\n\n'); } catch { cleanup(); }
  }, 25000);

  function cleanup() {
    clearInterval(heartbeat);
    meowClients.delete(res);
    console.log(`[Meow] ${user.name} disconnected (${meowClients.size} listeners)`);
  }

  req.on('close', cleanup);
});

// Feed SSE — before authMiddleware; token passed as query param (EventSource can't send headers)
appApi.get('/feed/events', async (req, res) => {
  const token = typeof req.query.token === 'string' ? req.query.token.trim() : '';

  if (!token) {
    res.status(401).json({ error: 'Missing token.' });
    return;
  }

  try {
    await resolveCurrentUser(token);
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      res.status(401).json({ error: 'Invalid token.' });
      return;
    }
    res.status(503).json({ error: 'Auth unavailable.' });
    return;
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.socket?.setNoDelay(true);
  res.flushHeaders();

  feedClients.add(res);

  const heartbeat = setInterval(() => {
    try { res.write(':heartbeat\n\n'); } catch { cleanup(); }
  }, 25000);

  function cleanup() {
    clearInterval(heartbeat);
    feedClients.delete(res);
  }

  req.on('close', cleanup);
});

// GitHub webhook — raw body needed for HMAC verification, no auth required
appApi.post('/webhooks/github', express.raw({ type: '*/*', limit: '1mb' }), handleGithubWebhook);

appApi.use(express.json({ limit: '1mb' }));
appApi.use(authMiddleware);

appApi.get('/me', (req, res) => {
  res.json(req.currentUser);
});

appApi.get('/feed', async (req, res) => {
  const limitRaw = parseInt(req.query.limit, 10);
  const limit = Math.min(Number.isFinite(limitRaw) && limitRaw > 0 ? limitRaw : 20, 50);
  const before = typeof req.query.before === 'string' ? Number(req.query.before) : undefined;

  const db = await getDatabase();
  const filter = before !== undefined && !Number.isNaN(before) ? { createdAt: { $lt: before } } : {};
  const raw = await db.collection(COLLECTIONS.feed)
    .find(filter)
    .sort({ createdAt: -1 })
    .limit(limit + 1)
    .toArray();

  const hasMore = raw.length > limit;
  res.json({
    items: raw.slice(0, limit).map(sanitizeFeedDocument),
    hasMore,
  });
});

appApi.get('/users', async (_req, res) => {
  const db = await getDatabase();
  const users = await db
    .collection(COLLECTIONS.users)
    .find({ name: { $exists: true, $ne: '' } })
    .project({ uid: 1, name: 1 })
    .sort({ name: 1, uid: 1 })
    .toArray();

  res.json(users.map(({ uid, name }) => ({ uid, name })));
});

appApi.get('/community-events', async (_req, res) => {
  const db = await getDatabase();
  const events = await db.collection(COLLECTIONS.events).find({}).sort({ startsAt: 1, createdAt: -1 }).toArray();
  res.json(events.map(sanitizeEventDocument));
});

appApi.post('/community-events', async (req, res) => {
  const currentUser = req.currentUser;
  const payload = req.body ?? {};
  const title = typeof payload.title === 'string' ? payload.title.trim() : '';
  const startsAt = typeof payload.startsAt === 'string' ? payload.startsAt.trim() : '';
  const location = typeof payload.location === 'string' ? payload.location.trim() : '';
  const description = typeof payload.description === 'string' ? payload.description.trim() : '';

  if (!title) {
    res.status(400).json({ error: 'Title is required.' });
    return;
  }

  const parsedStartsAt = new Date(startsAt);
  if (Number.isNaN(parsedStartsAt.getTime())) {
    res.status(400).json({ error: 'A valid startsAt date is required.' });
    return;
  }

  const event = {
    id: randomUUID(),
    title,
    startsAt: parsedStartsAt.toISOString(),
    location: location || undefined,
    description: description || undefined,
    createdAt: Date.now(),
    createdBy: {
      uid: currentUser.uid,
      name: currentUser.name,
    },
    responses: [],
  };

  const db = await getDatabase();
  await db.collection(COLLECTIONS.events).insertOne(event);
  // insertOne mutates `event` by injecting _id — snapshot a clean copy before using it further
  const cleanEvent = sanitizeEventDocument(event);

  if (botApiKey && botTargetGroupId) {
    void announceEventCreated(cleanEvent).catch((error) => {
      console.error('[Bot] Failed to announce event creation', error);
    });
  }

  void writeFeedItem({
    type: 'community_event_created',
    source: 'internal',
    payload: cleanEvent,
    actorUid: currentUser.uid,
    actorName: currentUser.name,
  }).then(broadcastFeedItem).catch((error) => {
    console.error('[Feed] Failed to write event feed item', error);
  });

  res.status(201).json(cleanEvent);
});

appApi.post('/community-events/:eventId/respond', async (req, res) => {
  const { eventId } = req.params;
  const payload = req.body ?? {};
  const status = typeof payload.status === 'string' ? payload.status.trim() : '';

  if (!['coming', 'maybe', 'cannot'].includes(status)) {
    res.status(400).json({ error: 'Invalid RSVP status.' });
    return;
  }

  const db = await getDatabase();
  const collection = db.collection(COLLECTIONS.events);
  const existing = await collection.findOne({ id: eventId });

  if (!existing) {
    res.status(404).json({ error: 'Event not found.' });
    return;
  }

  const remainingResponses = Array.isArray(existing.responses)
    ? existing.responses.filter((response) => response.uid !== req.currentUser.uid)
    : [];

  const updatedEvent = {
    ...existing,
    responses: [
      ...remainingResponses,
      {
        uid: req.currentUser.uid,
        name: req.currentUser.name,
        status,
        respondedAt: Date.now(),
      },
    ],
  };

  await collection.updateOne(
    { id: eventId },
    {
      $set: {
        responses: updatedEvent.responses,
      },
    }
  );

  res.json(sanitizeEventDocument(updatedEvent));
});

appApi.get('/home-assistant/entity', handleHomeAssistantEntityRead);
appApi.get('/home-assistant/light', handleHomeAssistantEntityRead);
appApi.post('/home-assistant/entity/toggle', handleHomeAssistantEntityToggle);
appApi.post('/home-assistant/light/toggle', handleHomeAssistantEntityToggle);

appApi.post('/meow', (req, res) => {
  console.log(`[Meow] ${req.currentUser.name} triggered a meow (${meowClients.size} listeners)`);
  const payload = `data: meow\n\n`;
  for (const client of meowClients) {
    try { client.write(payload); } catch { meowClients.delete(client); }
  }
  res.json({ ok: true, listeners: meowClients.size });
});

appApi.get('/overheard', async (_req, res) => {
  const db = await getDatabase();
  const quotes = await db.collection(COLLECTIONS.overheard).find({}).sort({ createdAt: 1, id: 1 }).toArray();
  res.json(quotes.map(sanitizeOverheardDocument));
});

appApi.post('/overheard', async (req, res) => {
  const payload = req.body ?? {};
  const text = typeof payload.text === 'string' ? payload.text.trim() : '';
  const author = typeof payload.author === 'string' ? payload.author.trim() : '';

  if (!text || !author) {
    res.status(400).json({ error: 'Text and author are required.' });
    return;
  }

  const quote = {
    id: randomUUID(),
    text,
    author,
    createdAt: Date.now(),
    createdBy: {
      uid: req.currentUser.uid,
      name: req.currentUser.name,
    },
  };

  const db = await getDatabase();
  await db.collection(COLLECTIONS.overheard).insertOne(quote);
  const cleanQuote = sanitizeOverheardDocument(quote);

  void writeFeedItem({
    type: 'overheard_added',
    source: 'internal',
    payload: cleanQuote,
    actorUid: req.currentUser.uid,
    actorName: req.currentUser.name,
  }).then(broadcastFeedItem).catch((error) => {
    console.error('[Feed] Failed to write overheard feed item', error);
  });

  res.status(201).json(cleanQuote);
});

app.use('/app-api', appApi);

if (existsSync(distDir)) {
  app.use(express.static(distDir, { index: false }));
  app.get(/.*/, (_req, res) => {
    res.sendFile(path.join(distDir, 'index.html'));
  });
}

app.use((_req, res) => {
  res.status(404).json({ error: 'Not found.' });
});

async function main() {
  if (!githubWebhookSecret && isProduction) {
    console.warn('[GitHub Webhook] GITHUB_WEBHOOK_SECRET is not set — webhook endpoint will refuse all requests in production.');
  }
  await ensureIndexes();
  stopCommunityEventReminderScheduler = startCommunityEventReminderScheduler({
    getDatabase,
    vocechatHost,
    botApiKey,
  });
  app.listen(port, '0.0.0.0', () => {
    console.log(`[server] listening on ${port}`);
  });
}

main().catch((error) => {
  console.error('[server] failed to start', error);
  process.exit(1);
});

process.on('SIGINT', async () => {
  stopCommunityEventReminderScheduler();
  for (const client of meowClients) { try { client.end(); } catch {} }
  meowClients.clear();
  for (const client of feedClients) { try { client.end(); } catch {} }
  feedClients.clear();
  await closeDatabase().catch(() => {});
  process.exit(0);
});

process.on('SIGTERM', async () => {
  stopCommunityEventReminderScheduler();
  for (const client of meowClients) { try { client.end(); } catch {} }
  meowClients.clear();
  for (const client of feedClients) { try { client.end(); } catch {} }
  feedClients.clear();
  await closeDatabase().catch(() => {});
  process.exit(0);
});

async function authMiddleware(req, res, next) {
  const isHomeAssistantRequest = req.originalUrl.startsWith('/app-api/home-assistant/');
  if (isHomeAssistantRequest) {
    console.log(`[HomeAssistant] Incoming ${req.method} ${req.originalUrl}`);
  }

  const apiKey = req.get('X-API-Key')?.trim();
  if (!apiKey) {
    if (isHomeAssistantRequest) {
      console.error('[HomeAssistant] Missing X-API-Key on request to app backend.');
    }
    res.status(401).json({ error: 'Missing X-API-Key header.' });
    return;
  }

  try {
    const currentUser = await resolveCurrentUser(apiKey);
    req.currentUser = currentUser;
    res.locals.currentUser = currentUser;

    const db = await getDatabase();
    await upsertUser(db, currentUser);

    next();
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      if (isHomeAssistantRequest) {
        console.error('[HomeAssistant] Invalid VoceChat token while serving Home Assistant request.');
      }
      res.status(401).json({ error: 'Invalid VoceChat token.' });
      return;
    }

    console.error('[Auth] Failed to resolve current user', error);
    res.status(503).json({ error: 'VoceChat authentication unavailable.' });
  }
}

async function resolveCurrentUser(apiKey) {
  const cached = authCache.get(apiKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.user;
  }

  if (!vocechatHost) {
    throw new Error('VoceChat host is not configured.');
  }

  const response = await fetch(`${vocechatHost}/api/user/me`, {
    headers: {
      'X-API-Key': apiKey,
    },
  });

  if (response.status === 401 || response.status === 403) {
    throw new UnauthorizedError();
  }

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(body || `VoceChat user lookup failed (${response.status})`);
  }

  const payload = await response.json();
  const user = normalizeVoceChatUser(payload);
  authCache.set(apiKey, {
    user,
    expiresAt: Date.now() + AUTH_CACHE_TTL_MS,
  });
  return user;
}

async function upsertUser(db, user) {
  await db.collection(COLLECTIONS.users).updateOne(
    { uid: user.uid },
    {
      $set: {
        uid: user.uid,
        name: user.name,
        email: user.email ?? '',
        avatarUpdatedAt: user.avatarUpdatedAt ?? 0,
        isAdmin: Boolean(user.isAdmin),
        lastSeenAt: Date.now(),
      },
      $setOnInsert: {
        createdAt: Date.now(),
      },
    },
    {
      upsert: true,
    }
  );
}

function normalizeVoceChatUser(payload) {
  return {
    uid: Number(payload.uid),
    name: String(payload.name ?? ''),
    email: String(payload.email ?? ''),
    avatarUpdatedAt: Number(payload.avatar_updated_at ?? 0),
    isAdmin: Boolean(payload.is_admin),
    isBot: Boolean(payload.is_bot),
  };
}

function sanitizeEventDocument(document) {
  const { _id, reminderSentTokens, ...rest } = document;
  return rest;
}

function sanitizeOverheardDocument(document) {
  const { _id, ...rest } = document;
  return rest;
}

async function handleHomeAssistantEntityRead(_req, res) {
  try {
    console.log(`[HomeAssistant] Read request for ${getHomeAssistantEntityId()}`);
    const entity = await getHomeAssistantEntityState();
    res.setHeader('Cache-Control', 'no-store');
    res.json(entity);
  } catch (error) {
    respondHomeAssistantError(res, error, 'Kunne ikke hente status.');
  }
}

async function handleHomeAssistantEntityToggle(_req, res) {
  try {
    console.log(`[HomeAssistant] Toggle request for ${getHomeAssistantEntityId()}`);
    const entity = await toggleHomeAssistantEntity();
    res.setHeader('Cache-Control', 'no-store');
    res.json(entity);
  } catch (error) {
    respondHomeAssistantError(res, error, 'Kunne ikke bytte status.');
  }
}

function broadcastFeedItem(item) {
  if (feedClients.size === 0) return;
  const payload = `data: ${JSON.stringify(item)}\n\n`;
  for (const client of feedClients) {
    try { client.write(payload); } catch { feedClients.delete(client); }
  }
}

async function handleGithubWebhook(req, res) {
  if (!githubWebhookSecret) {
    if (isProduction) {
      res.status(503).json({ error: 'Webhook not configured.' });
      return;
    }
    console.warn('[GitHub Webhook] GITHUB_WEBHOOK_SECRET is not set — skipping signature verification (dev only).');
  }

  const rawBody = req.body; // Buffer (express.raw middleware)
  const signature = req.get('X-Hub-Signature-256') ?? '';
  const event = req.get('X-GitHub-Event') ?? '';

  if (githubWebhookSecret) {
    const expected = Buffer.from(`sha256=${createHmac('sha256', githubWebhookSecret).update(rawBody).digest('hex')}`);
    const actual = Buffer.from(signature);
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
      res.status(401).json({ error: 'Invalid signature.' });
      return;
    }
  }

  let payload;
  try {
    payload = JSON.parse(rawBody.toString('utf8'));
  } catch {
    res.status(400).json({ error: 'Invalid JSON.' });
    return;
  }

  const repo = typeof payload.repository?.full_name === 'string' ? payload.repository.full_name : 'unknown';

  try {
    if (event === 'issues') {
      const action = payload.action;
      if (action === 'opened' || action === 'closed' || action === 'reopened') {
        broadcastFeedItem(await writeFeedItem({
          type: `github_issue_${action}`,
          source: 'github',
          payload: {
            repo,
            number: payload.issue?.number,
            title: payload.issue?.title ?? '',
            url: payload.issue?.html_url ?? '',
            user: payload.issue?.user?.login ?? '',
            userAvatarUrl: payload.issue?.user?.avatar_url ?? '',
            body: typeof payload.issue?.body === 'string' ? payload.issue.body.slice(0, 500) : undefined,
            action,
          },
        }));
      }
    } else if (event === 'pull_request') {
      const action = payload.action;
      if (action === 'opened' || action === 'closed' || action === 'reopened') {
        const merged = payload.pull_request?.merged === true;
        const feedType = action === 'closed' && merged ? 'github_pr_merged' : `github_pr_${action}`;
        broadcastFeedItem(await writeFeedItem({
          type: feedType,
          source: 'github',
          payload: {
            repo,
            number: payload.pull_request?.number,
            title: payload.pull_request?.title ?? '',
            url: payload.pull_request?.html_url ?? '',
            user: payload.pull_request?.user?.login ?? '',
            userAvatarUrl: payload.pull_request?.user?.avatar_url ?? '',
            body: typeof payload.pull_request?.body === 'string' ? payload.pull_request.body.slice(0, 500) : undefined,
            action,
            merged,
          },
        }));
      }
    }
  } catch (error) {
    // Log but always return 200 so GitHub doesn't retry
    console.error('[GitHub Webhook] Failed to write feed item', error);
  }

  res.json({ ok: true });
}

async function announceEventCreated(event) {
  if (!botApiKey || !botTargetGroupId) {
    return;
  }

  const response = await fetch(`${vocechatHost}/api/bot/send_to_group/${botTargetGroupId}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'text/plain',
      'X-API-Key': botApiKey,
    },
    body: buildEventAnnouncementMessage(event),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(body || `Bot announcement failed (${response.status})`);
  }
}

async function proxyRequest(req, res, targetUrl, extraHeaders = {}) {
  const method = req.method ?? 'GET';
  const headers = buildForwardHeaders(req, extraHeaders);
  const init = {
    method,
    headers,
    redirect: 'manual',
  };

  if (!['GET', 'HEAD'].includes(method.toUpperCase())) {
    init.body = await readRequestBody(req);
  }

  const upstream = await fetch(targetUrl, init);
  res.status(upstream.status);

  for (const [key, value] of upstream.headers) {
    if (!isHopByHopHeader(key)) {
      res.setHeader(key, value);
    }
  }

  if (!upstream.body) {
    res.end();
    return;
  }

  Readable.fromWeb(upstream.body).pipe(res);
}

function buildForwardHeaders(req, extraHeaders) {
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (value === undefined || value === null) {
      continue;
    }

    if (isHopByHopHeader(key) || key.toLowerCase() === 'content-length') {
      continue;
    }

    if (key.toLowerCase() === 'host') {
      continue;
    }

    if (Array.isArray(value)) {
      headers.set(key, value.join(','));
    } else {
      headers.set(key, String(value));
    }
  }

  for (const [key, value] of Object.entries(extraHeaders)) {
    if (value !== undefined && value !== null) {
      headers.set(key, String(value));
    }
  }

  return headers;
}

async function readRequestBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  return Buffer.concat(chunks);
}

function trimTrailingSlash(value) {
  return value.replace(/\/+$/, '');
}

function respondHomeAssistantError(res, error, fallbackMessage) {
  if (error instanceof HomeAssistantError) {
    res.status(error.status).send(error.message);
    return;
  }

  console.error('[HomeAssistant] request failed', error);
  if (!res.headersSent) {
    res.status(502).send(fallbackMessage);
  }
}

function isHopByHopHeader(name) {
  const lower = name.toLowerCase();
  return [
    'connection',
    'keep-alive',
    'proxy-authenticate',
    'proxy-authorization',
    'te',
    'trailer',
    'transfer-encoding',
    'upgrade',
  ].includes(lower);
}

class UnauthorizedError extends Error {
  constructor() {
    super('Unauthorized');
    this.name = 'UnauthorizedError';
  }
}

export {};
