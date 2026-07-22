import { COLLECTIONS } from './mongo.js';

const EXPO_PUSH_ENDPOINT = 'https://exp.host/--/api/v2/push/send';
const PUSH_TOKEN_PATTERN = /^Expo(nent)?PushToken\[[^\]]+\]$/;
const BRIDGE_STATE_KEY = 'vocechat-chat-push';
const RECONNECT_DELAY_MS = 5000;
const STARTUP_QUIET_MS = 3000;
const USER_CACHE_TTL_MS = 5 * 60 * 1000;
const GROUP_CACHE_TTL_MS = 60 * 1000;
const MAX_BODY_LENGTH = 180;
const EXPO_BATCH_SIZE = 100;

export function registerPushNotificationRoutes(router, { getDatabase, vocechatHost, chatPushEnabled }) {
  router.post('/notifications/push-token', async (req, res) => {
    const token = normalizePushToken(req.body?.token);
    if (!token) {
      res.status(400).json({ error: 'Invalid Expo push token.' });
      return;
    }

    const now = Date.now();
    const platform = normalizeSmallString(req.body?.platform, 32);
    const deviceName = normalizeSmallString(req.body?.deviceName, 120);
    const groupIds = await fetchUserGroupIds(vocechatHost, req.apiKey).catch((error) => {
      console.warn('[Push] Failed to refresh group subscriptions for user', req.currentUser?.uid, error);
      return null;
    });

    const set = {
      token,
      uid: req.currentUser.uid,
      userName: req.currentUser.name,
      updatedAt: now,
    };
    if (platform) set.platform = platform;
    if (deviceName) set.deviceName = deviceName;
    if (groupIds) set.groupIds = groupIds;

    const db = await getDatabase();
    await db.collection(COLLECTIONS.pushTokens).updateOne(
      { token },
      {
        $set: set,
        $unset: { disabledAt: '', disabledReason: '' },
        $setOnInsert: { createdAt: now },
      },
      { upsert: true },
    );

    res.json({ ok: true, chatPushEnabled: Boolean(chatPushEnabled) });
  });

  router.post('/notifications/push-token/unregister', async (req, res) => {
    const token = normalizePushToken(req.body?.token);
    if (!token) {
      res.status(400).json({ error: 'Invalid Expo push token.' });
      return;
    }

    const db = await getDatabase();
    await db.collection(COLLECTIONS.pushTokens).updateOne(
      { token, uid: req.currentUser.uid },
      {
        $set: {
          disabledAt: Date.now(),
          disabledReason: 'client_unregister',
        },
      },
    );

    res.json({ ok: true });
  });
}

export function startVoceChatPushBridge({ getDatabase, vocechatHost, botApiKey }) {
  if (!botApiKey) {
    console.warn('[Push] VOCECHAT_BOT_API_KEY is not set; chat background push is disabled.');
    return () => {};
  }

  let stopped = false;
  let reconnectTimer = null;
  let abortController = null;
  let startupQuietTimer = null;
  let suppressingInitialBacklog = false;
  let lastProcessedMid = 0;
  let userCache = new Map();
  let groupCache = { expiresAt: 0, groupsById: new Map() };

  const stop = () => {
    stopped = true;
    if (reconnectTimer) clearTimeout(reconnectTimer);
    if (startupQuietTimer) clearTimeout(startupQuietTimer);
    abortController?.abort();
  };

  const scheduleReconnect = () => {
    if (stopped) return;
    if (reconnectTimer) clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      void connect();
    }, RECONNECT_DELAY_MS);
  };

  const markProcessed = async (db, mid) => {
    if (!Number.isFinite(mid) || mid <= lastProcessedMid) return;
    lastProcessedMid = mid;
    await db.collection(COLLECTIONS.pushState).updateOne(
      { key: BRIDGE_STATE_KEY },
      {
        $max: { lastProcessedMid: mid },
        $set: { updatedAt: Date.now() },
        $setOnInsert: { key: BRIDGE_STATE_KEY, createdAt: Date.now() },
      },
      { upsert: true },
    );
  };

  const finishInitialBacklog = () => {
    suppressingInitialBacklog = false;
    console.log(`[Push] VoceChat bridge caught up at mid ${lastProcessedMid}.`);
  };

  const scheduleStartupQuiet = () => {
    if (!suppressingInitialBacklog) return;
    if (startupQuietTimer) clearTimeout(startupQuietTimer);
    startupQuietTimer = setTimeout(finishInitialBacklog, STARTUP_QUIET_MS);
  };

  const handleEvent = async (db, event) => {
    if (!event || event.type !== 'chat') return;
    const mid = Number(event.mid);
    if (!Number.isFinite(mid) || mid <= lastProcessedMid) return;

    if (suppressingInitialBacklog) {
      await markProcessed(db, mid);
      scheduleStartupQuiet();
      return;
    }

    try {
      if (isNotifiableChatEvent(event)) {
        await sendPushForChatEvent(db, event, {
          vocechatHost,
          botApiKey,
          getUserName: (uid) => getUserName(uid),
          getGroupName: (gid) => getGroupName(gid),
        });
      }
    } catch (error) {
      console.error('[Push] Failed to process chat event', mid, error);
    } finally {
      await markProcessed(db, mid).catch((error) => {
        console.error('[Push] Failed to persist bridge state', error);
      });
    }
  };

  const getUserName = async (uid) => {
    const now = Date.now();
    const cached = userCache.get(uid);
    if (cached && cached.expiresAt > now) return cached.name;

    const response = await fetch(`${vocechatHost}/api/user/${uid}`, {
      headers: { 'X-API-Key': botApiKey },
    });
    if (!response.ok) return `Bruker ${uid}`;

    const payload = await response.json();
    const name = typeof payload?.name === 'string' && payload.name.trim() ? payload.name.trim() : `Bruker ${uid}`;
    userCache.set(uid, { name, expiresAt: now + USER_CACHE_TTL_MS });
    return name;
  };

  const getGroupName = async (gid) => {
    const now = Date.now();
    if (groupCache.expiresAt <= now) {
      const response = await fetch(`${vocechatHost}/api/group`, {
        headers: { 'X-API-Key': botApiKey },
      });
      if (response.ok) {
        const payload = await response.json();
        const groupsById = new Map();
        if (Array.isArray(payload)) {
          for (const group of payload) {
            const id = Number(group?.gid);
            const name = typeof group?.name === 'string' ? group.name.trim() : '';
            if (Number.isFinite(id) && name) groupsById.set(id, name);
          }
        }
        groupCache = { expiresAt: now + GROUP_CACHE_TTL_MS, groupsById };
      }
    }

    return groupCache.groupsById.get(gid) ?? `Kanal ${gid}`;
  };

  const connect = async () => {
    if (stopped) return;

    try {
      const db = await getDatabase();
      const state = await db.collection(COLLECTIONS.pushState).findOne({ key: BRIDGE_STATE_KEY });
      lastProcessedMid = Number(state?.lastProcessedMid) || 0;
      suppressingInitialBacklog = !state;
      if (suppressingInitialBacklog) {
        console.log('[Push] No VoceChat bridge state found; suppressing initial SSE backlog.');
        scheduleStartupQuiet();
      }

      abortController = new AbortController();
      const url = `${vocechatHost}/api/user/events?api-key=${encodeURIComponent(botApiKey)}`;
      const response = await fetch(url, {
        headers: { Accept: 'text/event-stream' },
        signal: abortController.signal,
      });

      if (!response.ok || !response.body) {
        const body = await response.text().catch(() => '');
        throw new Error(body || `VoceChat events failed (${response.status})`);
      }

      console.log('[Push] VoceChat bridge connected.');
      await readSse(response.body, (data) => handleEvent(db, parseJson(data)));
      if (!stopped) console.warn('[Push] VoceChat bridge stream ended.');
    } catch (error) {
      if (!stopped && error?.name !== 'AbortError') {
        console.error('[Push] VoceChat bridge connection failed', error);
      }
    } finally {
      if (!stopped) scheduleReconnect();
    }
  };

  void connect();
  return stop;
}

async function sendPushForChatEvent(db, event, { getUserName, getGroupName }) {
  const recipients = await findRecipientTokens(db, event);
  if (recipients.length === 0) return;

  const senderName = await getUserName(Number(event.from_uid));
  const target = event.target;
  const isGroup = target && typeof target === 'object' && 'gid' in target;
  const groupName = isGroup ? await getGroupName(Number(target.gid)) : null;
  const thread = isGroup ? `g:${Number(target.gid)}` : `u:${Number(event.from_uid)}`;
  const title = groupName ? `${senderName} - ${groupName}` : senderName;
  const body = formatNotificationBody(event);
  const data = {
    type: 'chat',
    mid: Number(event.mid),
    thread,
    ...(isGroup ? { gid: Number(target.gid) } : { uid: Number(event.from_uid) }),
  };

  const messages = recipients.map((recipient) => ({
    to: recipient.token,
    title,
    body,
    sound: 'default',
    priority: 'high',
    channelId: 'messages',
    data,
  }));

  await sendExpoPushMessages(db, messages);
}

async function findRecipientTokens(db, event) {
  const fromUid = Number(event.from_uid);
  const target = event.target;
  const baseFilter = {
    disabledAt: { $exists: false },
    uid: { $ne: fromUid },
  };

  let filter;
  if (target && typeof target === 'object' && 'gid' in target) {
    const gid = Number(target.gid);
    if (!Number.isFinite(gid)) return [];
    filter = { ...baseFilter, groupIds: gid };
  } else if (target && typeof target === 'object' && 'uid' in target) {
    const uid = Number(target.uid);
    if (!Number.isFinite(uid) || uid === fromUid) return [];
    filter = { ...baseFilter, uid };
  } else {
    return [];
  }

  const docs = await db
    .collection(COLLECTIONS.pushTokens)
    .find(filter)
    .project({ _id: 0, token: 1, uid: 1 })
    .toArray();

  const byToken = new Map();
  for (const doc of docs) {
    if (normalizePushToken(doc.token)) byToken.set(doc.token, doc);
  }
  return [...byToken.values()];
}

async function sendExpoPushMessages(db, messages) {
  for (let index = 0; index < messages.length; index += EXPO_BATCH_SIZE) {
    const chunk = messages.slice(index, index + EXPO_BATCH_SIZE);
    const response = await fetch(EXPO_PUSH_ENDPOINT, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(chunk),
    });

    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      console.error('[Push] Expo push send failed', response.status, payload);
      continue;
    }

    await disableInvalidExpoTokens(db, chunk, payload);
  }
}

async function disableInvalidExpoTokens(db, messages, payload) {
  const results = Array.isArray(payload?.data) ? payload.data : [];
  const invalidTokens = [];

  results.forEach((result, index) => {
    const error = result?.details?.error;
    if (result?.status === 'error' && error === 'DeviceNotRegistered') {
      invalidTokens.push(messages[index]?.to);
    } else if (result?.status === 'error') {
      console.warn('[Push] Expo rejected push message', result);
    }
  });

  const tokens = invalidTokens.filter(Boolean);
  if (tokens.length === 0) return;

  await db.collection(COLLECTIONS.pushTokens).updateMany(
    { token: { $in: tokens } },
    {
      $set: {
        disabledAt: Date.now(),
        disabledReason: 'expo_device_not_registered',
      },
    },
  );
}

async function fetchUserGroupIds(vocechatHost, apiKey) {
  if (!apiKey) return [];
  const response = await fetch(`${vocechatHost}/api/group`, {
    headers: { 'X-API-Key': apiKey },
  });
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(body || `VoceChat group lookup failed (${response.status})`);
  }

  const payload = await response.json();
  if (!Array.isArray(payload)) return [];
  return payload
    .map((group) => Number(group?.gid))
    .filter((gid) => Number.isFinite(gid));
}

async function readSse(body, onData) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    buffer = buffer.replace(/\r\n/g, '\n');

    let boundary = buffer.indexOf('\n\n');
    while (boundary !== -1) {
      const rawEvent = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      const data = rawEvent
        .split('\n')
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice(5).trimStart())
        .join('\n');
      if (data) await onData(data);
      boundary = buffer.indexOf('\n\n');
    }
  }
}

function parseJson(value) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function normalizePushToken(value) {
  if (typeof value !== 'string') return null;
  const token = value.trim();
  return PUSH_TOKEN_PATTERN.test(token) ? token : null;
}

function normalizeSmallString(value, maxLength) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, maxLength);
}

function isNotifiableChatEvent(event) {
  const detail = event.detail;
  return detail?.type === 'normal' || detail?.type === 'reply';
}

function formatNotificationBody(event) {
  const detail = event.detail;
  const contentType = detail?.content_type;
  const properties = detail?.properties && typeof detail.properties === 'object' ? detail.properties : {};

  if (contentType === 'vocechat/file') {
    const name = typeof properties.name === 'string' && properties.name.trim() ? properties.name.trim() : '';
    return name ? `Sendte ${name}` : 'Sendte et vedlegg';
  }

  const content = typeof detail?.content === 'string' ? detail.content : '';
  const body = stripMarkdown(content).replace(/\s+/g, ' ').trim();
  if (!body) return 'Sendte en melding';
  return body.length > MAX_BODY_LENGTH ? `${body.slice(0, MAX_BODY_LENGTH - 1)}...` : body;
}

function stripMarkdown(value) {
  return value
    .replace(/!\[[^\]]*]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)]\([^)]*\)/g, '$1')
    .replace(/[`*_~>#-]/g, '')
    .replace(/\n+/g, ' ');
}
