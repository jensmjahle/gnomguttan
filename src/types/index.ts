export interface User {
  uid: number;
  name: string;
  email: string;
  avatarUpdatedAt?: number;
  isAdmin?: boolean;
}

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface LoginResponse {
  server_id: string;
  uid: number;
  name: string;
  email: string;
  avatar_updated_at: number;
  token: string;
  refresh_token: string;
  expired_in: number;
  is_admin: boolean;
}

export interface Group {
  gid: number;
  name: string;
  description?: string;
  icon?: string;
  member_count?: number;
}

export type MessageTarget =
  | { type: 'group'; gid: number }
  | { type: 'user'; uid: number };

export interface ChatMessage {
  mid: number;
  from_uid: number;
  created_at: number;
  content: string;
  content_type: string;
  target: MessageTarget;
}

export interface SSEChatEvent {
  type: 'chat';
  from_uid: number;
  created_at: number;
  mid: number;
  target: MessageTarget;
  content_type: string;
  content: string;
}

export interface UserInfo {
  uid: number;
  name: string;
  avatar_updated_at?: number;
}

export type Theme = 'light' | 'dark';

export interface CalendarEvent {
  id: string;
  title: string;
  date: Date;
  color?: string;
}
