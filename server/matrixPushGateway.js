// A Matrix push gateway (https://spec.matrix.org/latest/push-gateway-api/) that
// turns the homeserver's push into Expo push for GnomChat.
//
// The app registers an HTTP pusher on the homeserver with its Expo push token as
// the pushkey and this server's /_matrix/push/v1/notify as the URL. The homeserver
// then POSTs here for every message its push rules say should notify, including
// messages in encrypted rooms (we only see that one arrived, not what it says).
//
// Only pushkeys that a signed-in app registered with /app-api/notifications/push-token
// are delivered to, so the open endpoint can't be used to spam arbitrary devices.
// Unknown or disabled pushkeys are returned as `rejected`, which makes the
// homeserver delete that pusher.
import { COLLECTIONS } from './mongo.js';
import { normalizePushToken } from './pushNotifications.js';
import { createRateLimiter } from './rateLimit.js';

export const MATRIX_PUSH_APP_ID = 'no.gnomguttan.gnomchat';
const MAX_BODY_LENGTH = 180;

function clip(text, length = MAX_BODY_LENGTH) {
  const flat = String(text ?? '').replace(/\s+/g, ' ').trim();
  return flat.length > length ? `${flat.slice(0, length - 1)}…` : flat;
}

/** What the notification says, given only what the homeserver tells us. */
export function describeMatrixNotification(notification) {
  const sender = clip(notification.sender_display_name || notification.sender || 'Noen', 60);
  const roomName = clip(notification.room_name || notification.room_alias || '', 60);
  const title = roomName && roomName !== sender ? `${sender} – ${roomName}` : sender;
  const content = notification.content && typeof notification.content === 'object' ? notification.content : {};

  let body;
  if (notification.type === 'm.room.encrypted') body = 'Sendte en kryptert melding';
  else if (notification.type === 'm.room.member' && content.membership === 'invite') body = 'Inviterte deg til en samtale';
  else if (notification.type === 'm.sticker') body = 'Sendte et klistremerke';
  else if (notification.type === 'm.poll.start' || notification.type === 'org.matrix.msc3381.poll.start') body = 'Startet en avstemning';
  else if (notification.type === 'm.room.message') {
    switch (content.msgtype) {
      case 'm.image': body = 'Sendte et bilde'; break;
      case 'm.video': body = 'Sendte en video'; break;
      case 'm.audio': body = 'Sendte en lydmelding'; break;
      case 'm.file': body = 'Sendte en fil'; break;
      case 'm.location': body = 'Delte en posisjon'; break;
      default: body = clip(content.body) || 'Sendte en melding';
    }
  } else body = 'Ny aktivitet';

  return { title, body };
}

export function registerMatrixPushGateway(app, { getDatabase, sendToTokens, now = () => Date.now() }) {
  const limiter = createRateLimiter({ windowMs: 60_000, max: 600, now });

  app.post('/_matrix/push/v1/notify', async (req, res) => {
    const ip = req.ip ?? 'unknown';
    if (limiter.blockedFor(ip)) {
      res.status(429).json({ errcode: 'M_LIMIT_EXCEEDED', error: 'Too many requests' });
      return;
    }
    limiter.hit(ip);

    const notification = req.body?.notification;
    if (!notification || typeof notification !== 'object' || !Array.isArray(notification.devices)) {
      res.status(400).json({ errcode: 'M_BAD_JSON', error: 'Missing notification.devices' });
      return;
    }

    const devices = notification.devices.slice(0, 50);
    const pushkeys = devices
      .filter((device) => device?.app_id === MATRIX_PUSH_APP_ID)
      .map((device) => normalizePushToken(device?.pushkey))
      .filter(Boolean);

    try {
      const db = await getDatabase();
      const registered = pushkeys.length
        ? await db.collection(COLLECTIONS.pushTokens)
          .find({ token: { $in: pushkeys }, disabledAt: { $exists: false } })
          .project({ _id: 0, token: 1 })
          .toArray()
        : [];
      const known = new Set(registered.map((doc) => doc.token));
      const rejected = devices.map((device) => device?.pushkey).filter((key) => typeof key === 'string' && !known.has(normalizePushToken(key)));

      // A count-only update (no event): the room was read somewhere else. Nothing to show.
      if (notification.event_id && known.size > 0) {
        const { title, body } = describeMatrixNotification(notification);
        const unread = Number(notification.counts?.unread);
        const messages = [...known].map((token) => ({
          to: token,
          title,
          body,
          sound: 'default',
          priority: notification.prio === 'low' ? 'normal' : 'high',
          channelId: 'messages',
          ...(Number.isFinite(unread) ? { badge: unread } : {}),
          data: {
            type: 'matrix',
            roomId: typeof notification.room_id === 'string' ? notification.room_id : '',
            eventId: typeof notification.event_id === 'string' ? notification.event_id : '',
          },
        }));
        await sendToTokens(db, messages);
      }

      res.json({ rejected });
    } catch (error) {
      console.error('[MatrixPush] Failed to deliver', error);
      // 5xx makes the homeserver retry later, which is what we want for our own failures.
      res.status(502).json({ errcode: 'M_UNKNOWN', error: 'Push delivery failed' });
    }
  });
}
