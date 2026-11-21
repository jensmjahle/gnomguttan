// Our own login, replacing VoceChat's.
//
// Accounts keep the uid VoceChat gave them, so every existing post, comment and
// mention stays linked. Until VOCECHAT_CUTOFF a user without an account here is
// checked against VoceChat once on login; their password is then hashed and stored
// here, and VoceChat is never asked again for them.
//
// Sessions are random tokens. Only their SHA-256 is stored, so a database leak
// doesn't hand out logins. They slide forward while in use and can be revoked.
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { COLLECTIONS } from './mongo.js';
import { burnPasswordCheck, hashPassword, passwordProblem, verifyPassword } from './passwords.js';
import { createRateLimiter } from './rateLimit.js';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

const SESSION_PREFIX = 'gns_';
// "Husk meg" keeps a session for 30 days after last use; without it, 12 hours.
const SESSION_IDLE = { remember: 30 * DAY, browser: 12 * HOUR };
const SESSION_MAX_AGE = { remember: 180 * DAY, browser: 7 * DAY };
const TOUCH_EVERY = 5 * MINUTE;
const SESSION_CACHE_MS = 10_000;
const INVITE_TTL = 7 * DAY;
const RESET_TTL = 24 * HOUR;
// Accounts made here start at this uid, so they can't collide with uids VoceChat
// still hands out before the cutoff.
const FIRST_LOCAL_UID = 100_000;
const NAME_MAX_LENGTH = 40;

export const hashToken = (token) => createHash('sha256').update(token).digest('hex');
export const isSessionToken = (token) => typeof token === 'string' && token.startsWith(SESSION_PREFIX);
const newToken = (prefix) => `${prefix}${randomBytes(32).toString('base64url')}`;

export function normalizeEmail(value) {
  const email = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254 ? email : '';
}

export class AuthError extends Error {
  constructor(status, message, retryAfterMs = 0) {
    super(message);
    this.name = 'AuthError';
    this.status = status;
    this.retryAfterMs = retryAfterMs;
  }
}

// Anything longer can't be a password we issued; refusing it early keeps scrypt cheap.
const MAX_PASSWORD_INPUT = 1024;
const tooMany = (ms) => new AuthError(429, `For mange forsøk. Prøv igjen om ${Math.max(1, Math.ceil(ms / MINUTE))} min.`, ms);
const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function publicUser(user) {
  return {
    uid: user.uid,
    name: user.name ?? '',
    email: user.email ?? '',
    avatarUpdatedAt: user.avatarUpdatedAt ?? 0,
    isAdmin: Boolean(user.isAdmin),
  };
}

function cleanName(value) {
  const name = typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
  if (name.length < 2 || name.length > NAME_MAX_LENGTH) throw new AuthError(400, `Navnet må ha 2–${NAME_MAX_LENGTH} tegn.`);
  if (/[\p{Cc}<>@]/u.test(name)) throw new AuthError(400, 'Navnet kan ikke inneholde @, < eller >.');
  return name;
}

export function createAuthService({
  getDatabase,
  vocechatHost = '',
  vocechatCutoff = null,
  publicUrl = '',
  fetchImpl = (...args) => fetch(...args),
  now = () => Date.now(),
}) {
  const loginByIp = createRateLimiter({ windowMs: 15 * MINUTE, max: 30, now });
  const loginByEmail = createRateLimiter({ windowMs: 15 * MINUTE, max: 8, now });
  const linksByIp = createRateLimiter({ windowMs: 15 * MINUTE, max: 20, now });
  const passwordByUid = createRateLimiter({ windowMs: 15 * MINUTE, max: 8, now });
  const sessionCache = new Map(); // tokenHash -> { result, until }

  const vocechatLegacyActive = () => Boolean(vocechatHost) && (!vocechatCutoff || now() < vocechatCutoff);
  const collection = async (name) => (await getDatabase()).collection(COLLECTIONS[name]);

  // ── Sessions ────────────────────────────────────────────────────────────────

  async function createSession(uid, { remember = false, ip = '', userAgent = '' } = {}) {
    const token = newToken(SESSION_PREFIX);
    const t = now();
    const kind = remember ? 'remember' : 'browser';
    const session = {
      id: randomUUID(),
      tokenHash: hashToken(token),
      uid,
      remember: Boolean(remember),
      createdAt: t,
      lastUsedAt: t,
      expiresAt: new Date(t + SESSION_IDLE[kind]),
      maxExpiresAt: t + SESSION_MAX_AGE[kind],
      userAgent: String(userAgent).slice(0, 300),
      ip: String(ip).slice(0, 64),
    };
    await (await collection('sessions')).insertOne(session);
    return { token, session };
  }

  /** The user behind one of our session tokens, sliding its expiry; null when unknown or expired. */
  async function resolveSession(token) {
    const tokenHash = hashToken(token);
    const t = now();
    const cached = sessionCache.get(tokenHash);
    if (cached && cached.until > t) return cached.result;

    const db = await getDatabase();
    const session = await db.collection(COLLECTIONS.sessions).findOne({ tokenHash });
    if (!session || session.expiresAt.getTime() <= t || session.maxExpiresAt <= t) {
      sessionCache.delete(tokenHash);
      return null;
    }
    const user = await db.collection(COLLECTIONS.users).findOne({ uid: session.uid });
    if (!user || user.disabled) return null;

    if (t - session.lastUsedAt > TOUCH_EVERY) {
      const idle = SESSION_IDLE[session.remember ? 'remember' : 'browser'];
      await Promise.all([
        db.collection(COLLECTIONS.sessions).updateOne(
          { id: session.id },
          { $set: { lastUsedAt: t, expiresAt: new Date(Math.min(t + idle, session.maxExpiresAt)) } },
        ),
        db.collection(COLLECTIONS.users).updateOne({ uid: user.uid }, { $set: { lastSeenAt: t } }),
      ]);
    }
    const result = { user: publicUser(user), sessionId: session.id };
    sessionCache.set(tokenHash, { result, until: t + SESSION_CACHE_MS });
    return result;
  }

  async function revokeSessions(filter) {
    const sessions = await collection('sessions');
    const doomed = await sessions.find(filter).project({ tokenHash: 1 }).toArray();
    if (!doomed.length) return 0;
    for (const { tokenHash } of doomed) sessionCache.delete(tokenHash);
    await sessions.deleteMany({ tokenHash: { $in: doomed.map((s) => s.tokenHash) } });
    return doomed.length;
  }

  async function listSessions(uid, currentSessionId) {
    const sessions = await (await collection('sessions'))
      .find({ uid, expiresAt: { $gt: new Date(now()) } })
      .sort({ lastUsedAt: -1 })
      .toArray();
    return sessions.map((s) => ({
      id: s.id,
      current: s.id === currentSessionId,
      remember: s.remember,
      createdAt: s.createdAt,
      lastUsedAt: s.lastUsedAt,
      userAgent: s.userAgent,
      ip: s.ip,
    }));
  }

  async function sessionPayload(uid, options) {
    const user = await (await collection('users')).findOne({ uid });
    if (!user || user.disabled) throw new AuthError(403, 'Kontoen er deaktivert.');
    const { token, session } = await createSession(uid, options);
    return {
      token,
      expiresAt: session.expiresAt.getTime(),
      remember: session.remember,
      user: publicUser(user),
      vocechatLegacy: vocechatLegacyActive(),
    };
  }

  // ── VoceChat, during the transition ─────────────────────────────────────────

  async function vocechatLogin(email, password) {
    let res;
    try {
      res = await fetchImpl(`${vocechatHost}/api/token/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ credential: { type: 'password', email, password }, device: 'gnomguttan-migrering', device_token: '' }),
        signal: AbortSignal.timeout(10_000),
      });
    } catch {
      throw new AuthError(503, 'Innloggingen er utilgjengelig akkurat nå. Prøv igjen om litt.');
    }
    if ([401, 403, 404, 423].includes(res.status)) return null;
    if (!res.ok) throw new AuthError(503, 'Innloggingen er utilgjengelig akkurat nå. Prøv igjen om litt.');
    return res.json();
  }

  function vocechatLogout(token) {
    void fetchImpl(`${vocechatHost}/api/token/logout`, { headers: { 'X-API-Key': token }, signal: AbortSignal.timeout(5000) }).catch(() => {});
  }

  /** Checks a password against VoceChat; the VoceChat user when it's right, null when it's wrong. */
  async function verifyWithVoceChat(email, password) {
    const payload = await vocechatLogin(email, password);
    if (!payload) return null;
    if (payload.token) vocechatLogout(payload.token); // leave no session behind on their side
    const user = payload.user ?? {};
    const uid = Number(user.uid);
    if (!Number.isInteger(uid) || uid <= 0 || user.is_bot) return null;
    return {
      uid,
      name: String(user.name ?? '').trim(),
      email: normalizeEmail(user.email) || email,
      isAdmin: Boolean(user.is_admin),
    };
  }

  /** Stores our own hash for someone VoceChat just vouched for. */
  async function adoptVoceChatUser(vcUser, password, source = 'vocechat-login') {
    const db = await getDatabase();
    const t = now();
    await db.collection(COLLECTIONS.users).updateOne(
      { uid: vcUser.uid },
      {
        // The picture is ours now (copied from VoceChat or uploaded), so its date isn't overwritten.
        $set: { email: vcUser.email, isAdmin: vcUser.isAdmin },
        $setOnInsert: { uid: vcUser.uid, createdAt: t, avatarUpdatedAt: 0 },
      },
      { upsert: true },
    );
    if (vcUser.name) {
      await db.collection(COLLECTIONS.users).updateOne(
        { uid: vcUser.uid, $or: [{ name: { $exists: false } }, { name: '' }] },
        { $set: { name: vcUser.name } },
      );
    }
    // Upsert by uid: if their VoceChat email changed since an earlier migration, the account follows it.
    await db.collection(COLLECTIONS.accounts).updateOne(
      { uid: vcUser.uid },
      {
        $set: { email: vcUser.email, passwordHash: await hashPassword(password), passwordChangedAt: t, updatedAt: t },
        $setOnInsert: { uid: vcUser.uid, createdAt: t, source },
      },
      { upsert: true },
    );
  }

  /** Best effort: keep the VoceChat password in step until the cutoff, so its chat still lets them in. */
  async function syncVoceChatPassword(email, oldPassword, newPassword) {
    if (!vocechatLegacyActive()) return false;
    try {
      const payload = await vocechatLogin(email, oldPassword);
      if (!payload?.token) return false;
      const res = await fetchImpl(`${vocechatHost}/api/user/change_password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-API-Key': payload.token },
        body: JSON.stringify({ old_password: oldPassword, new_password: newPassword }),
        signal: AbortSignal.timeout(10_000),
      });
      vocechatLogout(payload.token);
      return res.ok;
    } catch {
      return false;
    }
  }

  // ── Login, password changes ─────────────────────────────────────────────────

  async function login({ email, password, remember, ip, userAgent }) {
    const normalized = normalizeEmail(email);
    if (!normalized || typeof password !== 'string' || !password) throw new AuthError(400, 'Skriv inn e-post og passord.');
    if (password.length > MAX_PASSWORD_INPUT) throw new AuthError(401, 'Feil e-post eller passord.');
    const wait = Math.max(loginByIp.blockedFor(ip), loginByEmail.blockedFor(normalized));
    if (wait) throw tooMany(wait);
    loginByIp.hit(ip);

    const accounts = await collection('accounts');
    let account = await accounts.findOne({ email: normalized });
    let ok = false;
    if (account) {
      ok = await verifyPassword(password, account.passwordHash);
    } else if (vocechatLegacyActive()) {
      const vcUser = await verifyWithVoceChat(normalized, password);
      if (vcUser) {
        await adoptVoceChatUser(vcUser, password);
        account = await accounts.findOne({ uid: vcUser.uid });
        ok = Boolean(account);
      }
    } else {
      await burnPasswordCheck(password);
    }

    if (!ok) {
      loginByEmail.hit(normalized);
      throw new AuthError(401, 'Feil e-post eller passord.');
    }
    loginByEmail.reset(normalized);
    await accounts.updateOne({ uid: account.uid }, { $set: { lastLoginAt: now() } });
    return sessionPayload(account.uid, { remember, ip, userAgent });
  }

  async function changePassword({ uid, sessionId, currentPassword, newPassword }) {
    const wait = passwordByUid.blockedFor(uid);
    if (wait) throw tooMany(wait);
    const db = await getDatabase();
    if (String(currentPassword ?? '').length > MAX_PASSWORD_INPUT) throw new AuthError(403, 'Nåværende passord er feil.');
    const account = await db.collection(COLLECTIONS.accounts).findOne({ uid });
    if (!account) throw new AuthError(409, 'Logg ut og inn igjen med passordet ditt før du bytter det.');
    if (!(await verifyPassword(String(currentPassword ?? ''), account.passwordHash))) {
      passwordByUid.hit(uid);
      throw new AuthError(403, 'Nåværende passord er feil.');
    }
    passwordByUid.reset(uid);
    if (newPassword === currentPassword) throw new AuthError(400, 'Det nye passordet må være annerledes enn det gamle.');
    const user = await db.collection(COLLECTIONS.users).findOne({ uid });
    const problem = passwordProblem(newPassword, { email: account.email, name: user?.name });
    if (problem) throw new AuthError(400, problem);

    const t = now();
    await db.collection(COLLECTIONS.accounts).updateOne(
      { uid },
      { $set: { passwordHash: await hashPassword(newPassword), passwordChangedAt: t, updatedAt: t } },
    );
    const signedOut = await revokeSessions({ uid, id: { $ne: sessionId } });
    const vocechatSynced = await syncVoceChatPassword(account.email, currentPassword, newPassword);
    return { signedOut, vocechatSynced };
  }

  // ── Invites and reset links ─────────────────────────────────────────────────

  async function nextLocalUid() {
    const db = await getDatabase();
    const [highest] = await db.collection(COLLECTIONS.users).find().sort({ uid: -1 }).limit(1).project({ uid: 1 }).toArray();
    const counters = db.collection(COLLECTIONS.counters);
    await counters.updateOne({ _id: 'uid' }, { $max: { value: Math.max(FIRST_LOCAL_UID - 1, highest?.uid ?? 0) } }, { upsert: true });
    const counter = await counters.findOneAndUpdate({ _id: 'uid' }, { $inc: { value: 1 } }, { returnDocument: 'after' });
    return counter.value;
  }

  async function createLink(kind, { uid = null, createdBy, note = '' }) {
    const token = newToken(kind === 'invite' ? 'gni_' : 'gnr_');
    const t = now();
    const link = {
      id: randomUUID(),
      kind,
      tokenHash: hashToken(token),
      uid,
      note: String(note).slice(0, 100),
      createdBy: { uid: createdBy.uid, name: createdBy.name },
      createdAt: t,
      expiresAt: new Date(t + (kind === 'invite' ? INVITE_TTL : RESET_TTL)),
      usedAt: null,
    };
    const links = await collection('authLinks');
    // A new reset link replaces any older unused one for the same person.
    if (kind === 'reset') await links.deleteMany({ kind, uid, usedAt: null });
    await links.insertOne(link);
    // The token rides in the URL fragment, which browsers never send to servers or in Referer headers.
    const page = kind === 'invite' ? 'registrer' : 'tilbakestill';
    return { id: link.id, url: `${publicUrl}/${page}#${token}`, expiresAt: link.expiresAt.getTime() };
  }

  async function findLink(kind, token, ip) {
    const wait = linksByIp.blockedFor(ip);
    if (wait) throw tooMany(wait);
    linksByIp.hit(ip);
    const link = typeof token === 'string' && token
      ? await (await collection('authLinks')).findOne({ kind, tokenHash: hashToken(token), usedAt: null, expiresAt: { $gt: new Date(now()) } })
      : null;
    if (!link) throw new AuthError(404, 'Lenken er ugyldig eller utløpt. Be en admin om en ny.');
    return link;
  }

  /** Marks a link used; false if someone else got there first. */
  async function claimLink(link, uid) {
    const result = await (await collection('authLinks')).updateOne(
      { id: link.id, usedAt: null },
      { $set: { usedAt: now(), usedBy: uid } },
    );
    return result.modifiedCount === 1;
  }

  async function checkInvite({ token, ip }) {
    const link = await findLink('invite', token, ip);
    return { expiresAt: link.expiresAt.getTime(), invitedBy: link.createdBy.name };
  }

  async function register({ token, name, email, password, remember, ip, userAgent }) {
    const link = await findLink('invite', token, ip);
    const cleanedName = cleanName(name);
    const normalized = normalizeEmail(email);
    if (!normalized) throw new AuthError(400, 'Skriv inn en gyldig e-postadresse.');
    const problem = passwordProblem(password, { email: normalized, name: cleanedName });
    if (problem) throw new AuthError(400, problem);

    const db = await getDatabase();
    const users = db.collection(COLLECTIONS.users);
    if (await users.findOne({ name: { $regex: `^${escapeRegex(cleanedName)}$`, $options: 'i' } })) {
      throw new AuthError(409, 'Navnet er allerede tatt.');
    }
    if (await db.collection(COLLECTIONS.accounts).findOne({ email: normalized }) || await users.findOne({ email: normalized })) {
      throw new AuthError(409, 'E-postadressen er allerede i bruk.');
    }

    const uid = await nextLocalUid();
    if (!(await claimLink(link, uid))) throw new AuthError(404, 'Lenken er allerede brukt.');
    const t = now();
    await users.insertOne({ uid, name: cleanedName, email: normalized, isAdmin: false, avatarUpdatedAt: 0, createdAt: t, lastSeenAt: t });
    await db.collection(COLLECTIONS.accounts).insertOne({
      uid,
      email: normalized,
      passwordHash: await hashPassword(password),
      source: 'invite',
      invitedBy: link.createdBy.uid,
      createdAt: t,
      passwordChangedAt: t,
      lastLoginAt: t,
    });
    return sessionPayload(uid, { remember, ip, userAgent });
  }

  async function checkReset({ token, ip }) {
    const link = await findLink('reset', token, ip);
    const user = await (await collection('users')).findOne({ uid: link.uid });
    return { expiresAt: link.expiresAt.getTime(), name: user?.name ?? '' };
  }

  async function resetPassword({ token, password, remember, ip, userAgent }) {
    const link = await findLink('reset', token, ip);
    const db = await getDatabase();
    const user = await db.collection(COLLECTIONS.users).findOne({ uid: link.uid });
    const account = await db.collection(COLLECTIONS.accounts).findOne({ uid: link.uid });
    const email = account?.email || normalizeEmail(user?.email);
    if (!user || !email) throw new AuthError(409, 'Brukeren mangler e-postadresse. Be en admin om hjelp.');
    const problem = passwordProblem(password, { email, name: user.name });
    if (problem) throw new AuthError(400, problem);
    if (!(await claimLink(link, link.uid))) throw new AuthError(404, 'Lenken er allerede brukt.');

    const t = now();
    await db.collection(COLLECTIONS.accounts).updateOne(
      { uid: link.uid },
      {
        $set: { email, passwordHash: await hashPassword(password), passwordChangedAt: t, updatedAt: t },
        $setOnInsert: { uid: link.uid, createdAt: t, source: 'reset' },
      },
      { upsert: true },
    );
    // Whoever knew the old password is logged out everywhere.
    await revokeSessions({ uid: link.uid });
    return sessionPayload(link.uid, { remember, ip, userAgent });
  }

  // ── Admin ───────────────────────────────────────────────────────────────────

  async function listUsersForAdmin() {
    const db = await getDatabase();
    const [users, accounts] = await Promise.all([
      db.collection(COLLECTIONS.users).find({ name: { $exists: true, $ne: '' } }).sort({ name: 1 }).toArray(),
      db.collection(COLLECTIONS.accounts).find().project({ uid: 1, source: 1, lastLoginAt: 1 }).toArray(),
    ]);
    const byUid = new Map(accounts.map((a) => [a.uid, a]));
    return users.map((u) => ({
      ...publicUser(u),
      lastSeenAt: u.lastSeenAt ?? null,
      hasAccount: byUid.has(u.uid),
      accountSource: byUid.get(u.uid)?.source ?? null,
      lastLoginAt: byUid.get(u.uid)?.lastLoginAt ?? null,
    }));
  }

  /** Admin status lives here now that VoceChat no longer decides it. */
  async function setAdmin(actor, uid, isAdmin) {
    if (uid === actor.uid) throw new AuthError(400, 'Du kan ikke endre din egen admin-rolle.');
    const users = await collection('users');
    if (!(await users.findOne({ uid }))) throw new AuthError(404, 'Fant ikke personen.');
    await users.updateOne({ uid }, { $set: { isAdmin: Boolean(isAdmin) } });
    sessionCache.clear(); // their open sessions see the change straight away
  }

  async function listInvites() {
    const links = await (await collection('authLinks'))
      .find({ kind: 'invite', usedAt: null, expiresAt: { $gt: new Date(now()) } })
      .sort({ createdAt: -1 })
      .toArray();
    return links.map((l) => ({ id: l.id, note: l.note, createdBy: l.createdBy, createdAt: l.createdAt, expiresAt: l.expiresAt.getTime() }));
  }

  async function deleteInvite(id) {
    await (await collection('authLinks')).deleteOne({ id, kind: 'invite', usedAt: null });
  }

  return {
    vocechatLegacyActive,
    resolveSession,
    createSession,
    revokeSessions,
    listSessions,
    login,
    changePassword,
    adoptVoceChatUser,
    createLink,
    checkInvite,
    register,
    checkReset,
    resetPassword,
    listUsersForAdmin,
    setAdmin,
    listInvites,
    deleteInvite,
  };
}

// ── Routes ────────────────────────────────────────────────────────────────────

function handle(fn) {
  return async (req, res) => {
    try {
      res.setHeader('Cache-Control', 'no-store');
      const result = await fn(req, res);
      if (!res.headersSent) res.json(result ?? { ok: true });
    } catch (error) {
      if (error instanceof AuthError) {
        if (error.retryAfterMs) res.setHeader('Retry-After', String(Math.ceil(error.retryAfterMs / 1000)));
        res.status(error.status).json({ error: error.message });
        return;
      }
      console.error('[Auth]', error);
      res.status(500).json({ error: 'Noe gikk galt. Prøv igjen.' });
    }
  };
}

const client = (req) => ({ ip: req.ip ?? '', userAgent: req.get('User-Agent') ?? '' });

/** Routes that work without a login. Register before the auth middleware. */
export function registerPublicAuthRoutes(router, auth) {
  router.post('/auth/login', handle((req) => auth.login({ ...client(req), email: req.body?.email, password: req.body?.password, remember: req.body?.remember === true })));
  router.post('/auth/invite/check', handle((req) => auth.checkInvite({ ...client(req), token: req.body?.token })));
  router.post('/auth/register', handle((req) => auth.register({
    ...client(req),
    token: req.body?.token,
    name: req.body?.name,
    email: req.body?.email,
    password: req.body?.password,
    remember: req.body?.remember === true,
  })));
  router.post('/auth/reset/check', handle((req) => auth.checkReset({ ...client(req), token: req.body?.token })));
  router.post('/auth/reset', handle((req) => auth.resetPassword({ ...client(req), token: req.body?.token, password: req.body?.password, remember: req.body?.remember === true })));
}

function requireAdmin(req) {
  if (!req.currentUser?.isAdmin) throw new AuthError(403, 'Kun for administratorer.');
}

/** Routes for logged-in users. Register after the auth middleware. */
export function registerAuthRoutes(router, auth) {
  router.post('/auth/logout', handle(async (req) => {
    if (req.sessionId) await auth.revokeSessions({ id: req.sessionId });
  }));
  router.get('/auth/sessions', handle((req) => auth.listSessions(req.currentUser.uid, req.sessionId)));
  router.delete('/auth/sessions/:id', handle(async (req) => {
    await auth.revokeSessions({ uid: req.currentUser.uid, id: String(req.params.id) });
  }));
  router.post('/auth/sessions/revoke-others', handle(async (req) => ({
    signedOut: await auth.revokeSessions({ uid: req.currentUser.uid, id: { $ne: req.sessionId ?? '' } }),
  })));
  router.post('/auth/password', handle((req) => auth.changePassword({
    uid: req.currentUser.uid,
    sessionId: req.sessionId ?? '',
    currentPassword: req.body?.currentPassword,
    newPassword: req.body?.newPassword,
  })));

  router.get('/auth/admin/users', handle((req) => { requireAdmin(req); return auth.listUsersForAdmin(); }));
  router.post('/auth/admin/users/:uid/reset-link', handle(async (req) => {
    requireAdmin(req);
    const uid = Number(req.params.uid);
    if (!Number.isInteger(uid)) throw new AuthError(400, 'Ugyldig bruker.');
    return auth.createLink('reset', { uid, createdBy: req.currentUser });
  }));
  router.put('/auth/admin/users/:uid/admin', handle(async (req) => {
    requireAdmin(req);
    const uid = Number(req.params.uid);
    if (!Number.isInteger(uid) || typeof req.body?.isAdmin !== 'boolean') throw new AuthError(400, 'Ugyldig forespørsel.');
    await auth.setAdmin(req.currentUser, uid, req.body.isAdmin);
  }));
  router.get('/auth/admin/invites', handle((req) => { requireAdmin(req); return auth.listInvites(); }));
  router.post('/auth/admin/invites', handle((req) => {
    requireAdmin(req);
    return auth.createLink('invite', { createdBy: req.currentUser, note: req.body?.note ?? '' });
  }));
  router.delete('/auth/admin/invites/:id', handle(async (req) => {
    requireAdmin(req);
    await auth.deleteInvite(String(req.params.id));
  }));
}
