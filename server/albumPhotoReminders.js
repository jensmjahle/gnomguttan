import { randomUUID } from 'node:crypto';
import { COLLECTIONS, getDatabase } from './mongo.js';
import { getRandomAlbumPhotoPhrase, getSoftAlbumPhotoPhrase } from './albumPhotoReminderPhrases.js';

const CHECK_INTERVAL_MS = Number(process.env.PHOTO_REMINDER_INTERVAL_MS) || 60_000;
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const SNOOZE_MS = DAY_MS;

// Escalation stages for "required" (coming) obligations, measured from the
// obligation's createdAt (i.e. when the event finished).
const BASE_STAGES = [
  { key: '0m', offsetMs: 0 },
  { key: '8h', offsetMs: 8 * HOUR_MS },
  { key: '24h', offsetMs: DAY_MS },
  { key: '48h', offsetMs: 2 * DAY_MS },
  { key: '72h', offsetMs: 3 * DAY_MS },
];

export function startAlbumPhotoReminderScheduler({ getDatabase, vocechatHost, botApiKey }) {
  if (!vocechatHost || !botApiKey) {
    console.log('[PhotoReminders] Disabled because VOCECHAT_HOST or VOCECHAT_BOT_API_KEY is missing.');
    return () => {};
  }

  let stopped = false;
  let running = false;

  const run = async () => {
    if (stopped || running) return;
    running = true;
    try {
      await processAlbumPhotoReminders({ getDatabase, vocechatHost, botApiKey });
    } catch (error) {
      console.error('[PhotoReminders] Failed to process reminders', error);
    } finally {
      running = false;
    }
  };

  void run();
  const intervalId = setInterval(() => void run(), CHECK_INTERVAL_MS);
  console.log('[PhotoReminders] Scheduler started.');

  return () => {
    stopped = true;
    clearInterval(intervalId);
    console.log('[PhotoReminders] Scheduler stopped.');
  };
}

async function processAlbumPhotoReminders({ getDatabase, vocechatHost, botApiKey }) {
  const db = await getDatabase();
  await finalizeFinishedEvents(db);
  await sendDueReminders(db, { vocechatHost, botApiKey });
}

// ── Finalizer: create obligations for finished events that have an album ────────
async function finalizeFinishedEvents(db) {
  const now = Date.now();
  const events = await db
    .collection(COLLECTIONS.events)
    .find({ status: 'published', photoRequestFinalizedAt: { $exists: false } })
    .toArray();
  if (events.length === 0) return;

  const activeUsers = await db
    .collection(COLLECTIONS.users)
    .find({ isBot: { $ne: true } })
    .project({ uid: 1, name: 1 })
    .toArray();
  const validUsers = activeUsers
    .map((user) => ({ uid: Number(user.uid), name: String(user.name ?? '').trim() }))
    .filter((user) => Number.isFinite(user.uid) && user.name);

  for (const event of events) {
    const finishMs = Date.parse(event.endsAt || event.startsAt);
    if (!Number.isFinite(finishMs) || now < finishMs) continue;

    const album = await db.collection(COLLECTIONS.albums).findOne({ eventId: event.id });
    if (!album) continue;

    const responsesByUid = new Map(
      (Array.isArray(event.responses) ? event.responses : [])
        .map((response) => [Number(response?.uid), response?.status])
        .filter(([uid]) => Number.isFinite(uid))
    );

    for (const user of validUsers) {
      const rsvp = responsesByUid.get(user.uid);
      if (rsvp === 'cannot') continue;
      const kind = rsvp === 'coming' ? 'required' : 'soft';

      await db.collection(COLLECTIONS.photoObligations).updateOne(
        { eventId: event.id, uid: user.uid },
        {
          $setOnInsert: {
            id: randomUUID(),
            eventId: event.id,
            uid: user.uid,
            albumId: album.id,
            eventTitle: event.title || album.title || 'arrangementet',
            kind,
            status: 'pending',
            reminderSentTokens: [],
            createdAt: now,
          },
        },
        { upsert: true }
      );
    }

    await db.collection(COLLECTIONS.events).updateOne({ id: event.id }, { $set: { photoRequestFinalizedAt: now } });
    console.log(`[PhotoReminders] Finalized photo obligations for "${event.title}"`);
  }
}

// ── Reminder pass ────────────────────────────────────────────────────────────────
async function sendDueReminders(db, { vocechatHost, botApiKey }) {
  const now = Date.now();
  const obligations = await db
    .collection(COLLECTIONS.photoObligations)
    .find({ status: { $in: ['pending', 'snoozed'] } })
    .toArray();

  const usersByUid = new Map();
  const users = await db.collection(COLLECTIONS.users).find({}).project({ uid: 1, name: 1 }).toArray();
  for (const user of users) usersByUid.set(Number(user.uid), String(user.name ?? '').trim());

  for (const obligation of obligations) {
    // Respect snooze.
    if (obligation.status === 'snoozed' && Number(obligation.snoozeUntil) > now) continue;

    const name = usersByUid.get(Number(obligation.uid)) || '';
    if (!name) continue;

    const sentTokens = new Set(Array.isArray(obligation.reminderSentTokens) ? obligation.reminderSentTokens : []);

    if (obligation.kind === 'soft') {
      // One gentle nudge, ever.
      if (sentTokens.has('soft')) continue;
      await trySend(db, obligation, 'soft', getSoftAlbumPhotoPhrase(name, obligation.eventTitle), {
        vocechatHost,
        botApiKey,
      });
      continue;
    }

    const dueStages = buildStages(Number(obligation.createdAt)).filter((stage) => stage.scheduledAt <= now);
    for (const stage of dueStages) {
      if (sentTokens.has(stage.key)) continue;
      await trySend(db, obligation, stage.key, getRandomAlbumPhotoPhrase(stage.key, name, obligation.eventTitle), {
        vocechatHost,
        botApiKey,
      });
      sentTokens.add(stage.key);
    }
  }
}

async function trySend(db, obligation, token, message, { vocechatHost, botApiKey }) {
  try {
    await sendToUser({ vocechatHost, botApiKey, userId: obligation.uid, message });
    await db.collection(COLLECTIONS.photoObligations).updateOne(
      { id: obligation.id },
      { $addToSet: { reminderSentTokens: token } }
    );
    console.log(`[PhotoReminders] Sent ${token} photo reminder for "${obligation.eventTitle}" to uid ${obligation.uid}`);
  } catch (error) {
    console.error(`[PhotoReminders] Failed to send ${token} reminder to uid ${obligation.uid}`, error);
  }
}

function buildStages(createdAt) {
  const stages = BASE_STAGES.map((stage) => ({ key: stage.key, scheduledAt: createdAt + stage.offsetMs }));
  let scheduledAt = createdAt + 3 * DAY_MS + 5 * DAY_MS;
  let index = 1;
  const horizon = Date.now() + DAY_MS;
  while (scheduledAt < horizon && index <= 60) {
    stages.push({ key: `5d-${index}`, scheduledAt });
    scheduledAt += 5 * DAY_MS;
    index += 1;
  }
  return stages;
}

async function sendToUser({ vocechatHost, botApiKey, userId, message }) {
  const response = await fetch(`${vocechatHost}/api/bot/send_to_user/${userId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain', 'X-API-Key': botApiKey },
    body: message,
  });
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(body || `Photo reminder bot request failed (${response.status})`);
  }
}

// ── Authed routes for the current user's obligations ────────────────────────────
export function registerPhotoObligationRoutes(router) {
  router.get('/photo-obligations', async (req, res) => {
    const db = await getDatabase();
    const now = Date.now();
    const obligations = await db
      .collection(COLLECTIONS.photoObligations)
      .find({ uid: req.currentUser.uid, kind: 'required', status: { $in: ['pending', 'snoozed'] } })
      .sort({ createdAt: 1 })
      .toArray();
    // Only surface active ones (snoozed-and-still-snoozed are hidden).
    const active = obligations.filter((o) => o.status !== 'snoozed' || Number(o.snoozeUntil) <= now);
    res.json(active.map(sanitizeObligation));
  });

  router.post('/photo-obligations/:id/no-photos', async (req, res) => {
    const db = await getDatabase();
    const result = await db.collection(COLLECTIONS.photoObligations).findOneAndUpdate(
      { id: req.params.id, uid: req.currentUser.uid },
      { $set: { status: 'no_photos', resolvedAt: Date.now() } },
      { returnDocument: 'after' }
    );
    const doc = result?.value ?? result;
    if (!doc) {
      res.status(404).json({ error: 'Obligation not found.' });
      return;
    }
    res.json(sanitizeObligation(doc));
  });

  router.post('/photo-obligations/:id/snooze', async (req, res) => {
    const db = await getDatabase();
    const result = await db.collection(COLLECTIONS.photoObligations).findOneAndUpdate(
      { id: req.params.id, uid: req.currentUser.uid },
      { $set: { status: 'snoozed', snoozeUntil: Date.now() + SNOOZE_MS } },
      { returnDocument: 'after' }
    );
    const doc = result?.value ?? result;
    if (!doc) {
      res.status(404).json({ error: 'Obligation not found.' });
      return;
    }
    res.json(sanitizeObligation(doc));
  });
}

function sanitizeObligation(doc) {
  return {
    id: doc.id,
    uid: doc.uid,
    eventId: doc.eventId,
    albumId: doc.albumId,
    eventTitle: doc.eventTitle,
    kind: doc.kind,
    status: doc.status,
    snoozeUntil: doc.snoozeUntil ?? undefined,
    createdAt: doc.createdAt,
    resolvedAt: doc.resolvedAt ?? undefined,
  };
}
