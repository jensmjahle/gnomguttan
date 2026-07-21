import { randomUUID } from 'node:crypto';
import { ObjectId } from 'mongodb';
import Busboy from 'busboy';
import archiver from 'archiver';
import {
  COLLECTIONS,
  ALBUM_MEDIA_BUCKET,
  getDatabase,
  getAlbumMediaBucket,
} from './mongo.js';

const MAX_VIDEO_BYTES = 2 * 1024 * 1024 * 1024; // 2 GB per video
const MAX_IMAGE_BYTES = 15 * 1024 * 1024; // resized client-side, generous cap
const GALLERY_MEDIA_LIMIT = 500;
const IMAGE_DATA_URL_RE = /^data:(image\/(?:jpeg|png|gif|webp));base64,(.+)$/;

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
    const download = req.query.download === 'true';
    await streamGridFsFile({
      req,
      res,
      fileId: media.fileId,
      fallbackType: media.mimeType,
      download,
      downloadName: `${media.id}.${extFromMime(media.mimeType)}`,
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
    const fileId = media.thumbnailId ?? media.fileId;
    await streamGridFsFile({ req, res, fileId, fallbackType: 'image/jpeg' });
  });

  router.get('/albums/:id/download', async (req, res) => {
    if (!(await authFromQuery(req, res))) return;
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

    const bucket = await getAlbumMediaBucket();
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
      const name = `${String(index + 1).padStart(3, '0')}_${item.id}.${extFromMime(item.mimeType)}`;
      archive.append(bucket.openDownloadStream(item.fileId), { name });
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
    const bucket = await getAlbumMediaBucket();
    await Promise.all(
      media.flatMap((item) => [
        bucket.delete(item.fileId).catch(() => {}),
        item.thumbnailId ? bucket.delete(item.thumbnailId).catch(() => {}) : Promise.resolve(),
      ])
    );
    await db.collection(COLLECTIONS.albumMedia).deleteMany({ albumId: album.id });
    await db.collection(COLLECTIONS.albums).deleteOne({ id: album.id });
    res.status(204).end();
  });

  router.post('/albums/:id/media', async (req, res) => {
    const db = await getDatabase();
    const album = await db.collection(COLLECTIONS.albums).findOne({ id: req.params.id });
    if (!album) {
      res.status(404).json({ error: 'Album not found.' });
      return;
    }

    const contentType = req.headers['content-type'] ?? '';
    if (contentType.startsWith('multipart/form-data')) {
      await handleVideoUpload({ req, res, db, album, currentUser: req.currentUser });
      return;
    }
    await handleImageUpload({ req, res, db, album, currentUser: req.currentUser });
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
    const bucket = await getAlbumMediaBucket();
    await bucket.delete(media.fileId).catch(() => {});
    if (media.thumbnailId) await bucket.delete(media.thumbnailId).catch(() => {});
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

// ── Upload handlers ─────────────────────────────────────────────────────────────

async function handleImageUpload({ req, res, db, album, currentUser }) {
  const imageDataUrl = typeof req.body?.imageDataUrl === 'string' ? req.body.imageDataUrl : '';
  const match = IMAGE_DATA_URL_RE.exec(imageDataUrl);
  if (!match) {
    res.status(400).json({ error: 'Invalid image format.' });
    return;
  }
  const [, mimeType, base64Data] = match;
  const buffer = Buffer.from(base64Data, 'base64');
  if (buffer.length > MAX_IMAGE_BYTES) {
    res.status(413).json({ error: 'Image too large.' });
    return;
  }
  const bucket = await getAlbumMediaBucket();
  const fileId = await storeBufferInGridFs(bucket, buffer, mimeType, album.id);
  const media = buildMediaDoc({ album, type: 'image', fileId, thumbnailId: null, mimeType, size: buffer.length, uploadedBy: currentUser });
  await db.collection(COLLECTIONS.albumMedia).insertOne(media);
  await maybeSetFirstAsCover(db, album, media);
  await resolvePhotoObligationForUpload(db, album, currentUser);
  res.status(201).json(sanitizeMedia(media));
}

async function handleVideoUpload({ req, res, db, album, currentUser }) {
  const bucket = await getAlbumMediaBucket();
  const bb = Busboy({ headers: req.headers, limits: { fileSize: MAX_VIDEO_BYTES, files: 1 } });

  let thumbnailDataUrl = '';
  let mimeType = '';
  let fileId = null;
  let sizeBytes = 0;
  let tooLarge = false;
  let uploadPromise = Promise.resolve();

  bb.on('field', (name, value) => {
    if (name === 'thumbnail') thumbnailDataUrl = value;
    if (name === 'mimeType' && !mimeType) mimeType = value;
  });

  bb.on('file', (_name, file, info) => {
    mimeType = mimeType || info?.mimeType || 'video/mp4';
    const gfsId = new ObjectId();
    fileId = gfsId;
    const upload = bucket.openUploadStreamWithId(gfsId, `${album.id}/${gfsId}`, { contentType: mimeType });
    file.on('data', (chunk) => { sizeBytes += chunk.length; });
    file.on('limit', () => {
      tooLarge = true;
      upload.abort().catch(() => {});
    });
    uploadPromise = new Promise((resolve, reject) => {
      upload.on('finish', resolve);
      upload.on('error', reject);
      file.on('error', reject);
    });
    file.pipe(upload);
  });

  bb.on('close', async () => {
    try {
      if (tooLarge) {
        res.status(413).json({ error: 'Video too large (max 2 GB).' });
        return;
      }
      if (!fileId) {
        res.status(400).json({ error: 'No file uploaded.' });
        return;
      }
      await uploadPromise;
      let thumbnailId = null;
      if (thumbnailDataUrl) {
        const thumbMatch = IMAGE_DATA_URL_RE.exec(thumbnailDataUrl);
        if (thumbMatch) {
          const thumbBuffer = Buffer.from(thumbMatch[2], 'base64');
          if (thumbBuffer.length <= MAX_IMAGE_BYTES) {
            thumbnailId = await storeBufferInGridFs(bucket, thumbBuffer, thumbMatch[1], album.id);
          }
        }
      }
      const media = buildMediaDoc({ album, type: 'video', fileId, thumbnailId, mimeType, size: sizeBytes, uploadedBy: currentUser });
      await db.collection(COLLECTIONS.albumMedia).insertOne(media);
      await maybeSetFirstAsCover(db, album, media);
      await resolvePhotoObligationForUpload(db, album, currentUser);
      res.status(201).json(sanitizeMedia(media));
    } catch (error) {
      console.error('[Albums] Video upload failed', error);
      if (fileId) await bucket.delete(fileId).catch(() => {});
      if (!res.headersSent) res.status(500).json({ error: 'Upload failed.' });
    }
  });

  bb.on('error', (error) => {
    console.error('[Albums] Busboy error', error);
    if (!res.headersSent) res.status(400).json({ error: 'Upload failed.' });
  });

  req.pipe(bb);
}

// ── GridFS helpers ───────────────────────────────────────────────────────────────

function storeBufferInGridFs(bucket, buffer, mimeType, albumId) {
  return new Promise((resolve, reject) => {
    const id = new ObjectId();
    const upload = bucket.openUploadStreamWithId(id, `${albumId}/${id}`, { contentType: mimeType });
    upload.on('finish', () => resolve(id));
    upload.on('error', reject);
    upload.end(buffer);
  });
}

async function streamGridFsFile({ req, res, fileId, fallbackType, download = false, downloadName }) {
  const db = await getDatabase();
  const fileDoc = await db.collection(`${ALBUM_MEDIA_BUCKET}.files`).findOne({ _id: fileId });
  if (!fileDoc) {
    res.status(404).json({ error: 'File not found.' });
    return;
  }
  const bucket = await getAlbumMediaBucket();
  const total = fileDoc.length;
  const contentType = fileDoc.contentType || fallbackType || 'application/octet-stream';

  res.setHeader('Content-Type', contentType);
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
    bucket.openDownloadStream(fileId, { start, end: end + 1 }).on('error', () => res.destroy()).pipe(res);
    return;
  }

  res.setHeader('Content-Length', total);
  bucket.openDownloadStream(fileId).on('error', () => res.destroy()).pipe(res);
}

// ── Domain helpers ───────────────────────────────────────────────────────────────

function buildMediaDoc({ album, type, fileId, thumbnailId, mimeType, size, uploadedBy }) {
  return {
    id: randomUUID(),
    albumId: album.id,
    type,
    fileId,
    thumbnailId: thumbnailId ?? null,
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
    hasThumbnail: Boolean(doc.thumbnailId) || doc.type === 'image',
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

function extFromMime(mimeType) {
  const map = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/gif': 'gif',
    'image/webp': 'webp',
    'video/mp4': 'mp4',
    'video/quicktime': 'mov',
    'video/webm': 'webm',
    'video/x-matroska': 'mkv',
  };
  return map[mimeType] ?? 'bin';
}

function sanitizeFilename(name) {
  return String(name).replace(/[^a-zA-Z0-9._ -]/g, '_').slice(0, 120) || 'album';
}
