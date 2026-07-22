import * as FileSystem from 'expo-file-system/legacy';
import * as VideoThumbnails from 'expo-video-thumbnails';
import { config } from '@/config';
import { appApi } from '@/services/appApi';
import { useAuthStore } from '@/store/authStore';
import { ensureFreshVoceChatToken } from '@/services/session';
import type { Album, AlbumMedia, AlbumSummary } from '@/types';

/** Absolute, token-authed URL for streaming album media (usable in expo-image / Linking). */
export function albumMediaFileUrl(mediaId: string, options: { thumbnail?: boolean; download?: boolean } = {}): string {
  const token = useAuthStore.getState().token;
  const segment = options.thumbnail ? 'thumbnail' : 'file';
  const params = new URLSearchParams();
  if (token) params.set('token', token);
  if (options.download) params.set('download', 'true');
  const query = params.toString();
  return `${config.appApiHost}/app-api/albums/media/${mediaId}/${segment}${query ? `?${query}` : ''}`;
}

/** Absolute, token-authed URL that downloads an album as a zip. Pass `ids` to
 *  download only a selection. */
export function albumDownloadUrl(albumId: string, ids?: string[]): string {
  const token = useAuthStore.getState().token;
  const params = new URLSearchParams();
  if (token) params.set('token', token);
  if (ids && ids.length > 0) params.set('ids', ids.join(','));
  const query = params.toString();
  return `${config.appApiHost}/app-api/albums/${albumId}/download${query ? `?${query}` : ''}`;
}

export function deleteAlbumMedia(albumId: string, mediaId: string): Promise<void> {
  return appApi.delete<void>(`/albums/${albumId}/media/${mediaId}`);
}

export function loadAlbums(): Promise<AlbumSummary[]> {
  return appApi.get<AlbumSummary[]>('/albums');
}

export function loadAlbum(albumId: string): Promise<Album> {
  return appApi.get<Album>(`/albums/${albumId}`);
}

export function loadGalleryAlbumMedia(): Promise<AlbumMedia[]> {
  return appApi.get<AlbumMedia[]>('/gallery/album-media');
}

// ── Upload ───────────────────────────────────────────────────────────────────────

export interface UploadableAsset {
  uri: string;
  fileName: string;
  mimeType: string;
  type: 'image' | 'video';
}

export interface AlbumUploadProgress {
  done: number;
  total: number;
  /** 0..1 progress of the file currently uploading. */
  fraction: number;
}

/** Video → poster frame as a JPEG data-URL for the grid thumbnail. Images fall back
 *  to the original on the server, so we skip generating a thumbnail for them. */
async function buildAssetThumbnail(asset: UploadableAsset): Promise<string | null> {
  if (asset.type !== 'video') return null;
  try {
    const { uri } = await VideoThumbnails.getThumbnailAsync(asset.uri, { time: 500, quality: 0.6 });
    const base64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
    return `data:image/jpeg;base64,${base64}`;
  } catch {
    return null;
  }
}

/** Uploads a single file to an album. The original file streams straight to the
 *  server's chunked-upload temp endpoint (BINARY_CONTENT), then finish moves it. */
async function uploadAlbumMediaAsset(
  albumId: string,
  asset: UploadableAsset,
  thumbnailDataUrl: string | null,
  onProgress?: (fraction: number) => void,
): Promise<AlbumMedia> {
  const token = await ensureFreshVoceChatToken();
  const uploadId = (globalThis.crypto?.randomUUID?.() ?? `up_${Date.now()}_${Math.random().toString(36).slice(2)}`);
  const base = `${config.appApiHost}/app-api/albums/${albumId}/media/upload/${uploadId}`;

  try {
    const task = FileSystem.createUploadTask(
      `${base}/chunk`,
      asset.uri,
      {
        httpMethod: 'POST',
        uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
        headers: {
          ...(token ? { 'X-API-Key': token } : {}),
          'Content-Type': 'application/octet-stream',
        },
      },
      (data) => {
        if (data.totalBytesExpectedToSend > 0) {
          onProgress?.(data.totalBytesSent / data.totalBytesExpectedToSend);
        }
      },
    );

    const result = await task.uploadAsync();
    if (!result || result.status >= 300) {
      throw new Error(`Opplasting feilet (${result?.status ?? '?'})`);
    }

    const media = await appApi.post<AlbumMedia>(`/albums/${albumId}/media/upload/${uploadId}/finish`, {
      fileName: asset.fileName,
      mimeType: asset.mimeType,
      thumbnail: thumbnailDataUrl ?? undefined,
    });
    onProgress?.(1);
    return media;
  } catch (error) {
    void appApi.post(`/albums/${albumId}/media/upload/${uploadId}/abort`).catch(() => {});
    throw error;
  }
}

/** Uploads several picked assets sequentially, reporting overall progress. */
export async function uploadAssetsToAlbum(
  albumId: string,
  assets: UploadableAsset[],
  onProgress?: (progress: AlbumUploadProgress) => void,
): Promise<AlbumMedia[]> {
  const total = assets.length;
  const results: AlbumMedia[] = [];
  for (let i = 0; i < total; i += 1) {
    onProgress?.({ done: i, total, fraction: 0 });
    const thumbnail = await buildAssetThumbnail(assets[i]);
    const media = await uploadAlbumMediaAsset(albumId, assets[i], thumbnail, (fraction) =>
      onProgress?.({ done: i, total, fraction }),
    );
    results.push(media);
    onProgress?.({ done: i + 1, total, fraction: 0 });
  }
  return results;
}
