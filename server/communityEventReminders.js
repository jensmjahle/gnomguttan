import { COLLECTIONS } from './mongo.js';

const CHECK_INTERVAL_MS = 60_000;
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const WEEK_MS = 7 * DAY_MS;
const REMINDER_SENT_TOKENS_FIELD = 'reminderSentTokens';

const BASE_STAGES = [
  {
    key: '1h',
    offsetMs: HOUR_MS,
  },
  {
    key: '24h',
    offsetMs: DAY_MS,
  },
  {
    key: '5d',
    offsetMs: 5 * DAY_MS,
  },
];

export function startCommunityEventReminderScheduler({ getDatabase, vocechatHost, botApiKey }) {
  if (!vocechatHost || !botApiKey) {
    console.log('[EventReminders] Disabled because VOCECHAT_HOST or VOCECHAT_BOT_API_KEY is missing.');
    return () => {};
  }

  let stopped = false;
  let running = false;

  const run = async () => {
    if (stopped || running) {
      return;
    }

    running = true;

    try {
      await processCommunityEventReminders({
        getDatabase,
        vocechatHost,
        botApiKey,
      });
    } catch (error) {
      console.error('[EventReminders] Failed to process reminders', error);
    } finally {
      running = false;
    }
  };

  void run();

  const intervalId = setInterval(() => {
    void run();
  }, CHECK_INTERVAL_MS);

  console.log('[EventReminders] Scheduler started.');

  return () => {
    stopped = true;
    clearInterval(intervalId);
    console.log('[EventReminders] Scheduler stopped.');
  };
}

async function processCommunityEventReminders({ getDatabase, vocechatHost, botApiKey }) {
  const db = await getDatabase();
  const [events, users] = await Promise.all([
    db.collection(COLLECTIONS.events).find({}).toArray(),
    db.collection(COLLECTIONS.users).find({ isBot: { $ne: true } }).project({ uid: 1, name: 1, isBot: 1 }).toArray(),
  ]);

  if (events.length === 0 || users.length === 0) {
    return;
  }

  const activeUsers = users
    .map((user) => ({
      uid: Number(user.uid),
      name: String(user.name ?? '').trim(),
    }))
    .filter((user) => Number.isFinite(user.uid) && user.name);

  if (activeUsers.length === 0) {
    return;
  }

  for (const event of events) {
    await processEventReminder({
      db,
      event,
      activeUsers,
      vocechatHost,
      botApiKey,
    });
  }
}

async function processEventReminder({ db, event, activeUsers, vocechatHost, botApiKey }) {
  const createdAt = Number(event.createdAt);
  const startsAtMs = Date.parse(event.startsAt);
  if (!Number.isFinite(createdAt) || Number.isNaN(startsAtMs)) {
    return;
  }

  const now = Date.now();
  if (now >= startsAtMs) {
    return;
  }

  const responses = Array.isArray(event.responses) ? event.responses : [];
  const respondedIds = new Set(
    responses
      .map((response) => Number(response?.uid))
      .filter((uid) => Number.isFinite(uid))
  );

  const missingUsers = activeUsers.filter((user) => !respondedIds.has(user.uid));
  if (missingUsers.length === 0) {
    return;
  }

  const sentTokens = new Set(
    Array.isArray(event[REMINDER_SENT_TOKENS_FIELD])
      ? event[REMINDER_SENT_TOKENS_FIELD].filter((token) => typeof token === 'string')
      : []
  );

  const stages = buildReminderStages(createdAt, startsAtMs).filter((stage) => stage.scheduledAt <= now);
  if (stages.length === 0) {
    return;
  }

  for (const stage of stages) {
    for (const user of missingUsers) {
      const token = buildReminderToken(event.id, stage.key, user.uid);
      if (sentTokens.has(token)) {
        continue;
      }

      try {
        await sendReminderToUser({
          vocechatHost,
          botApiKey,
          userId: user.uid,
          message: buildReminderMessage(stage.key, user.name, event.title),
        });

        await db.collection(COLLECTIONS.events).updateOne(
          { id: event.id },
          {
            $addToSet: {
              [REMINDER_SENT_TOKENS_FIELD]: token,
            },
          }
        );

        sentTokens.add(token);
        console.log(
          `[EventReminders] Sent ${stage.key} reminder for "${event.title}" to ${user.name} (${user.uid})`
        );
      } catch (error) {
        console.error(
          `[EventReminders] Failed to send ${stage.key} reminder for "${event.title}" to ${user.name} (${user.uid})`,
          error
        );
      }
    }
  }
}

function buildReminderStages(createdAt, startsAtMs) {
  const stages = BASE_STAGES.map((stage) => ({
    key: stage.key,
    scheduledAt: createdAt + stage.offsetMs,
  })).filter((stage) => stage.scheduledAt < startsAtMs);

  let scheduledAt = createdAt + 5 * DAY_MS + WEEK_MS;
  let weeklyIndex = 1;

  while (scheduledAt < startsAtMs) {
    stages.push({
      key: `weekly-${weeklyIndex}`,
      scheduledAt,
    });
    scheduledAt += WEEK_MS;
    weeklyIndex += 1;
  }

  return stages;
}

function buildReminderToken(eventId, stageKey, userId) {
  return `${eventId}:${stageKey}:${userId}`;
}

function buildReminderMessage(stageKey, userName, eventTitle) {
  if (stageKey === '1h') {
    return `@${userName} du mangler å svare på arrangementet "${eventTitle}" din gnom.`;
  }

  if (stageKey === '24h') {
    return `@${userName} du har fortsatt ikke svart på arrangementet "${eventTitle}". Svar med en jævla gang din rotteknuller`;
  }

  if (stageKey === '5d') {
    return `FAEN I HELVETE @${userName}! siste påminnelse: du mangler fortsatt å svare på "${eventTitle}". Hvis du ikke svarer nå så kommer jeg og skjærer av deg forhuden mens du sover.`;
  }

  return `NÅ ER DET FAEN MEG NOK @${userName}! DU HAR FORTSATT IKKE SVART PÅ arrangementet "${eventTitle}" DIN JÆVLA FEITE FAEN!!!! NÅ KOMMER JEG OG DREPER DEG OG FAMILIEN DIN, DU ER EN SKAM FOR MENNESKEHETEN! DU ER EN SKAM FOR MENNESKEHETEN! DU ER EN SKAM FOR MENNESKEHETEN! DU ER EN SKAM FOR MENNESKEHETEN. Gå inn å svar med en gang, ellers kommer jeg og finner deg.`;
}

async function sendReminderToUser({ vocechatHost, botApiKey, userId, message }) {
  const response = await fetch(`${vocechatHost}/api/bot/send_to_user/${userId}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'text/plain',
      'X-API-Key': botApiKey,
    },
    body: message,
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(body || `Reminder bot request failed (${response.status})`);
  }
}
