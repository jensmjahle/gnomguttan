import { appApi } from '@/services/appApi';
import { ensureFreshVoceChatToken } from '@/services/vocechatSession';
import { useAuthStore } from '@/store/authStore';

// Our own copy of the media posted in VoceChat channels (see server/vocechatMedia.js).

export type ArchivedMediaKind = 'image' | 'video' | 'audio' | 'pdf' | 'doc' | 'file';

export interface ArchivedMedia {
  id: string;
  mid: number;
  fromUid: number;
  gid: number;
  groupName: string | null;
  kind: ArchivedMediaKind;
  contentType: string;
  ext: string;
  name: string;
  size: number | null;
  createdAt: number;
  /** Copied to our server; until then the file is served from VoceChat. */
  stored: boolean;
  hasThumbnail: boolean;
}

export interface MediaCopyStatus {
  total: number;
  stored: number;
  pending: number;
  missing: number;
  storedBytes: number;
  syncing: boolean;
  downloading: boolean;
  lastSyncAt: number | null;
  lastSyncError: string | null;
  active: boolean;
}

export function listArchivedMedia(filters: { kind?: ArchivedMediaKind; gid?: number; uid?: number } = {}) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) if (value !== undefined) params.set(key, String(value));
  const query = params.toString();
  return appApi.get<ArchivedMedia[]>(`/vocechat-media${query ? `?${query}` : ''}`);
}

export const listArchivedGroups = () => appApi.get<Array<{ gid: number; name: string }>>('/vocechat-media/groups');

/** Asks the server to look for new files in VoceChat, using this browser's VoceChat login. */
export async function requestMediaSync(force = false): Promise<(MediaCopyStatus & { started: boolean }) | null> {
  const vocechatToken = await ensureFreshVoceChatToken();
  if (!vocechatToken) return null;
  return appApi.post('/vocechat-media/sync', { force }, { headers: { 'X-VoceChat-Token': vocechatToken } });
}

export const mediaCopyStatus = () => appApi.get<MediaCopyStatus>('/vocechat-media/status');

/** A token-authed URL for <img>/<video>/<a download>. */
export function archivedMediaUrl(id: string, options: { thumbnail?: boolean; download?: boolean } = {}): string {
  const params = new URLSearchParams();
  const token = useAuthStore.getState().token;
  if (token) params.set('token', token);
  if (options.download) params.set('download', 'true');
  return `/app-api/vocechat-media/${encodeURIComponent(id)}/${options.thumbnail ? 'thumbnail' : 'file'}?${params.toString()}`;
}

/** "Kopierer fra VoceChat: 120 av 400" while the copy is catching up; empty once it's done. */
export function copyProgressLabel(status: MediaCopyStatus | null): string {
  if (!status || !status.pending) return '';
  return `Kopierer fra VoceChat: ${status.stored} av ${status.stored + status.pending}`;
}
