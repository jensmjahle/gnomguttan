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

/** Uploads a resized image (JSON data-URL path). */
export async function uploadAlbumImage(albumId: string, file: File): Promise<AlbumMedia> {
  const imageDataUrl = await prepareImageForUpload(file, 2048, 0.85);
  return appApi.post<AlbumMedia>(`/albums/${albumId}/media`, { imageDataUrl });
}

/** Uploads a video via streamed multipart (bypasses the JSON body limit). */
export async function uploadAlbumVideo(albumId: string, file: File): Promise<AlbumMedia> {
  const token = await ensureFreshVoceChatToken();
  const thumbnail = await captureVideoPoster(file).catch(() => null);
  const form = new FormData();
  form.append('mimeType', file.type || 'video/mp4');
  if (thumbnail) form.append('thumbnail', thumbnail);
  form.append('file', file, file.name);

  const res = await fetch(`${APP_API_PREFIX}/albums/${albumId}/media`, {
    method: 'POST',
    headers: token ? { 'X-API-Key': token } : {},
    body: form,
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(body || `Kunne ikke laste opp video (${res.status})`);
  }
  return (await res.json()) as AlbumMedia;
}

export async function uploadAlbumMedia(albumId: string, file: File): Promise<AlbumMedia> {
  if (file.type.startsWith('video/')) {
    return uploadAlbumVideo(albumId, file);
  }
  return uploadAlbumImage(albumId, file);
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
