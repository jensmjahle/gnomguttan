import { appApi, authedUrl } from '@/services/appApi';

// Our own copy of the media once posted in VoceChat channels (server/vocechatMedia.js).
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
  stored: boolean;
  hasThumbnail: boolean;
}

export function listArchivedMedia(filters: { kind?: ArchivedMediaKind; gid?: number } = {}) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) if (value !== undefined) params.set(key, String(value));
  const query = params.toString();
  return appApi.get<ArchivedMedia[]>(`/vocechat-media${query ? `?${query}` : ''}`);
}

export const listArchivedGroups = () => appApi.get<Array<{ gid: number; name: string }>>('/vocechat-media/groups');

export const archivedMediaUrl = (id: string, options: { thumbnail?: boolean; download?: boolean } = {}) =>
  authedUrl(`/vocechat-media/${encodeURIComponent(id)}/${options.thumbnail ? 'thumbnail' : 'file'}`, options.download ? { download: 'true' } : {});
