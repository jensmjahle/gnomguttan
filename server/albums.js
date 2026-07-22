import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import archiver from 'archiver';
import { COLLECTIONS, getDatabase } from './mongo.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

// Where original media + thumbnails live on disk. In Docker this is a mounted
// volume (see ALBUM_MEDIA_DIR in docker-compose.yml); locally it defaults to
// ./data/album-media in the project root.
const MEDIA_DIR = path.resolve(process.env.ALBUM_MEDIA_DIR?.trim() || path.join(rootDir, 'data', 'album-media'));

// Originals are stored as-is at full quality with no size limit. Large files are
// uploaded in chunks (see the chunk/finish routes) so no single request is huge.
const MAX_THUMB_BYTES = 8 * 1024 * 1024;
const GALLERY_MEDIA_LIMIT = 500;
const IMAGE_DATA_URL_RE = /^data:(image\/(?:jpeg|png|webp));base64,(.+)$/;
const UPLOAD_ID_RE = /^[A-Za-z0-9_-]{8,64}$/;

const EXT_MIME = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif',
  webp: 'image/webp', heic: 'image/heic', heif: 'image/heif',
  mp4: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm',
  mkv: 'video/x-matroska', m4v: 'video/x-m4v', avi: 'video/x-msvideo', '3gp': 'video/3gpp',
};
const MIME_EXT = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/gif': 'gif', 'image/webp': 'webp',
  'image/heic': 'heic', 'image/heif': 'heif',
  'video/mp4': 'mp4', 'video/quicktime': 'mov', 'video/webm': 'webm',
  'video/x-matroska': 'mkv', 'video/x-m4v': 'm4v', 'video/x-msvideo': 'avi', 'video/3gpp': '3gp',
};

// ── Public (query-token) media streaming routes ────────────────────────────────
// Registered BEFORE authMiddleware because <img>/<video>/<a download> can't send
// custom headers — the VoceChat token is passed as ?token= (same pattern as the
// statusrapport image route). `resolveUser` is server/index.js's resolveCurrentUser.
export function registerAlbumMediaRoutes(router, { resolveUser }) {
  async function authFromQuery(req, res) {
    const token = typeof req.query.token === 'string' ? req.query.token.trim() : '';
    if (!token) {
      res.status(401).json({ error: 'Missing token.' });
      return null;
    }
    try {
      return await resolveUser(token);
    } catch (error) {
      if (error?.name === 'UnauthorizedError') {
        res.status(401).json({ error: 'Invalid token.' });
        return null;
      }
      res.status(503).json({ error: 'Auth unavailable.' });
      return null;
    }
  }

  router.get('/albums/media/:mediaId/file', async (req, res) => {
    if (!(await authFromQuery(req, res))) return;
    const db = await getDatabase();
    const media = await db.collection(COLLECTIONS.albumMedia).findOne({ id: req.params.mediaId });
    if (!media) {
      res.status(404).json({ error: 'Media not found.' });
      return;
    }
    await streamDiskFile({
      req,
      res,
      relPath: media.filePath,
      contentType: media.mimeType,
      download: req.query.download === 'true',
      downloadName: `${media.id}.${extFromMime(media.mimeType) || 'bin'}`,
    });
  });

  router.get('/albums/media/:mediaId/thumbnail', async (req, res) => {
    if (!(await authFromQuery(req, res))) return;
    const db = await getDatabase();
    const media = await db.collection(COLLECTIONS.albumMedia).findOne({ id: req.params.mediaId });
    if (!media) {
      res.status(404).json({ error: 'Media not found.' });
      return;
    }
    const relPath = media.thumbnailPath ?? media.filePath;
    const contentType = media.thumbnailPath ? 'image/jpeg' : media.mimeType;
    await streamDiskFile({ req, res, relPath, contentType });
  });

  router.get('/albums/:id/download', async (req, res) => {
    if (!(await authFromQuery(req, res))) return;
    const db = await getDatabase();
    const album = await db.collection(COLLECTIONS.albums).findOne({ id: req.params.id });
    if (!album) {
      res.status(404).json({ error: 'Album not found.' });
      return;
    }
    let media = await db
      .collection(COLLECTIONS.albumMedia)
      .find({ albumId: album.id })
      .sort({ createdAt: 1 })
      .toArray();

    // Optional ?ids=a,b,c to download only a selection.
    const idsParam = typeof req.query.ids === 'string' ? req.query.ids.trim() : '';
    if (idsParam) {
      const idSet = new Set(idsParam.split(',').map((s) => s.trim()).filter(Boolean));
      media = media.filter((item) => idSet.has(item.id));
    }

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${sanitizeFilename(album.title || 'album')}.zip"`);

    // Media is already compressed (JPEG/PNG/MP4); store without recompressing.
    const archive = archiver('zip', { zlib: { level: 0 } });
    archive.on('error', (error) => {
      console.error('[Albums] Zip stream failed', error);
      res.destroy(error);
    });
    archive.pipe(res);

    media.forEach((item, index) => {
      const abs = safeMediaAbsPath(item.filePath);
      if (!abs || !fs.existsSync(abs)) return;
      const name = `${String(index + 1).padStart(3, '0')}_${item.id}.${extFromMime(item.mimeType) || 'bin'}`;
      archive.append(fs.createReadStream(abs), { name });
    });

    await archive.finalize();
  });
}

// ── Authed CRUD + upload routes ────────────────────────────────────────────────
export function registerAlbumRoutes(router) {
  router.get('/albums', async (req, res) => {
    const db = await getDatabase();
    const eventId = typeof req.query.eventId === 'string' ? req.query.eventId.trim() : '';
    const match = eventId ? { eventId } : {};
    const docs = await db
      .collection(COLLECTIONS.albums)
      .aggregate([
        { $match: match },
        { $sort: { createdAt: -1 } },
        {
          $lookup: {
            from: COLLECTIONS.albumMedia,
            localField: 'id',
            foreignField: 'albumId',
            as: 'media',
          },
        },
      ])
      .toArray();
    res.json(docs.map(sanitizeAlbumSummary));
  });

  router.post('/albums', async (req, res) => {
    const db = await getDatabase();
    const payload = req.body ?? {};
    const title = typeof payload.title === 'string' ? payload.title.trim() : '';
    if (!title) {
      res.status(400).json({ error: 'Title is required.' });
      return;
    }
    const eventId = typeof payload.eventId === 'string' && payload.eventId.trim() ? payload.eventId.trim() : undefined;

    // Idempotent for event-linked albums (supports lazy creation from the event page).
    if (eventId) {
      const existing = await db.collection(COLLECTIONS.albums).findOne({ eventId });
      if (existing) {
        res.status(200).json(sanitizeAlbum(existing, []));
        return;
      }
    }

    const now = Date.now();
    const album = {
      id: randomUUID(),
      title,
      description: typeof payload.description === 'string' && payload.description.trim() ? payload.description.trim() : undefined,
      createdAt: now,
      updatedAt: now,
      createdBy: { uid: req.currentUser.uid, name: req.currentUser.name },
      coverMediaId: undefined,
      eventId,
    };
    await db.collection(COLLECTIONS.albums).insertOne(album);
    res.status(201).json(sanitizeAlbum(album, []));
  });

  router.get('/albums/:id', async (req, res) => {
    const db = await getDatabase();
    const album = await db.collection(COLLECTIONS.albums).findOne({ id: req.params.id });
    if (!album) {
      res.status(404).json({ error: 'Album not found.' });
      return;
    }
    const media = await db
      .collection(COLLECTIONS.albumMedia)
      .find({ albumId: album.id })
      .sort({ createdAt: 1 })
      .toArray();
    res.json(sanitizeAlbum(album, media));
  });

  router.put('/albums/:id', async (req, res) => {
    const db = await getDatabase();
    const album = await db.collection(COLLECTIONS.albums).findOne({ id: req.params.id });
    if (!album) {
      res.status(404).json({ error: 'Album not found.' });
      return;
    }
    if (!canManageAlbum(album, req.currentUser)) {
      res.status(403).json({ error: 'Forbidden.' });
      return;
    }
    const payload = req.body ?? {};
    const update = { updatedAt: Date.now() };
    if (payload.title !== undefined) {
      const title = typeof payload.title === 'string' ? payload.title.trim() : '';
      if (!title) {
        res.status(400).json({ error: 'Title is required.' });
        return;
      }
      update.title = title;
    }
    if (payload.description !== undefined) {
      update.description = typeof payload.description === 'string' && payload.description.trim() ? payload.description.trim() : undefined;
    }
    if (payload.coverMediaId !== undefined) {
      const coverMediaId = typeof payload.coverMediaId === 'string' && payload.coverMediaId.trim() ? payload.coverMediaId.trim() : undefined;
      if (coverMediaId) {
        const exists = await db.collection(COLLECTIONS.albumMedia).findOne({ id: coverMediaId, albumId: album.id });
        if (!exists) {
          res.status(400).json({ error: 'Cover media not found in album.' });
          return;
        }
      }
      update.coverMediaId = coverMediaId;
    }
    await db.collection(COLLECTIONS.albums).updateOne({ id: album.id }, { $set: update });
    const media = await db.collection(COLLECTIONS.albumMedia).find({ albumId: album.id }).sort({ createdAt: 1 }).toArray();
    res.json(sanitizeAlbum({ ...album, ...update }, media));
  });

  router.delete('/albums/:id', async (req, res) => {
    const db = await getDatabase();
    const album = await db.collection(COLLECTIONS.albums).findOne({ id: req.params.id });
    if (!album) {
      res.status(404).json({ error: 'Album not found.' });
      return;
    }
    if (!canManageAlbum(album, req.currentUser)) {
      res.status(403).json({ error: 'Forbidden.' });
      return;
    }
    const media = await db.collection(COLLECTIONS.albumMedia).find({ albumId: album.id }).toArray();
    await Promise.all(media.flatMap((item) => [deleteMediaFile(item.filePath), deleteMediaFile(item.thumbnailPath)]));
    // Remove the album's directory (best effort — ignore if not empty / missing).
    const albumDir = safeMediaAbsPath(album.id);
    if (albumDir) await fsp.rm(albumDir, { recursive: true, force: true }).catch(() => {});
    await db.collection(COLLECTIONS.albumMedia).deleteMany({ albumId: album.id });
    await db.collection(COLLECTIONS.albums).deleteOne({ id: album.id });
    res.status(204).end();
  });

  // ── Chunked upload (no size limit; each request is only one chunk) ────────────
  // 1) POST .../upload/:uploadId/chunk  — raw body appended to a temp file (call
  //    sequentially per file). 2) .../finish — moves temp into place + thumbnail.
  //    3) .../abort — discards the temp file.
  router.post('/albums/:id/media/upload/:uploadId/chunk', async (req, res) => {
    const db = await getDatabase();
    const album = await db.collection(COLLECTIONS.albums).findOne({ id: req.params.id });
    if (!album) {
      res.status(404).json({ error: 'Album not found.' });
      return;
    }
    const tmpPath = tempUploadPath(album.id, req.params.uploadId);
    if (!tmpPath) {
      res.status(400).json({ error: 'Invalid upload id.' });
      return;
    }
    try {
      await fsp.mkdir(path.dirname(tmpPath), { recursive: true });
      await appendRequestToFile(req, tmpPath);
      const stat = await fsp.stat(tmpPath);
      res.json({ received: stat.size });
    } catch (error) {
      console.error('[Albums] Chunk write failed', error);
      if (!res.headersSent) res.status(500).json({ error: 'Chunk upload failed.' });
    }
  });

  router.post('/albums/:id/media/upload/:uploadId/finish', async (req, res) => {
    const db = await getDatabase();
    const album = await db.collection(COLLECTIONS.albums).findOne({ id: req.params.id });
    if (!album) {
      res.status(404).json({ error: 'Album not found.' });
      return;
    }
    const tmpPath = tempUploadPath(album.id, req.params.uploadId);
    if (!tmpPath || !fs.existsSync(tmpPath)) {
      res.status(400).json({ error: 'Upload not found.' });
      return;
    }

    const payload = req.body ?? {};
    const fileName = typeof payload.fileName === 'string' ? payload.fileName : '';
    const effectiveMime = normalizeMime(payload.mimeType) || mimeFromFilename(fileName) || 'application/octet-stream';
    const ext = extFromMime(effectiveMime) || extFromFilename(fileName) || 'bin';
    const type = effectiveMime.startsWith('video/') ? 'video' : 'image';
    const mediaId = randomUUID();

    try {
      const relOriginalPath = `${album.id}/originals/${mediaId}.${ext}`;
      const absOriginalPath = safeMediaAbsPath(relOriginalPath);
      await fsp.mkdir(path.dirname(absOriginalPath), { recursive: true });
      await fsp.rename(tmpPath, absOriginalPath);
      const size = (await fsp.stat(absOriginalPath)).size;

      let relThumbPath = null;
      const thumbMatch = typeof payload.thumbnail === 'string' ? IMAGE_DATA_URL_RE.exec(payload.thumbnail) : null;
      if (thumbMatch) {
        const thumbBuffer = Buffer.from(thumbMatch[2], 'base64');
        if (thumbBuffer.length <= MAX_THUMB_BYTES) {
          relThumbPath = `${album.id}/thumbnails/${mediaId}.${extFromMime(thumbMatch[1]) || 'jpg'}`;
          await fsp.mkdir(path.dirname(safeMediaAbsPath(relThumbPath)), { recursive: true });
          await fsp.writeFile(safeMediaAbsPath(relThumbPath), thumbBuffer);
        }
      }

      const media = buildMediaDoc({
        album,
        id: mediaId,
        type,
        filePath: relOriginalPath,
        thumbnailPath: relThumbPath,
        mimeType: effectiveMime,
        size,
        uploadedBy: req.currentUser,
      });
      await db.collection(COLLECTIONS.albumMedia).insertOne(media);
      await maybeSetFirstAsCover(db, album, media);
      await resolvePhotoObligationForUpload(db, album, req.currentUser);
      res.status(201).json(sanitizeMedia(media));
    } catch (error) {
      console.error('[Albums] Finish upload failed', error);
      await fsp.rm(tmpPath, { force: true }).catch(() => {});
      if (!res.headersSent) res.status(500).json({ error: 'Upload failed.' });
    }
  });

  router.post('/albums/:id/media/upload/:uploadId/abort', async (req, res) => {
    const tmpPath = tempUploadPath(req.params.id, req.params.uploadId);
    if (tmpPath) await fsp.rm(tmpPath, { force: true }).catch(() => {});
    res.status(204).end();
  });

  router.delete('/albums/:id/media/:mediaId', async (req, res) => {
    const db = await getDatabase();
    const album = await db.collection(COLLECTIONS.albums).findOne({ id: req.params.id });
    const media = album
      ? await db.collection(COLLECTIONS.albumMedia).findOne({ id: req.params.mediaId, albumId: album.id })
      : null;
    if (!album || !media) {
      res.status(404).json({ error: 'Media not found.' });
      return;
    }
    const isUploader = media.uploadedBy?.uid === req.currentUser.uid;
    if (!isUploader && !canManageAlbum(album, req.currentUser)) {
      res.status(403).json({ error: 'Forbidden.' });
      return;
    }
    await Promise.all([deleteMediaFile(media.filePath), deleteMediaFile(media.thumbnailPath)]);
    await db.collection(COLLECTIONS.albumMedia).deleteOne({ id: media.id });
    if (album.coverMediaId === media.id) {
      await db.collection(COLLECTIONS.albums).updateOne({ id: album.id }, { $set: { coverMediaId: undefined, updatedAt: Date.now() } });
    }
    res.status(204).end();
  });

  // Recent album media across all albums — merged into the combined gallery stream.
  router.get('/gallery/album-media', async (_req, res) => {
    const db = await getDatabase();
    const media = await db
      .collection(COLLECTIONS.albumMedia)
      .find({})
      .sort({ createdAt: -1 })
      .limit(GALLERY_MEDIA_LIMIT)
      .toArray();
    res.json(media.map(sanitizeMedia));
  });
}

// ── Disk helpers ─────────────────────────────────────────────────────────────────

/** Temp path for an in-progress chunked upload (under the album's .tmp folder). */
function tempUploadPath(albumId, uploadId) {
  if (typeof uploadId !== 'string' || !UPLOAD_ID_RE.test(uploadId)) return null;
  return safeMediaAbsPath(`${albumId}/.tmp/${uploadId}`);
}

/** Appends a request body stream to the end of a file (one chunk). */
function appendRequestToFile(req, filePath) {
  return new Promise((resolve, reject) => {
    const ws = fs.createWriteStream(filePath, { flags: 'a' });
    req.on('error', reject);
    ws.on('error', reject);
    ws.on('finish', resolve);
    req.pipe(ws);
  });
}

// ── Orphaned temp-upload cleanup ─────────────────────────────────────────────────
// A chunked upload that is never finished/aborted (e.g. the browser is closed
// mid-upload) leaves a partial file in the album's .tmp folder. Sweep those out.
const TEMP_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours
const TEMP_SWEEP_INTERVAL_MS = 60 * 60 * 1000; // hourly

export function startAlbumTempCleanup() {
  const sweep = async () => {
    try {
      await sweepOrphanTempFiles();
    } catch (error) {
      console.error('[Albums] Temp cleanup failed', error);
    }
  };
  void sweep();
  const intervalId = setInterval(() => void sweep(), TEMP_SWEEP_INTERVAL_MS);
  console.log('[Albums] Temp-upload cleanup started.');
  return () => {
    clearInterval(intervalId);
    console.log('[Albums] Temp-upload cleanup stopped.');
  };
}

async function sweepOrphanTempFiles() {
  const now = Date.now();
  let albumDirs;
  try {
    albumDirs = await fsp.readdir(MEDIA_DIR, { withFileTypes: true });
  } catch {
    return; // MEDIA_DIR may not exist yet — nothing to sweep.
  }

  for (const dirent of albumDirs) {
    if (!dirent.isDirectory()) continue;
    const tmpDir = path.join(MEDIA_DIR, dirent.name, '.tmp');
    let entries;
    try {
      entries = await fsp.readdir(tmpDir);
    } catch {
      continue; // No .tmp folder for this album.
    }
    for (const name of entries) {
      const file = path.join(tmpDir, name);
      try {
        const stat = await fsp.stat(file);
        if (now - stat.mtimeMs > TEMP_TTL_MS) {
          await fsp.rm(file, { force: true });
          console.log(`[Albums] Removed orphan temp upload ${dirent.name}/.tmp/${name}`);
        }
      } catch {
        // Ignore files that vanished or can't be stat'd.
      }
    }
  }
}

/** Resolves a relative media path under MEDIA_DIR, guarding against traversal. */
function safeMediaAbsPath(relPath) {
  if (typeof relPath !== 'string' || !relPath) return null;
  const abs = path.resolve(MEDIA_DIR, relPath);
  if (abs !== MEDIA_DIR && !abs.startsWith(MEDIA_DIR + path.sep)) return null;
  return abs;
}

async function deleteMediaFile(relPath) {
  const abs = safeMediaAbsPath(relPath);
  if (!abs) return;
  await fsp.rm(abs, { force: true }).catch(() => {});
}

async function streamDiskFile({ req, res, relPath, contentType, download = false, downloadName }) {
  const abs = safeMediaAbsPath(relPath);
  let stat;
  try {
    stat = abs ? await fsp.stat(abs) : null;
  } catch {
    stat = null;
  }
  if (!stat) {
    res.status(404).json({ error: 'File not found.' });
    return;
  }

  const total = stat.size;
  res.setHeader('Content-Type', contentType || 'application/octet-stream');
  res.setHeader('Accept-Ranges', 'bytes');
  res.setHeader('Cache-Control', 'private, max-age=3600');
  if (download && downloadName) {
    res.setHeader('Content-Disposition', `attachment; filename="${sanitizeFilename(downloadName)}"`);
  }

  const range = req.headers.range;
  if (range) {
    const match = /bytes=(\d*)-(\d*)/.exec(range);
    const start = match && match[1] ? parseInt(match[1], 10) : 0;
    const end = match && match[2] ? parseInt(match[2], 10) : total - 1;
    if (Number.isNaN(start) || Number.isNaN(end) || start > end || end >= total || start < 0) {
      res.status(416).setHeader('Content-Range', `bytes */${total}`);
      res.end();
      return;
    }
    res.status(206);
    res.setHeader('Content-Range', `bytes ${start}-${end}/${total}`);
    res.setHeader('Content-Length', end - start + 1);
    fs.createReadStream(abs, { start, end }).on('error', () => res.destroy()).pipe(res);
    return;
  }

  res.setHeader('Content-Length', total);
  fs.createReadStream(abs).on('error', () => res.destroy()).pipe(res);
}

// ── Domain helpers ───────────────────────────────────────────────────────────────

function buildMediaDoc({ album, id, type, filePath, thumbnailPath, mimeType, size, uploadedBy }) {
  return {
    id,
    albumId: album.id,
    type,
    filePath,
    thumbnailPath: thumbnailPath ?? null,
    mimeType,
    size: size ?? 0,
    createdAt: Date.now(),
    uploadedBy: { uid: uploadedBy.uid, name: uploadedBy.name },
  };
}

async function maybeSetFirstAsCover(db, album, media) {
  if (album.coverMediaId) return;
  const count = await db.collection(COLLECTIONS.albumMedia).countDocuments({ albumId: album.id });
  if (count === 1) {
    await db.collection(COLLECTIONS.albums).updateOne({ id: album.id }, { $set: { coverMediaId: media.id, updatedAt: Date.now() } });
  }
}

async function resolvePhotoObligationForUpload(db, album, currentUser) {
  if (!album.eventId) return;
  await db.collection(COLLECTIONS.photoObligations).updateMany(
    { eventId: album.eventId, uid: currentUser.uid, status: { $in: ['pending', 'snoozed'] } },
    { $set: { status: 'done', resolvedAt: Date.now() } }
  );
}

function canManageAlbum(album, user) {
  if (!user) return false;
  if (user.isAdmin) return true;
  return album.createdBy?.uid === user.uid;
}

function sanitizeMedia(doc) {
  return {
    id: doc.id,
    albumId: doc.albumId,
    type: doc.type,
    mimeType: doc.mimeType,
    size: doc.size ?? 0,
    createdAt: doc.createdAt,
    uploadedBy: doc.uploadedBy,
    hasThumbnail: Boolean(doc.thumbnailPath) || doc.type === 'image',
  };
}

function sanitizeAlbum(doc, media) {
  const sortedMedia = Array.isArray(media) ? [...media].sort((a, b) => a.createdAt - b.createdAt) : [];
  return {
    id: doc.id,
    title: doc.title,
    description: doc.description ?? undefined,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt ?? doc.createdAt,
    createdBy: doc.createdBy,
    eventId: doc.eventId ?? undefined,
    coverMediaId: doc.coverMediaId ?? undefined,
    mediaCount: sortedMedia.length,
    coverMediaIds: resolveCoverMediaIds(doc, sortedMedia),
    media: sortedMedia.map(sanitizeMedia),
  };
}

function sanitizeAlbumSummary(doc) {
  const media = Array.isArray(doc.media) ? [...doc.media].sort((a, b) => a.createdAt - b.createdAt) : [];
  return {
    id: doc.id,
    title: doc.title,
    description: doc.description ?? undefined,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt ?? doc.createdAt,
    createdBy: doc.createdBy,
    eventId: doc.eventId ?? undefined,
    coverMediaId: doc.coverMediaId ?? undefined,
    mediaCount: media.length,
    coverMediaIds: resolveCoverMediaIds(doc, media),
  };
}

function resolveCoverMediaIds(doc, media) {
  if (doc.coverMediaId) return [doc.coverMediaId];
  return media.slice(0, 4).map((item) => item.id);
}

function normalizeMime(value) {
  const mime = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (!mime || mime === 'application/octet-stream') return '';
  return mime;
}

function extFromMime(mimeType) {
  return MIME_EXT[mimeType] ?? '';
}

function extFromFilename(name) {
  const match = /\.([a-zA-Z0-9]+)$/.exec(name || '');
  return match ? match[1].toLowerCase() : '';
}

function mimeFromFilename(name) {
  return EXT_MIME[extFromFilename(name)] ?? '';
}

function sanitizeFilename(name) {
  return String(name).replace(/[^a-zA-Z0-9._ -]/g, '_').slice(0, 120) || 'album';
}
