import { api } from './api';
import { config } from '@/config';
import { useAuthStore } from '@/store/authStore';
import type {
  GetFilesQuery,
  VoceChatFile,
  LoginCredentials,
  LoginResponse,
  Group,
  ChatMessage,
  ChatMessageProperties,
  VoceChatHistoryMessage,
  UserInfo,
  SSEChatEvent,
} from '@/types';

function toChatMessageProperties(properties: unknown): ChatMessageProperties | undefined {
  if (!properties || typeof properties !== 'object') {
    return undefined;
  }
  return properties as ChatMessageProperties;
}

function normalizeChatMessage(
  message: VoceChatHistoryMessage | SSEChatEvent
): ChatMessage | null {
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
      if (detail.detail.type !== 'edit') {
        return null;
      }

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
  message: VoceChatHistoryMessage | SSEChatEvent
): ChatMessage[] {
  const { detail } = message;

  if (detail.type === 'reaction') {
    if (detail.detail.type === 'delete') {
      return currentMessages.filter((currentMessage) => currentMessage.mid !== detail.mid);
    }

    if (detail.detail.type !== 'edit') {
      return currentMessages;
    }

    const existingIndex = currentMessages.findIndex((currentMessage) => currentMessage.mid === detail.mid);
    if (existingIndex === -1) {
      return currentMessages;
    }

    const nextMessages = [...currentMessages];
    nextMessages[existingIndex] = {
      ...nextMessages[existingIndex],
      content: detail.detail.content,
      content_type: detail.detail.content_type,
      properties: toChatMessageProperties(detail.detail.properties) ?? nextMessages[existingIndex].properties,
    };
    return nextMessages;
  }

  const normalized = normalizeChatMessage(message);
  if (!normalized) {
    return currentMessages;
  }

  const existingIndex = currentMessages.findIndex((currentMessage) => currentMessage.mid === normalized.mid);
  if (existingIndex === -1) {
    return [...currentMessages, normalized];
  }

  const nextMessages = [...currentMessages];
  nextMessages[existingIndex] = normalized;
  return nextMessages;
}

export function sortChatMessages(messages: ChatMessage[]): ChatMessage[] {
  return [...messages].sort((left, right) => left.created_at - right.created_at || left.mid - right.mid);
}

export function normalizeChatHistory(messages: VoceChatHistoryMessage[]): ChatMessage[] {
  return sortChatMessages(
    messages.reduce<ChatMessage[]>((currentMessages, message) => mergeChatMessages(currentMessages, message), [])
  );
}

export const vocechatService = {
  async login(credentials: LoginCredentials): Promise<LoginResponse> {
    const body = {
      credential: { type: 'password', email: credentials.email, password: credentials.password },
      device: 'web',
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

  getSystemFiles(params: GetFilesQuery = {}): Promise<VoceChatFile[]> {
    const searchParams = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null && value !== '') {
        searchParams.set(key, String(value));
      }
    }
    const query = searchParams.toString();
    return api.get<VoceChatFile[]>(`/api/admin/system/files${query ? `?${query}` : ''}`);
  },

  getGroupHistory(gid: number, before?: number, limit = 50): Promise<VoceChatHistoryMessage[]> {
    const params = new URLSearchParams({ limit: String(limit) });
    if (before !== undefined) params.set('before', String(before));
    return api.get<VoceChatHistoryMessage[]>(`/api/group/${gid}/history?${params}`);
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

  avatarUrl(uid: number, updatedAt?: number): string {
    const t = updatedAt ?? 0;
    return `${config.vocechatHost}/api/resource/avatar?uid=${uid}&t=${t}`;
  },

  resourceFileUrl(filePath: string, options?: { download?: boolean; thumbnail?: boolean }): string {
    const params = new URLSearchParams({ file_path: filePath });
    if (options?.download) params.set('download', 'true');
    if (options?.thumbnail) params.set('thumbnail', 'true');
    return `${config.vocechatHost}/api/resource/file?${params.toString()}`;
  },

  /** Opens an SSE stream. Caller must call .close() on the returned EventSource. */
  openEventStream(onChat: (event: SSEChatEvent) => void): EventSource {
    const token = useAuthStore.getState().token ?? '';
    const url = `${config.vocechatHost}/api/user/events?api-key=${encodeURIComponent(token)}`;
    const es = new EventSource(url);

    es.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data) as SSEChatEvent;
        if (data.type === 'chat') onChat(data);
      } catch {
        // ignore malformed frames
      }
    };

    return es;
  },
};
