import { Base64 } from 'js-base64';
import { api } from '@/services/api';
import { config } from '@/config';
import type { UploadedFile } from '@/services/uploads';
import type {
  LoginCredentials,
  LoginResponse,
  Group,
  ChatMessage,
  ChatMessageProperties,
  VoceChatHistoryMessage,
  UserInfo,
  SSEChatEvent,
} from '@/types';

// REST + message-normalization layer. Ported near 1:1 from the website's
// src/services/vocechat.ts so the app speaks to VoceChat exactly like the site.

function toChatMessageProperties(properties: unknown): ChatMessageProperties | undefined {
  if (!properties || typeof properties !== 'object') return undefined;
  return properties as ChatMessageProperties;
}

function normalizeChatMessage(message: VoceChatHistoryMessage | SSEChatEvent): ChatMessage | null {
  const { detail } = message;

  switch (detail.type) {
    case 'normal':
      return {
        mid: message.mid,
        from_uid: message.from_uid,
        created_at: message.created_at,
        target: message.target,
        content: detail.content,
        content_type: detail.content_type,
        properties: toChatMessageProperties(detail.properties),
        detail_type: detail.type,
      };
    case 'reply':
      return {
        mid: message.mid,
        from_uid: message.from_uid,
        created_at: message.created_at,
        target: message.target,
        content: detail.content,
        content_type: detail.content_type,
        properties: toChatMessageProperties(detail.properties),
        reply_mid: detail.mid,
        detail_type: detail.type,
      };
    case 'reaction':
      if (detail.detail.type !== 'edit') return null;
      return {
        mid: detail.mid,
        from_uid: message.from_uid,
        created_at: message.created_at,
        target: message.target,
        content: detail.detail.content,
        content_type: detail.detail.content_type,
        properties: toChatMessageProperties(detail.detail.properties),
        detail_type: detail.type,
      };
    default:
      return null;
  }
}

export function mergeChatMessages(
  currentMessages: ChatMessage[],
  message: VoceChatHistoryMessage | SSEChatEvent,
): ChatMessage[] {
  const { detail } = message;

  if (detail.type === 'reaction') {
    if (detail.detail.type === 'delete') {
      return currentMessages.filter((m) => m.mid !== detail.mid);
    }
    if (detail.detail.type !== 'edit') return currentMessages;

    const existingIndex = currentMessages.findIndex((m) => m.mid === detail.mid);
    if (existingIndex === -1) return currentMessages;

    const next = [...currentMessages];
    next[existingIndex] = {
      ...next[existingIndex],
      content: detail.detail.content,
      content_type: detail.detail.content_type,
      properties: toChatMessageProperties(detail.detail.properties) ?? next[existingIndex].properties,
    };
    return next;
  }

  const normalized = normalizeChatMessage(message);
  if (!normalized) return currentMessages;

  const existingIndex = currentMessages.findIndex((m) => m.mid === normalized.mid);
  if (existingIndex === -1) return [...currentMessages, normalized];

  const next = [...currentMessages];
  next[existingIndex] = normalized;
  return next;
}

export function sortChatMessages(messages: ChatMessage[]): ChatMessage[] {
  return [...messages].sort((a, b) => a.created_at - b.created_at || a.mid - b.mid);
}

export function normalizeChatHistory(messages: VoceChatHistoryMessage[]): ChatMessage[] {
  return sortChatMessages(
    messages.reduce<ChatMessage[]>((acc, message) => mergeChatMessages(acc, message), []),
  );
}

/** Build send headers for a `vocechat/file` message (content-type + X-Properties). */
function fileMessageHeaders(file: UploadedFile): Record<string, string> {
  const properties: Record<string, unknown> = {
    content_type: file.contentType,
    name: file.name,
    size: file.size,
  };
  if (file.width) properties.width = file.width;
  if (file.height) properties.height = file.height;
  return {
    'Content-Type': 'vocechat/file',
    'X-Properties': Base64.encode(JSON.stringify(properties)),
  };
}

export const vocechatService = {
  login(credentials: LoginCredentials): Promise<LoginResponse> {
    const body = {
      credential: { type: 'password', email: credentials.email, password: credentials.password },
      device: 'mobile',
      device_token: '',
    };
    return api.post<LoginResponse>('/api/token/login', body, { skipAuth: true });
  },

  getMe(): Promise<UserInfo> {
    return api.get<UserInfo>('/api/user/me');
  },

  getGroups(): Promise<Group[]> {
    return api.get<Group[]>('/api/group');
  },

  getUserInfo(uid: number): Promise<UserInfo> {
    return api.get<UserInfo>(`/api/user/${uid}`);
  },

  listUsers(): Promise<UserInfo[]> {
    return api.get<UserInfo[]>('/api/user');
  },

  getGroupHistory(gid: number, before?: number, limit = 50): Promise<VoceChatHistoryMessage[]> {
    const params = new URLSearchParams({ limit: String(limit) });
    if (before !== undefined) params.set('before', String(before));
    return api.get<VoceChatHistoryMessage[]>(`/api/group/${gid}/history?${params}`);
  },

  getUserHistory(uid: number, before?: number, limit = 50): Promise<VoceChatHistoryMessage[]> {
    const params = new URLSearchParams({ limit: String(limit) });
    if (before !== undefined) params.set('before', String(before));
    return api.get<VoceChatHistoryMessage[]>(`/api/user/${uid}/history?${params}`);
  },

  sendGroupMessage(gid: number, content: string): Promise<number> {
    return api.post<number>(`/api/group/${gid}/send`, content, {
      headers: { 'Content-Type': 'text/plain' },
    });
  },

  sendDirectMessage(uid: number, content: string): Promise<number> {
    return api.post<number>(`/api/user/${uid}/send`, content, {
      headers: { 'Content-Type': 'text/plain' },
    });
  },

  /** Send an already-uploaded file as a `vocechat/file` message to a group. */
  sendGroupFile(gid: number, file: UploadedFile): Promise<number> {
    return api.post<number>(`/api/group/${gid}/send`, JSON.stringify({ path: file.path }), {
      headers: fileMessageHeaders(file),
    });
  },

  /** Send an already-uploaded file as a `vocechat/file` message to a user (DM). */
  sendDirectFile(uid: number, file: UploadedFile): Promise<number> {
    return api.post<number>(`/api/user/${uid}/send`, JSON.stringify({ path: file.path }), {
      headers: fileMessageHeaders(file),
    });
  },

  avatarUrl(uid: number, updatedAt?: number): string {
    return `${config.vocechatHost}/api/resource/avatar?uid=${uid}&t=${updatedAt ?? 0}`;
  },

  groupAvatarUrl(gid: number, updatedAt?: number): string {
    return `${config.vocechatHost}/api/resource/group_avatar?gid=${gid}&t=${updatedAt ?? 0}`;
  },

  resourceFileUrl(filePath: string, options?: { download?: boolean; thumbnail?: boolean }): string {
    const params = new URLSearchParams({ file_path: filePath });
    if (options?.download) params.set('download', 'true');
    if (options?.thumbnail) params.set('thumbnail', 'true');
    return `${config.vocechatHost}/api/resource/file?${params.toString()}`;
  },
};
