// Profiles: name, picture, bio and the details that used to live in each Ølbørs
// exchange. Everything is shown to other members unless its owner hides it; hidden
// fields never leave the server for anyone else.
//
// Profile pictures are stored here. Until VoceChat is gone, anyone without one gets
// their VoceChat avatar copied over (VoceChat serves them publicly).
import { Binary } from 'mongodb';
import { COLLECTIONS } from './mongo.js';
import { normalizeEmail } from './auth.js';
import { verifyPassword } from './passwords.js';
import { createRateLimiter } from './rateLimit.js';
import {
  BIO_MAX,
  FULL_NAME_MAX,
  HIDEABLE_FIELDS,
  PROFILE_FIELD_KEYS,
  ProfileError,
  cleanProfileFields,
  cleanText,
  profileFieldUpdate,
} from './profileFields.js';

const NAME_MAX = 40;
const AVATAR_MAX_BYTES = 2 * 1024 * 1024;
const AVATAR_RETRY_MS = 24 * 3600 * 1000;
const AVATAR_TYPES = [
  { type: 'image/jpeg', test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { type: 'image/png', test: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  { type: 'image/gif', test: (b) => b.subarray(0, 4).toString('latin1') === 'GIF8' },
  { type: 'image/webp', test: (b) => b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP' },
];
const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** The image type, judged by its first bytes rather than what the sender claims. */
export function sniffImageType(buffer) {
  return AVATAR_TYPES.find(({ test }) => buffer.length > 12 && test(buffer))?.type ?? null;
}

export function cleanDisplayName(value) {
  const name = typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
  if (name.length < 2 || name.length > NAME_MAX) throw new ProfileError(400, `Navnet må ha 2–${NAME_MAX} tegn.`);
  if (/[\p{Cc}<>@]/u.test(name)) throw new ProfileError(400, 'Navnet kan ikke inneholde @, < eller >.');
  return name;
}

/** First name for the quote search: from the full name if set, else the display name. */
export function firstNameOf(user) {
  return String(user?.fullName || user?.name || '').trim().split(/\s+/)[0] ?? '';
}

/**
 * Matches a first name as a whole word, any case, also with a genitive "s" or "'"
 * ("Mikkels", "Jens'"), but not inside longer names ("Jensen").
 */
export function firstNamePattern(firstName) {
  if (firstName.length < 2) return null;
  return new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegex(firstName)}(?:s|'s?|’s?)?(?![\\p{L}\\p{N}])`, 'iu');
}

/** What `viewer` may see of `user`. The owner also gets their hidden-field list. */
export function profileView(user, viewer) {
  const isSelf = viewer?.uid === user.uid;
  const hidden = new Set(user.hiddenFields ?? []);
  const visible = (field) => isSelf || !hidden.has(field);
  const fields = {};
  for (const key of PROFILE_FIELD_KEYS) if (user.profile?.[key] && visible(key)) fields[key] = user.profile[key];
  return {
    uid: user.uid,
    name: user.name ?? '',
    avatarUpdatedAt: user.avatarUpdatedAt ?? 0,
    hasAvatar: Boolean(user.avatarSource && user.avatarSource !== 'none'),
    isAdmin: Boolean(user.isAdmin),
    bio: user.bio ?? '',
    ...(visible('fullName') && user.fullName ? { fullName: user.fullName } : {}),
    ...(visible('email') && user.email ? { email: user.email } : {}),
    ...(visible('lastSeen') && user.lastSeenAt ? { lastSeenAt: user.lastSeenAt } : {}),
    fields,
    ...(isSelf ? { isSelf: true, hiddenFields: [...hidden] } : {}),
  };
}

export function createProfileService({
  getDatabase,
  vocechatHost = '',
  syncOlbors = async () => {},
  fetchImpl = (...args) => fetch(...args),
  now = () => Date.now(),
  log = console,
}) {
  const emailByUid = createRateLimiter({ windowMs: 15 * 60_000, max: 8, now });
  const users = async () => (await getDatabase()).collection(COLLECTIONS.users);
  const avatars = async () => (await getDatabase()).collection(COLLECTIONS.avatars);

  async function findUser(uid) {
    const user = Number.isInteger(uid) ? await (await users()).findOne({ uid }) : null;
    if (!user || !user.name) throw new ProfileError(404, 'Fant ikke personen.');
    return user;
  }

  async function getProfile(viewer, uid) {
    return profileView(await findUser(uid), viewer);
  }

  async function updateProfile(viewer, body = {}) {
    const collection = await users();
    const user = await findUser(viewer.uid);
    const $set = {};
    if ('name' in body) {
      const name = cleanDisplayName(body.name);
      if (name !== user.name) {
        const taken = await collection.findOne({ uid: { $ne: user.uid }, name: { $regex: `^${escapeRegex(name)}$`, $options: 'i' } });
        if (taken) throw new ProfileError(409, 'Navnet er allerede tatt.');
        $set.name = name;
        $set.nameChangedAt = now();
      }
    }
    if ('fullName' in body) $set.fullName = cleanText(body.fullName, FULL_NAME_MAX, 'Fullt navn');
    if ('bio' in body) {
      const bio = String(body.bio ?? '').replace(/\r\n?/g, '\n').replace(/[^\S\n]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
      if (bio.length > BIO_MAX) throw new ProfileError(400, `Bioen kan ha maks ${BIO_MAX} tegn.`);
      $set.bio = bio;
    }
    if ('hiddenFields' in body) {
      if (!Array.isArray(body.hiddenFields)) throw new ProfileError(400, 'Ugyldige skjulte felt.');
      $set.hiddenFields = [...new Set(body.hiddenFields.filter((field) => HIDEABLE_FIELDS.includes(field)))];
    }
    const fieldChange = 'fields' in body ? cleanProfileFields(body.fields ?? {}) : null;
    const fieldUpdate = fieldChange ? profileFieldUpdate(fieldChange) : {};
    const update = { ...fieldUpdate, $set: { ...fieldUpdate.$set, ...$set, updatedAt: now() } };
    await collection.updateOne({ uid: user.uid }, update);
    if (fieldChange) await syncOlbors(user.uid);
    return profileView(await collection.findOne({ uid: user.uid }), viewer);
  }

  async function changeEmail(viewer, { email, password }) {
    const wait = emailByUid.blockedFor(viewer.uid);
    if (wait) throw new ProfileError(429, `For mange forsøk. Prøv igjen om ${Math.ceil(wait / 60_000)} min.`);
    const normalized = normalizeEmail(email);
    if (!normalized) throw new ProfileError(400, 'Skriv inn en gyldig e-postadresse.');
    const db = await getDatabase();
    const account = await db.collection(COLLECTIONS.accounts).findOne({ uid: viewer.uid });
    if (!account) throw new ProfileError(409, 'Logg ut og inn igjen med passordet ditt før du bytter e-post.');
    if (String(password ?? '').length > 1024 || !(await verifyPassword(String(password ?? ''), account.passwordHash))) {
      emailByUid.hit(viewer.uid);
      throw new ProfileError(403, 'Passordet er feil.');
    }
    emailByUid.reset(viewer.uid);
    if (normalized === account.email) return getProfile(viewer, viewer.uid);
    const taken = await db.collection(COLLECTIONS.accounts).findOne({ email: normalized, uid: { $ne: viewer.uid } })
      || await db.collection(COLLECTIONS.users).findOne({ email: normalized, uid: { $ne: viewer.uid } });
    if (taken) throw new ProfileError(409, 'E-postadressen er allerede i bruk.');
    await db.collection(COLLECTIONS.accounts).updateOne({ uid: viewer.uid }, { $set: { email: normalized, updatedAt: now() } });
    await db.collection(COLLECTIONS.users).updateOne({ uid: viewer.uid }, { $set: { email: normalized } });
    return getProfile(viewer, viewer.uid);
  }

  // ── Pictures ────────────────────────────────────────────────────────────────

  async function saveAvatar(uid, data, contentType, source) {
    const updatedAt = now();
    await (await avatars()).updateOne(
      { uid },
      { $set: { uid, data: new Binary(data), contentType, size: data.length, source, updatedAt } },
      { upsert: true },
    );
    await (await users()).updateOne({ uid }, { $set: { avatarUpdatedAt: updatedAt, avatarSource: source } });
    return updatedAt;
  }

  async function uploadAvatar(viewer, dataUrl) {
    const match = /^data:image\/[\w.+-]+;base64,/.exec(typeof dataUrl === 'string' ? dataUrl : '');
    if (!match) throw new ProfileError(400, 'Bildet må være JPEG, PNG, GIF eller WebP.');
    const data = Buffer.from(dataUrl.slice(match[0].length), 'base64');
    if (data.length > AVATAR_MAX_BYTES) throw new ProfileError(400, 'Bildet er for stort (maks 2 MB).');
    const contentType = sniffImageType(data);
    if (!contentType) throw new ProfileError(400, 'Bildet må være JPEG, PNG, GIF eller WebP.');
    return { avatarUpdatedAt: await saveAvatar(viewer.uid, data, contentType, 'upload') };
  }

  async function removeAvatar(viewer) {
    await (await avatars()).deleteOne({ uid: viewer.uid });
    const updatedAt = now();
    await (await users()).updateOne({ uid: viewer.uid }, { $set: { avatarUpdatedAt: updatedAt, avatarSource: 'none' } });
    return { avatarUpdatedAt: updatedAt };
  }

  /** Copies someone's VoceChat avatar if they don't have a picture here yet. */
  async function importVoceChatAvatar(user) {
    if (!vocechatHost || user.avatarSource) return false;
    if (user.avatarImportTriedAt && now() - user.avatarImportTriedAt < AVATAR_RETRY_MS) return false;
    const collection = await users();
    await collection.updateOne({ uid: user.uid }, { $set: { avatarImportTriedAt: now() } });
    try {
      const res = await fetchImpl(`${vocechatHost}/api/resource/avatar?uid=${user.uid}`, { signal: AbortSignal.timeout(15_000) });
      if (res.status === 404) {
        await collection.updateOne({ uid: user.uid, avatarSource: { $exists: false } }, { $set: { avatarSource: 'none' } });
        return false;
      }
      if (!res.ok) return false;
      const data = Buffer.from(await res.arrayBuffer());
      const contentType = sniffImageType(data);
      if (!contentType || data.length > AVATAR_MAX_BYTES) return false;
      // Someone may have uploaded their own picture meanwhile; that one wins.
      const fresh = await collection.findOne({ uid: user.uid });
      if (fresh?.avatarSource) return false;
      await saveAvatar(user.uid, data, contentType, 'vocechat');
      return true;
    } catch (error) {
      log.warn?.(`[Profiles] Could not copy the VoceChat avatar of uid ${user.uid}: ${error.message}`);
      return false;
    }
  }

  /** Copies every missing VoceChat avatar, a few at a time. Safe to run on every start. */
  async function importVoceChatAvatars() {
    if (!vocechatHost) return 0;
    const pending = await (await users()).find({ avatarSource: { $exists: false }, name: { $exists: true, $ne: '' } }).toArray();
    let copied = 0;
    for (let i = 0; i < pending.length; i += 4) {
      const results = await Promise.all(pending.slice(i, i + 4).map(importVoceChatAvatar));
      copied += results.filter(Boolean).length;
    }
    if (copied) log.log?.(`[Profiles] Copied ${copied} profile pictures from VoceChat.`);
    return copied;
  }

  async function avatarFor(uid) {
    let avatar = await (await avatars()).findOne({ uid });
    if (!avatar) {
      const user = await (await users()).findOne({ uid });
      if (user && (await importVoceChatAvatar(user))) avatar = await (await avatars()).findOne({ uid });
    }
    return avatar;
  }

  // ── Quotes ──────────────────────────────────────────────────────────────────

  /** Overhørt quotes said by or about someone, matched on their first name. */
  async function quotesAbout(uid) {
    const user = await findUser(uid);
    const pattern = firstNamePattern(firstNameOf(user));
    if (!pattern) return { firstName: firstNameOf(user), quotes: [] };
    const quotes = await (await getDatabase()).collection(COLLECTIONS.overheard).find({}).sort({ createdAt: -1 }).toArray();
    return {
      firstName: firstNameOf(user),
      quotes: quotes
        .filter((q) => pattern.test(String(q.author ?? '')) || pattern.test(String(q.text ?? '')))
        .map(({ _id, ...quote }) => ({ ...quote, saidBy: pattern.test(String(quote.author ?? '')) })),
    };
  }

  return {
    getProfile,
    updateProfile,
    changeEmail,
    uploadAvatar,
    removeAvatar,
    importVoceChatAvatar,
    importVoceChatAvatars,
    avatarFor,
    quotesAbout,
  };
}

// ── Routes ────────────────────────────────────────────────────────────────────

function handle(fn) {
  return async (req, res) => {
    try {
      const result = await fn(req, res);
      if (!res.headersSent) res.json(result ?? { ok: true });
    } catch (error) {
      if (error instanceof ProfileError) {
        res.status(error.status).json({ error: error.message });
        return;
      }
      console.error('[Profiles]', error);
      res.status(500).json({ error: 'Noe gikk galt. Prøv igjen.' });
    }
  };
}

/**
 * Profile pictures, for <img> tags: authorised by ?token=, or for an Ølbørs kiosk by
 * ?kiosk=<exchange>&key=<kiosk key> for people taking part in that exchange.
 * Register before the auth middleware.
 */
export function registerAvatarRoutes(router, service, { resolveUser, getDatabase, exchangesCollection }) {
  router.get('/avatars/:uid', async (req, res) => {
    const uid = Number(req.params.uid);
    if (!Number.isInteger(uid)) {
      res.status(400).json({ error: 'Ugyldig bruker.' });
      return;
    }
    const token = typeof req.query.token === 'string' ? req.query.token : '';
    let allowed = false;
    if (token) {
      allowed = await resolveUser(token).then(Boolean, () => false);
    } else if (typeof req.query.kiosk === 'string' && typeof req.query.key === 'string') {
      const exchange = await (await getDatabase()).collection(exchangesCollection)
        .findOne({ id: req.query.kiosk, kioskToken: req.query.key, 'customers.uid': uid }, { projection: { _id: 1 } });
      allowed = Boolean(exchange);
    }
    if (!allowed) {
      res.status(401).json({ error: 'Ikke innlogget.' });
      return;
    }
    const avatar = await service.avatarFor(uid);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
    if (!avatar) {
      // Lets the browser skip asking again for a while; the page shows initials instead.
      res.setHeader('Cache-Control', 'private, max-age=600');
      res.status(404).end();
      return;
    }
    // The URL carries ?v=<avatarUpdatedAt>, so a new picture gets a new URL.
    res.setHeader('Cache-Control', 'private, max-age=2592000, immutable');
    res.setHeader('Content-Type', avatar.contentType);
    res.end(Buffer.from(avatar.data.buffer));
  });
}

export function registerProfileRoutes(router, service) {
  const uidParam = (req) => Number(req.params.uid);
  router.get('/profiles/:uid', handle((req) => service.getProfile(req.currentUser, uidParam(req))));
  router.get('/profiles/:uid/quotes', handle((req) => service.quotesAbout(uidParam(req))));
  router.put('/profile', handle((req) => service.updateProfile(req.currentUser, req.body ?? {})));
  router.put('/profile/email', handle((req) => service.changeEmail(req.currentUser, req.body ?? {})));
  router.post('/profile/avatar', handle((req) => service.uploadAvatar(req.currentUser, req.body?.imageDataUrl)));
  router.delete('/profile/avatar', handle((req) => service.removeAvatar(req.currentUser)));
}
