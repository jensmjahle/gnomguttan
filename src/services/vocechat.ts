import { api } from './api';
import { config } from '@/config';
import { useAuthStore } from '@/store/authStore';
import type {
  LoginCredentials,
  LoginResponse,
  User,
  Group,
  ChatMessage,
  UserInfo,
  SSEChatEvent,
} from '@/types';

export const vocechatService = {
  async login(credentials: LoginCredentials): Promise<LoginResponse> {
    return api.post<LoginResponse>('/api/user/login', {
      credential: { type: 'password', email: credentials.email, password: credentials.password },
      device: 'web',
    });
  },

  getMe(): Promise<User> {
    return api.get<User>('/api/user/me');
  },

  getGroups(): Promise<Group[]> {
    return api.get<Group[]>('/api/group');
  },

  getUserInfo(uid: number): Promise<UserInfo> {
    return api.get<UserInfo>(`/api/user/${uid}`);
  },

  getGroupHistory(gid: number, before?: number, limit = 50): Promise<ChatMessage[]> {
    const params = new URLSearchParams({ limit: String(limit) });
    if (before !== undefined) params.set('before', String(before));
    return api.get<ChatMessage[]>(`/api/group/${gid}/history?${params}`);
  },

  sendGroupMessage(gid: number, content: string): Promise<number> {
    return api.post<number>(`/api/group/${gid}/send_text`, { content });
  },

  sendDirectMessage(uid: number, content: string): Promise<number> {
    return api.post<number>(`/api/user/${uid}/send_text`, { content });
  },

  avatarUrl(uid: number, updatedAt?: number): string {
    const t = updatedAt ?? 0;
    return `${config.vocechatHost}/api/resource/avatar?uid=${uid}&t=${t}`;
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
