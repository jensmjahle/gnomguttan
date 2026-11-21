// Copies the media posted in VoceChat channels into our own storage, so Galleri and
// Arkiv keep working after VoceChat is switched off. Chat messages themselves are not
// copied. Files sent in direct messages are skipped (they're private), and files from
// private channels stay visible only to that channel's members and admins.
//
// VoceChat's download URLs are public, so only listing the files needs a VoceChat
// token, and any logged-in user's will do: the pages that show media ask for a sync
// now and then, and new files are downloaded in the background, newest first.
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';
import { COLLECTIONS } from './mongo.js';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const defaultVoceChatMediaDir = path.resolve(
  process.env.VOCECHAT_MEDIA_DIR?.trim() || path.join(rootDir, 'data', 'vocechat-media'),
);

const PAGE_SIZE = 500;
const MAX_PAGES = 200;
const SYNC_EVERY = 10 * 60_000;
const DOWNLOAD_CONCURRENCY = 3;
const MAX_ATTEMPTS = 5;
const LIST_LIMIT = 10_000;

// Shown inline; everything else is sent as a download so an uploaded HTML or SVG file
// can never run as a page on our origin.
const INLINE_TYPES = /^(image\/(jpeg|png|gif|webp|avif|bmp|heic|heif)|video\/|audio\/|application\/pdf$)/i;

const IMAGE_EXTS = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg', 'avif', 'heic', 'heif'];
const AUDIO_EXTS = ['mp3', 'wav', 'ogg', 'm4a', 'flac', 'aac'];
const VIDEO_EXTS = ['mp4', 'mov', 'mkv', 'webm', 'avi', 'm4v'];
const DOC_EXTS = ['txt', 'md', 'rtf', 'doc', 'docx', 'odt'];

/** The same buckets the archive filters on. */
export function fileKind(contentType = '', ext = '') {
  const type = String(contentType).toLowerCase();
  const e = String(ext).toLowerCase().replace(/^\./, '');
  if (type.startsWith('image/') || IMAGE_EXTS.includes(e)) return 'image';
  if (type.startsWith('audio/') || AUDIO_EXTS.includes(e)) return 'audio';
  if (type.startsWith('video/') || VIDEO_EXTS.includes(e)) return 'video';
  if (type === 'application/pdf' || e === 'pdf') return 'pdf';
  if (type.startsWith('text/') || DOC_EXTS.includes(e)) return 'doc';
  return 'file';
}

function parseProperties(value) {
  if (value && typeof value === 'object') return value;
  try { return JSON.parse(String(value ?? '')) ?? {}; } catch { return {}; }
}

function sanitizeFilename(name) {
  return String(name || 'fil').replace(/[\r\n"\\/]/g, '_').slice(0, 150);
}

export function publicMediaItem(item, groupNames = new Map()) {
  return {
    id: item.id,
    mid: item.mid,
    fromUid: item.fromUid,
    gid: item.gid,
    groupName: groupNames.get(item.gid) ?? null,
    kind: item.kind,
    contentType: item.contentType,
    ext: item.ext,
    name: item.name,
    size: item.size,
    createdAt: item.createdAt,
    stored: item.status === 'stored',
    hasThumbnail: Boolean(item.thumbnailFile),
  };
}

export class MediaError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export function createVoceChatMediaService({
  getDatabase,
  vocechatHost,
  isLegacyActive = () => true,
  mediaDir = defaultVoceChatMediaDir,
  fetchImpl = (...args) => fetch(...args),
  now = () => Date.now(),
  log = console,
}) {
  let syncing = null;
  let lastSyncAt = 0;
  let lastSyncError = '';
  let worker = null;
  let retryTimer = null;

  const media = async () => (await getDatabase()).collection(COLLECTIONS.vocechatMedia);
  const groupsCollection = async () => (await getDatabase()).collection(COLLECTIONS.vocechatGroups);

  async function vocechatJson(pathAndQuery, token) {
    const res = await fetchImpl(`${vocechatHost}${pathAndQuery}`, {
      headers: { 'X-API-Key': token },
      signal: AbortSignal.timeout(60_000),
    });
    if (res.status === 401 || res.status === 403) throw new MediaError(401, 'VoceChat-innloggingen er utløpt.');
    if (!res.ok) throw new Error(`VoceChat svarte ${res.status} på ${pathAndQuery.split('?')[0]}`);
    return res.json();
  }

  /** Every file VoceChat lists, paged the same way the old gallery did. */
  async function listVoceChatFiles(token) {
    const byMid = new Map();
    const add = (batch) => {
      for (const file of Array.isArray(batch) ? batch : []) if (Number.isFinite(file?.mid)) byMid.set(file.mid, file);
    };
    const first = await vocechatJson(`/api/admin/system/files?page_size=${PAGE_SIZE}`, token);
    add(first);
    if (Array.isArray(first) && first.length >= PAGE_SIZE) {
      for (let page = 1; page <= MAX_PAGES; page += 1) {
        const batch = await vocechatJson(`/api/admin/system/files?page_size=${PAGE_SIZE}&page=${page}`, token);
        const before = byMid.size;
        add(batch);
        if (!Array.isArray(batch) || batch.length === 0) break;
        if (page > 1 && byMid.size === before) break;
        if (batch.length < PAGE_SIZE) break;
      }
    }
    return [...byMid.values()];
  }

  async function syncGroups(token) {
    const groups = await vocechatJson('/api/group', token);
    const collection = await groupsCollection();
    for (const group of Array.isArray(groups) ? groups : []) {
      const gid = Number(group?.gid);
      if (!Number.isInteger(gid) || gid <= 0) continue;
      const isPublic = Boolean(group.is_public);
      await collection.updateOne(
        { gid },
        {
          $set: { gid, name: String(group.name ?? '').trim(), isPublic, updatedAt: now() },
          // Members of private channels add up as different people sync.
          ...(isPublic ? {} : { $addToSet: { members: { $each: (group.members ?? []).map(Number).filter(Number.isInteger) } } }),
        },
        { upsert: true },
      );
    }
  }

  async function runSync(token) {
    await syncGroups(token);
    const files = await listVoceChatFiles(token);
    const collection = await media();
    const ops = [];
    for (const file of files) {
      const gid = Number(file.gid);
      if (file.expired || !Number.isInteger(gid) || gid <= 0) continue; // DMs and expired files stay behind
      if (typeof file.content !== 'string' || !file.content) continue;
      const props = parseProperties(file.properties);
      const contentType = String(props.content_type || file.content_type || 'application/octet-stream');
      const ext = String(file.ext ?? '').replace(/^\./, '').toLowerCase();
      ops.push({
        updateOne: {
          filter: { filePath: file.content },
          update: {
            $set: {
              mid: Number(file.mid),
              fromUid: Number(file.from_uid),
              gid,
              contentType,
              ext,
              kind: fileKind(contentType, ext),
              name: String(props.name || '').trim() || `Fil ${file.mid}`,
              size: Number(props.size) || null,
              createdAt: Number(file.created_at) || 0,
              thumbnailPath: typeof file.thumbnail === 'string' && file.thumbnail ? file.thumbnail : null,
            },
            $setOnInsert: { id: randomUUID(), filePath: file.content, status: 'pending', attempts: 0, firstSeenAt: now() },
          },
          upsert: true,
        },
      });
    }
    for (let i = 0; i < ops.length; i += 500) await collection.bulkWrite(ops.slice(i, i + 500), { ordered: false });
    return ops.length;
  }

  /** Lists what VoceChat has and queues anything new. At most every 10 minutes unless forced. */
  function requestSync(token, { force = false } = {}) {
    if (!vocechatHost || !isLegacyActive()) return { started: false, reason: 'VoceChat er slått av.' };
    if (!token) return { started: false, reason: 'Mangler VoceChat-innlogging.' };
    if (syncing) return { started: false, reason: 'Synkroniserer allerede.' };
    if (!force && now() - lastSyncAt < SYNC_EVERY) return { started: false, reason: 'Synkronisert nylig.' };
    lastSyncAt = now();
    syncing = runSync(token)
      .then((count) => {
        lastSyncError = '';
        log.log?.(`[VoceChatMedia] Synced ${count} channel files from VoceChat.`);
      })
      .catch((error) => {
        lastSyncError = error.message;
        if (error instanceof MediaError) lastSyncAt = 0; // someone else's token may work
        log.warn?.('[VoceChatMedia] Sync failed:', error.message);
      })
      .finally(() => {
        syncing = null;
        kick();
      });
    return { started: true };
  }

  async function fetchToFile(url, target) {
    const res = await fetchImpl(url, { signal: AbortSignal.timeout(15 * 60_000) });
    if (res.status === 404) return null;
    if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
    const part = `${target}.part`;
    await pipeline(Readable.fromWeb(res.body), fs.createWriteStream(part));
    await fsp.rename(part, target);
    return (await fsp.stat(target)).size;
  }

  async function downloadOne(item) {
    const collection = await media();
    const resource = (filePath, thumbnail = false) =>
      `${vocechatHost}/api/resource/file?file_path=${encodeURIComponent(filePath)}${thumbnail ? '&thumbnail=true' : ''}`;
    try {
      const bytes = await fetchToFile(resource(item.filePath), path.join(mediaDir, item.id));
      if (bytes === null) {
        await collection.updateOne({ id: item.id }, { $set: { status: 'missing', checkedAt: now() } });
        return;
      }
      let thumbnailFile = null;
      if (item.kind === 'image') {
        const thumbTarget = path.join(mediaDir, `${item.id}.thumb`);
        const candidates = [resource(item.filePath, true), ...(item.thumbnailPath ? [resource(item.thumbnailPath)] : [])];
        for (const url of candidates) {
          const thumbBytes = await fetchToFile(url, thumbTarget).catch(() => null);
          if (thumbBytes) { thumbnailFile = `${item.id}.thumb`; break; }
        }
      }
      await collection.updateOne(
        { id: item.id },
        { $set: { status: 'stored', storedFile: item.id, storedSize: bytes, thumbnailFile, storedAt: now(), error: null } },
      );
    } catch (error) {
      const attempts = (item.attempts ?? 0) + 1;
      await collection.updateOne(
        { id: item.id },
        { $set: { status: 'failed', attempts, error: String(error.message).slice(0, 200), nextAttemptAt: now() + 2 ** attempts * 60_000 } },
      );
    }
  }

  /** Starts the background downloader if it isn't running. */
  function kick() {
    if (worker || !vocechatHost) return;
    worker = (async () => {
      await fsp.mkdir(mediaDir, { recursive: true });
      const collection = await media();
      for (;;) {
        const batch = await collection
          .find({
            $or: [
              { status: 'pending' },
              { status: 'failed', attempts: { $lt: MAX_ATTEMPTS }, nextAttemptAt: { $lte: now() } },
            ],
          })
          .sort({ createdAt: -1 })
          .limit(DOWNLOAD_CONCURRENCY * 4)
          .toArray();
        if (!batch.length) break;
        for (let i = 0; i < batch.length; i += DOWNLOAD_CONCURRENCY) {
          await Promise.all(batch.slice(i, i + DOWNLOAD_CONCURRENCY).map(downloadOne));
        }
      }
      const waiting = await collection.countDocuments({ status: 'failed', attempts: { $lt: MAX_ATTEMPTS } });
      if (waiting && !retryTimer) {
        retryTimer = setTimeout(() => { retryTimer = null; kick(); }, 5 * 60_000);
        retryTimer.unref?.();
      }
    })()
      .catch((error) => log.warn?.('[VoceChatMedia] Download worker stopped:', error.message))
      .finally(() => { worker = null; });
  }

  /** Waits for a running sync and download pass (for tests and scripts). */
  async function idle() {
    while (syncing || worker) await (syncing ?? worker);
  }

  // ── Reading ─────────────────────────────────────────────────────────────────

  async function visibleGroups(user) {
    const filter = user.isAdmin ? {} : { $or: [{ isPublic: true }, { members: user.uid }] };
    return (await groupsCollection()).find(filter).sort({ name: 1 }).toArray();
  }

  async function list(user, { kind, gid, uid } = {}) {
    const groups = await visibleGroups(user);
    const groupNames = new Map(groups.map((g) => [g.gid, g.name]));
    const filter = { status: { $ne: 'missing' }, gid: { $in: [...groupNames.keys()] } };
    if (user.isAdmin) delete filter.gid; // admins also see files from channels nobody has synced the members of
    if (kind) filter.kind = kind;
    if (Number.isInteger(gid)) filter.gid = gid;
    if (Number.isInteger(uid)) filter.fromUid = uid;
    const items = await (await media()).find(filter).sort({ createdAt: -1, mid: -1 }).limit(LIST_LIMIT).toArray();
    return items.map((item) => publicMediaItem(item, groupNames));
  }

  async function findVisible(user, id) {
    const item = await (await media()).findOne({ id: String(id) });
    if (!item) return null;
    if (user.isAdmin) return item;
    const group = await (await groupsCollection()).findOne({ gid: item.gid });
    return group && (group.isPublic || group.members?.includes(user.uid)) ? item : null;
  }

  async function status() {
    const counts = Object.fromEntries(
      (await (await media()).aggregate([{ $group: { _id: '$status', n: { $sum: 1 }, bytes: { $sum: { $ifNull: ['$storedSize', 0] } } } }]).toArray())
        .map((row) => [row._id, { n: row.n, bytes: row.bytes }]),
    );
    const n = (key) => counts[key]?.n ?? 0;
    return {
      total: n('stored') + n('pending') + n('failed') + n('missing'),
      stored: n('stored'),
      pending: n('pending') + n('failed'),
      missing: n('missing'),
      storedBytes: counts.stored?.bytes ?? 0,
      syncing: Boolean(syncing),
      downloading: Boolean(worker),
      lastSyncAt: lastSyncAt || null,
      lastSyncError: lastSyncError || null,
      active: Boolean(vocechatHost) && isLegacyActive(),
    };
  }

  return { requestSync, kick, idle, list, findVisible, status, visibleGroups, mediaDir, vocechatHost };
}

// ── Routes ────────────────────────────────────────────────────────────────────

async function streamFile(req, res, absPath, { contentType, download, downloadName }) {
  let stat;
  try { stat = await fsp.stat(absPath); } catch { stat = null; }
  if (!stat) {
    res.status(404).json({ error: 'Fant ikke filen.' });
    return;
  }
  const inline = !download && INLINE_TYPES.test(contentType);
  res.setHeader('Content-Type', inline ? contentType : 'application/octet-stream');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Security-Policy', "default-src 'none'; img-src 'self'; media-src 'self'; style-src 'unsafe-inline'; sandbox");
  res.setHeader('Cache-Control', 'private, max-age=86400');
  res.setHeader('Accept-Ranges', 'bytes');
  if (!inline) res.setHeader('Content-Disposition', `attachment; filename="${sanitizeFilename(downloadName)}"`);

  const total = stat.size;
  const range = /bytes=(\d*)-(\d*)/.exec(req.headers.range ?? '');
  if (range) {
    const start = range[1] ? parseInt(range[1], 10) : 0;
    const end = range[2] ? Math.min(parseInt(range[2], 10), total - 1) : total - 1;
    if (start > end || start >= total) {
      res.status(416).setHeader('Content-Range', `bytes */${total}`);
      res.end();
      return;
    }
    res.status(206);
    res.setHeader('Content-Range', `bytes ${start}-${end}/${total}`);
    res.setHeader('Content-Length', end - start + 1);
    fs.createReadStream(absPath, { start, end }).on('error', () => res.destroy()).pipe(res);
    return;
  }
  res.setHeader('Content-Length', total);
  fs.createReadStream(absPath).on('error', () => res.destroy()).pipe(res);
}

/** File routes take ?token= (for <img>/<video>), so register them before the auth middleware. */
export function registerVoceChatMediaFileRoutes(router, service, { resolveUser }) {
  async function userFromQuery(req, res) {
    const token = typeof req.query.token === 'string' ? req.query.token.trim() : '';
    try {
      if (token) return await resolveUser(token);
    } catch (error) {
      if (error?.name !== 'UnauthorizedError') {
        res.status(503).json({ error: 'Innloggingen er utilgjengelig.' });
        return null;
      }
    }
    res.status(401).json({ error: 'Ikke innlogget.' });
    return null;
  }

  for (const variant of ['file', 'thumbnail']) {
    router.get(`/vocechat-media/:id/${variant}`, async (req, res) => {
      const user = await userFromQuery(req, res);
      if (!user) return;
      const item = await service.findVisible(user, req.params.id);
      if (!item || item.status === 'missing') {
        res.status(404).json({ error: 'Fant ikke filen.' });
        return;
      }
      if (item.status !== 'stored') {
        // Not copied yet: hand over VoceChat's own (public) link meanwhile, and hurry the copy along.
        service.kick();
        if (!service.vocechatHost) {
          res.status(404).json({ error: 'Filen er ikke kopiert.' });
          return;
        }
        const thumb = variant === 'thumbnail' && item.kind === 'image' ? '&thumbnail=true' : '';
        res.redirect(302, `${service.vocechatHost}/api/resource/file?file_path=${encodeURIComponent(item.filePath)}${thumb}`);
        return;
      }
      const useThumb = variant === 'thumbnail' && item.thumbnailFile;
      await streamFile(req, res, path.join(service.mediaDir, useThumb ? item.thumbnailFile : item.storedFile), {
        contentType: useThumb ? 'image/jpeg' : item.contentType,
        download: req.query.download === 'true',
        downloadName: item.name,
      });
    });
  }
}

export function registerVoceChatMediaRoutes(router, service) {
  const integer = (value) => (value === undefined || value === '' ? undefined : Number.isInteger(Number(value)) ? Number(value) : undefined);

  router.get('/vocechat-media', async (req, res) => {
    const kind = typeof req.query.kind === 'string' && /^(image|video|audio|pdf|doc|file)$/.test(req.query.kind) ? req.query.kind : undefined;
    res.json(await service.list(req.currentUser, { kind, gid: integer(req.query.gid), uid: integer(req.query.uid) }));
  });

  router.get('/vocechat-media/groups', async (req, res) => {
    const groups = await service.visibleGroups(req.currentUser);
    res.json(groups.map((g) => ({ gid: g.gid, name: g.name })));
  });

  router.get('/vocechat-media/status', async (_req, res) => {
    res.json(await service.status());
  });

  // Anyone still logged into VoceChat can top the copy up; admins can skip the 10-minute wait.
  router.post('/vocechat-media/sync', async (req, res) => {
    const token = req.get('X-VoceChat-Token')?.trim() ?? '';
    const force = req.body?.force === true && Boolean(req.currentUser?.isAdmin);
    res.json({ ...service.requestSync(token, { force }), ...(await service.status()) });
  });
}
