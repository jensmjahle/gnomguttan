import { appApi } from '@/services/appApi';
import { useAuthStore } from '@/store/authStore';
import { ensureFreshVoceChatToken } from '@/services/vocechatSession';
import { prepareImageForUpload } from '@/utils/imageResize';
import type { Album, AlbumMedia, AlbumSummary, CreateAlbumInput } from '@/types';

const APP_API_PREFIX = '/app-api';

interface MediaUrlOptions {
  download?: boolean;
  thumbnail?: boolean;
}

/** Builds a token-authed URL for streaming album media (usable in <img>/<video>/<a download>). */
export function albumMediaFileUrl(mediaId: string, options: MediaUrlOptions = {}): string {
  const token = useAuthStore.getState().token;
  const segment = options.thumbnail ? 'thumbnail' : 'file';
  const params = new URLSearchParams();
  if (token) params.set('token', token);
  if (options.download) params.set('download', 'true');
  const query = params.toString();
  return `${APP_API_PREFIX}/albums/media/${mediaId}/${segment}${query ? `?${query}` : ''}`;
}

export function albumDownloadUrl(albumId: string): string {
  const token = useAuthStore.getState().token;
  const query = token ? `?token=${encodeURIComponent(token)}` : '';
  return `${APP_API_PREFIX}/albums/${albumId}/download${query}`;
}

export async function loadAlbums(): Promise<AlbumSummary[]> {
  return appApi.get<AlbumSummary[]>('/albums');
}

export async function loadAlbum(albumId: string): Promise<Album> {
  return appApi.get<Album>(`/albums/${albumId}`);
}

export async function loadAlbumForEvent(eventId: string): Promise<AlbumSummary | null> {
  const albums = await appApi.get<AlbumSummary[]>(`/albums?eventId=${encodeURIComponent(eventId)}`);
  return albums[0] ?? null;
}

export async function createAlbum(input: CreateAlbumInput): Promise<Album> {
  return appApi.post<Album>('/albums', input);
}

export async function updateAlbum(
  albumId: string,
  update: { title?: string; description?: string; coverMediaId?: string | null },
): Promise<Album> {
  return appApi.put<Album>(`/albums/${albumId}`, update);
}

export async function deleteAlbum(albumId: string): Promise<void> {
  await appApi.delete(`/albums/${albumId}`);
}

export async function deleteAlbumMedia(albumId: string, mediaId: string): Promise<void> {
  await appApi.delete(`/albums/${albumId}/media/${mediaId}`);
}

export async function loadGalleryAlbumMedia(): Promise<AlbumMedia[]> {
  return appApi.get<AlbumMedia[]>('/gallery/album-media');
}

const VIDEO_EXT_RE = /\.(mp4|mov|webm|mkv|m4v|avi|3gp)$/i;
const HEIC_RE = /\.(heic|heif)$/i;

function isVideoFile(file: File): boolean {
  return file.type.startsWith('video/') || VIDEO_EXT_RE.test(file.name);
}

function isHeicFile(file: File): boolean {
  return file.type === 'image/heic' || file.type === 'image/heif' || HEIC_RE.test(file.name);
}

/**
 * Converts a HEIC/HEIF image to JPEG in the browser (full resolution, high
 * quality). HEIC can't be rendered by Chrome/Firefox, so we store a universally
 * viewable JPEG instead. Loaded lazily so the ~1.5 MB decoder only ships when needed.
 */
async function convertHeicToJpeg(file: File): Promise<File> {
  const { default: heic2any } = await import('heic2any');
  const out = await heic2any({ blob: file, toType: 'image/jpeg', quality: 0.92 });
  const blob = Array.isArray(out) ? out[0] : out;
  const name = `${file.name.replace(HEIC_RE, '')}.jpg`;
  return new File([blob], name, { type: 'image/jpeg' });
}

/**
 * Uploads media via streamed multipart, keeping the original file untouched
 * (full quality). A small client-generated thumbnail is sent alongside so the
 * grid stays fast without recompressing the original.
 */
// 8 MB chunks: small enough to stay under any reverse-proxy body limit
// (Cloudflare/nginx), big enough to keep overhead low.
const CHUNK_SIZE = 8 * 1024 * 1024;

/**
 * Uploads one file to an album in chunks (no size limit, original kept as-is).
 * `onProgress` receives a 0..1 fraction for this file.
 */
export async function uploadAlbumMedia(
  albumId: string,
  file: File,
  onProgress?: (fraction: number) => void,
): Promise<AlbumMedia> {
  // HEIC/HEIF can't display on the web → convert to JPEG up front. Everything
  // else keeps its original bytes.
  let uploadFile = file;
  if (!isVideoFile(file) && isHeicFile(file)) {
    try {
      uploadFile = await convertHeicToJpeg(file);
    } catch {
      // Fall back to the original HEIC (still downloadable, just not previewable).
    }
  }

  const video = isVideoFile(uploadFile);
  // Downscaled thumbnail only — the original file itself is sent untouched.
  const thumbnail = await (video ? captureVideoPoster(uploadFile) : prepareImageForUpload(uploadFile, 640, 0.72)).catch(() => null);

  const token = await ensureFreshVoceChatToken();
  const authHeaders: Record<string, string> = token ? { 'X-API-Key': token } : {};
  const uploadId = (globalThis.crypto?.randomUUID?.() ?? `up_${Date.now()}_${Math.random().toString(36).slice(2)}`);
  const base = `${APP_API_PREFIX}/albums/${albumId}/media/upload/${uploadId}`;
  const total = uploadFile.size;

  try {
    if (total === 0) {
      await sendChunk(`${base}/chunk`, authHeaders, new Blob([]));
    } else {
      let offset = 0;
      while (offset < total) {
        const end = Math.min(offset + CHUNK_SIZE, total);
        await sendChunk(`${base}/chunk`, authHeaders, uploadFile.slice(offset, end));
        offset = end;
        onProgress?.(offset / total);
      }
    }

    const res = await fetch(`${base}/finish`, {
      method: 'POST',
      headers: { ...authHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fileName: uploadFile.name,
        mimeType: uploadFile.type || (video ? 'video/mp4' : ''),
        thumbnail,
      }),
    });
    if (!res.ok) {
      throw new Error((await res.text().catch(() => '')) || `Kunne ikke fullføre opplasting (${res.status})`);
    }
    onProgress?.(1);
    return (await res.json()) as AlbumMedia;
  } catch (error) {
    // Best-effort cleanup of the partial temp file.
    void fetch(`${base}/abort`, { method: 'POST', headers: authHeaders }).catch(() => {});
    throw error;
  }
}

async function sendChunk(url: string, authHeaders: Record<string, string>, blob: Blob): Promise<void> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { ...authHeaders, 'Content-Type': 'application/octet-stream' },
    body: blob,
  });
  if (!res.ok) {
    throw new Error((await res.text().catch(() => '')) || `Opplasting feilet (${res.status})`);
  }
}

export interface AlbumUploadProgress {
  done: number;
  total: number;
  /** 0..1 progress of the file currently uploading. */
  currentFraction: number;
}

/** Uploads several files sequentially, reporting overall + current-file progress. */
export async function uploadAlbumMediaFiles(
  albumId: string,
  files: File[],
  onProgress?: (progress: AlbumUploadProgress) => void,
): Promise<AlbumMedia[]> {
  const total = files.length;
  const results: AlbumMedia[] = [];
  for (let i = 0; i < total; i += 1) {
    onProgress?.({ done: i, total, currentFraction: 0 });
    const media = await uploadAlbumMedia(albumId, files[i], (fraction) =>
      onProgress?.({ done: i, total, currentFraction: fraction }),
    );
    results.push(media);
    onProgress?.({ done: i + 1, total, currentFraction: 0 });
  }
  return results;
}

/** Captures a poster frame from a video file as a JPEG data-URL, for use as a thumbnail. */
function captureVideoPoster(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement('video');
    video.muted = true;
    video.preload = 'metadata';
    video.src = url;

    const cleanup = () => {
      URL.revokeObjectURL(url);
      video.removeAttribute('src');
    };

    video.onloadedmetadata = () => {
      // Seek slightly in so we don't grab a black first frame.
      video.currentTime = Math.min(0.5, (video.duration || 1) / 2);
    };
    video.onseeked = () => {
      try {
        const maxPx = 640;
        const scale = Math.min(1, maxPx / Math.max(video.videoWidth, video.videoHeight));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
        canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Canvas not supported'));
          return;
        }
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
        cleanup();
        resolve(dataUrl);
      } catch (error) {
        cleanup();
        reject(error instanceof Error ? error : new Error('Failed to capture poster'));
      }
    };
    video.onerror = () => {
      cleanup();
      reject(new Error('Failed to load video'));
    };
  });
}
