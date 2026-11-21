import { randomUUID } from 'node:crypto';
import { COLLECTIONS } from './mongo.js';

const MAX_ACTORS = 3;
const MAX_EMOJIS = 3;
const SNIPPET_LENGTH = 120;
const DEFAULT_PAGE_SIZE = 30;
const MAX_PAGE_SIZE = 50;
const RETENTION_MS = 90 * 24 * 60 * 60 * 1000;

/** Per-user notification preferences; "threads you've commented in" is opt-in. */
export const DEFAULT_NOTIFICATION_SETTINGS = Object.freeze({
  mentions: true,
  replies: true,
  ownPosts: true,
  threads: false,
  reactions: true,
  newEvents: true,
  toast: true,
  tabTitle: true,
  /** Push to the phone app (GnomChat) when it's installed and allowed to notify. */
  push: true,
});

// A grouped notification ("Kari og 2 andre reagerte …") pushes again at most this often.
const PUSH_REGROUP_MS = 15 * 60 * 1000;

const SETTING_FOR_TYPE = {
  mention: 'mentions',
  reply: 'replies',
  comment: 'ownPosts',
  thread: 'threads',
  reaction: 'reactions',
  event: 'newEvents',
};

// ── Pure helpers ──────────────────────────────────────────────────────────────

function truncate(text, length) {
  const flat = String(text ?? '').replace(/\s+/g, ' ').trim();
  return flat.length > length ? `${flat.slice(0, length - 1)}…` : flat;
}

export function settingAllows(type, settings) {
  const key = SETTING_FOR_TYPE[type];
  if (!key) return false;
  return Boolean(settings?.[key] ?? DEFAULT_NOTIFICATION_SETTINGS[key]);
}

/** Newest actor first, unique by uid, capped (the full count lives in actorUids). */
export function mergeActors(actors, actor, max = MAX_ACTORS) {
  return [actor, ...(actors ?? []).filter((entry) => entry.uid !== actor.uid)].slice(0, max);
}

/** A short «name» for a feed post, used in notification text. */
export function describeFeedItem(item) {
  const payload = item?.payload ?? {};
  switch (item?.type) {
    case 'community_event_created': return truncate(payload.title, 60) || 'arrangementet';
    case 'statusrapport_created': return truncate(payload.text, 40) || 'statusrapporten';
    case 'overheard_added': return truncate(payload.text, 40) || 'sitatet';
    case 'pigs_round_score': return 'grisekast-runden';
    case 'wheel_spin_result': return 'lykkehjulet';
    case 'lamp_toggled': return 'lampa';
    default:
      if (item?.source === 'github') return truncate(payload.title || payload.name || payload.tagName, 40) || 'GitHub';
      return 'innlegget';
  }
}

function normalizeSettings(document) {
  return Object.fromEntries(
    Object.entries(DEFAULT_NOTIFICATION_SETTINGS).map(([key, fallback]) => [
      key,
      typeof document?.[key] === 'boolean' ? document[key] : fallback,
    ]),
  );
}

function sanitizeNotification(document) {
  const { _id, uid: _uid, groupKey: _groupKey, actorUids, expiresAt: _expiresAt, pushedAt: _pushedAt, ...rest } = document;
  return { ...rest, actorCount: actorUids?.length ?? rest.actors?.length ?? 1 };
}

function toPerson(actor) {
  const avatarUpdatedAt = Number(actor?.avatarUpdatedAt);
  return {
    uid: actor.uid,
    name: actor.name,
    ...(Number.isFinite(avatarUpdatedAt) ? { avatarUpdatedAt } : {}),
  };
}

/** "Kari", "Kari og Ola", "Kari og 3 andre" — same wording as the website. */
export function actorsLabel(notification) {
  const [first, second] = notification.actors ?? [];
  const name = first?.name ?? 'Noen';
  const others = (notification.actorCount ?? notification.actors?.length ?? 1) - 1;
  if (others <= 0) return name;
  if (others === 1 && second) return `${name} og ${second.name}`;
  return `${name} og ${others} ${others === 1 ? 'annen' : 'andre'}`;
}

/** Title and body for a push notification, mirroring src/utils/notificationText.ts. */
export function pushTextFor(notification) {
  const { type, subject, context, target } = notification;
  const quoted = context ? ` «${context}»` : '';
  const emojis = (notification.emojis ?? []).join('');
  let action;
  switch (type) {
    case 'mention': action = target?.commentId ? `nevnte deg i en kommentar på${quoted}` : `nevnte deg i et innlegg${quoted}`; break;
    case 'reply': action = `svarte på kommentaren din på${quoted}`; break;
    case 'comment': action = `kommenterte ${subject === 'event' ? 'arrangementet' : 'innlegget'} ditt${quoted}`; break;
    case 'thread': action = `kommenterte også på${quoted}`; break;
    case 'reaction':
      action = subject === 'comment'
        ? `reagerte ${emojis} på kommentaren din på${quoted}`
        : `reagerte ${emojis} på ${subject === 'event' ? 'arrangementet' : 'innlegget'} ditt${quoted}`;
      break;
    case 'event': action = `la ut et nytt arrangement${quoted}`; break;
    default: action = 'har ny aktivitet';
  }
  const title = actorsLabel(notification);
  const body = notification.snippet && type !== 'reaction' ? `${action}: ${notification.snippet}` : action;
  return { title, body: truncate(body, 178) };
}

// ── Service ───────────────────────────────────────────────────────────────────

/**
 * Stores per-user notifications and pushes them live over the feed SSE stream.
 * Grouped notifications ("Kari og 2 andre kommenterte …") update the
 * recipient's unread notification with the same groupKey instead of adding one.
 */
export function createNotificationService({ getDatabase, sendFeedEventToUsers, sendPush = null }) {
  /** Push one stored notification to the recipient's phones; throttled for grouped ones. */
  async function pushNotification(collection, uid, document) {
    if (!sendPush) return;
    const now = Date.now();
    if (document.pushedAt && now - document.pushedAt < PUSH_REGROUP_MS) return;
    await collection.updateOne({ id: document.id }, { $set: { pushedAt: now } });
    const sanitized = sanitizeNotification(document);
    const { title, body } = pushTextFor(sanitized);
    const unread = await collection.countDocuments({ uid, readAt: null });
    await sendPush([uid], {
      title,
      body,
      channelId: 'activity',
      badge: unread,
      data: { type: 'notification', notificationId: document.id, link: document.link ?? '', target: document.target ?? null },
    });
  }

  async function loadSettings(db, uids) {
    const documents = await db.collection(COLLECTIONS.notificationSettings).find({ uid: { $in: uids } }).toArray();
    const byUid = new Map(documents.map((document) => [document.uid, document]));
    return new Map(uids.map((uid) => [uid, normalizeSettings(byUid.get(uid))]));
  }

  /** Fire-and-forget: failures are logged, never thrown into the request that caused them. */
  async function notify({ type, recipients, actor, subject, target, context, snippet, emoji, link, groupKey }) {
    try {
      const uids = [...new Set(recipients)].filter((uid) => Number.isFinite(uid) && uid > 0 && uid !== actor.uid);
      if (uids.length === 0) return;

      const db = await getDatabase();
      const collection = db.collection(COLLECTIONS.notifications);
      const settingsByUid = await loadSettings(db, uids);
      const person = toPerson(actor);
      const now = Date.now();
      const fields = {
        type,
        subject,
        target,
        context: context ?? '',
        link,
        updatedAt: now,
        expiresAt: new Date(now + RETENTION_MS),
        ...(snippet ? { snippet: truncate(snippet, SNIPPET_LENGTH) } : {}),
      };

      for (const uid of uids) {
        if (!settingAllows(type, settingsByUid.get(uid))) continue;

        let document = null;
        if (groupKey) {
          const existing = await collection.findOne({ uid, groupKey, readAt: null });
          if (existing) {
            document = await collection.findOneAndUpdate(
              { _id: existing._id },
              {
                $set: {
                  ...fields,
                  actors: mergeActors(existing.actors, person),
                  ...(emoji ? { emojis: [emoji, ...(existing.emojis ?? []).filter((e) => e !== emoji)].slice(0, MAX_EMOJIS) } : {}),
                },
                $addToSet: { actorUids: actor.uid },
              },
              { returnDocument: 'after' },
            );
          }
        }

        if (!document) {
          document = {
            id: randomUUID(),
            uid,
            ...fields,
            actors: [person],
            actorUids: [actor.uid],
            ...(emoji ? { emojis: [emoji] } : {}),
            ...(groupKey ? { groupKey } : {}),
            createdAt: now,
            readAt: null,
          };
          await collection.insertOne(document);
        }

        sendFeedEventToUsers([uid], { __type: 'notification', notification: sanitizeNotification(document) });
        if (settingsByUid.get(uid)?.push !== false) {
          pushNotification(collection, uid, document).catch((error) => console.error('[Notifications] Push failed', error));
        }
      }
    } catch (error) {
      console.error('[Notifications] Failed to notify', error);
    }
  }

  /** Delete notifications matching `filter` and tell their owners' open clients to drop them. */
  async function removeMatching(filter) {
    try {
      const db = await getDatabase();
      const collection = db.collection(COLLECTIONS.notifications);
      const documents = await collection.find(filter).project({ _id: 0, id: 1, uid: 1, readAt: 1 }).toArray();
      if (documents.length === 0) return;
      await collection.deleteMany({ id: { $in: documents.map((document) => document.id) } });
      for (const document of documents) {
        // wasUnread lets the client fix its badge even if this notification isn't loaded.
        sendFeedEventToUsers([document.uid], { __type: 'notification_removed', id: document.id, wasUnread: document.readAt === null });
      }
    } catch (error) {
      console.error('[Notifications] Failed to remove notifications', error);
    }
  }

  /**
   * A comment or reply is gone: its mention/reply/reaction notifications point at
   * nothing. Grouped "commented on your post" ones stay; they still lead to the post.
   */
  function removeForComments(commentIds) {
    if (commentIds.length === 0) return Promise.resolve();
    return removeMatching({ 'target.commentId': { $in: commentIds }, type: { $in: ['mention', 'reply', 'reaction'] } });
  }

  /** An event (and its feed posts) was deleted. */
  function removeForEvent(eventId, feedItemIds) {
    return removeMatching({
      $or: [
        { 'target.kind': 'event', 'target.id': eventId },
        { 'target.kind': 'feed', 'target.id': { $in: feedItemIds } },
      ],
    });
  }

  async function unreadCount(db, uid) {
    return db.collection(COLLECTIONS.notifications).countDocuments({ uid, readAt: null });
  }

  function registerRoutes(router) {
    router.get('/notifications', async (req, res) => {
      const uid = req.currentUser.uid;
      const limitRaw = parseInt(req.query.limit, 10);
      const limit = Math.min(Number.isFinite(limitRaw) && limitRaw > 0 ? limitRaw : DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
      const before = typeof req.query.before === 'string' ? Number(req.query.before) : NaN;
      // ?unread=1 lists only unread notifications (the bell panel hides read ones).
      const unreadOnly = req.query.unread === '1' || req.query.unread === 'true';

      const db = await getDatabase();
      const [documents, unread] = await Promise.all([
        db.collection(COLLECTIONS.notifications)
          .find({
            uid,
            ...(unreadOnly ? { readAt: null } : {}),
            ...(Number.isFinite(before) ? { updatedAt: { $lt: before } } : {}),
          })
          .sort({ updatedAt: -1 })
          .limit(limit + 1)
          .toArray(),
        unreadCount(db, uid),
      ]);

      res.json({
        items: documents.slice(0, limit).map(sanitizeNotification),
        unreadCount: unread,
        hasMore: documents.length > limit,
      });
    });

    router.post('/notifications/read-all', async (req, res) => {
      const db = await getDatabase();
      await db.collection(COLLECTIONS.notifications).updateMany(
        { uid: req.currentUser.uid, readAt: null },
        { $set: { readAt: Date.now() } },
      );
      res.json({ unreadCount: 0 });
    });

    router.post('/notifications/:id/read', async (req, res) => {
      const db = await getDatabase();
      await db.collection(COLLECTIONS.notifications).updateOne(
        { uid: req.currentUser.uid, id: req.params.id, readAt: null },
        { $set: { readAt: Date.now() } },
      );
      res.json({ unreadCount: await unreadCount(db, req.currentUser.uid) });
    });

    router.get('/notifications/settings', async (req, res) => {
      const db = await getDatabase();
      const settings = await loadSettings(db, [req.currentUser.uid]);
      res.json(settings.get(req.currentUser.uid));
    });

    router.put('/notifications/settings', async (req, res) => {
      const patch = req.body ?? {};
      const entries = Object.entries(patch);
      const invalid = entries.find(([key, value]) => !(key in DEFAULT_NOTIFICATION_SETTINGS) || typeof value !== 'boolean');
      if (entries.length === 0 || invalid) {
        res.status(400).json({ error: invalid ? `Ugyldig innstilling: ${invalid[0]}` : 'Ingen innstillinger.' });
        return;
      }

      const db = await getDatabase();
      const uid = req.currentUser.uid;
      await db.collection(COLLECTIONS.notificationSettings).updateOne(
        { uid },
        { $set: { ...Object.fromEntries(entries), updatedAt: Date.now() } },
        { upsert: true },
      );
      const settings = await loadSettings(db, [uid]);
      res.json(settings.get(uid));
    });
  }

  return { notify, registerRoutes, removeForComments, removeForEvent };
}
