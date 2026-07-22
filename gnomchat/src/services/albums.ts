import { config } from '@/config';
import { appApi } from '@/services/appApi';
import { useAuthStore } from '@/store/authStore';
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

export function loadAlbums(): Promise<AlbumSummary[]> {
  return appApi.get<AlbumSummary[]>('/albums');
}

export function loadAlbum(albumId: string): Promise<Album> {
  return appApi.get<Album>(`/albums/${albumId}`);
}

export function loadGalleryAlbumMedia(): Promise<AlbumMedia[]> {
  return appApi.get<AlbumMedia[]>('/gallery/album-media');
}
