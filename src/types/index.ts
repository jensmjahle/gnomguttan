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
  token: string;
  refresh_token: string;
  expired_in: number;
  user: UserInfo;
}

export interface Group {
  gid: number;
  name: string;
  description?: string;
  icon?: string;
  member_count?: number;
}

export type FileFilterType = 'Doc' | 'PDF' | 'Image' | 'Audio' | 'Video';

export interface VoceChatFile {
  mid: number;
  from_uid: number;
  gid: number;
  ext: string;
  content_type: string;
  content: string;
  thumbnail?: string;
  properties: string;
  created_at: number;
  expired: boolean;
}

export interface GetFilesQuery {
  uid?: number;
  gid?: number;
  file_type?: FileFilterType;
  creation_time_type?: 'Day1' | 'Day7' | 'Day30' | 'Day90' | 'Day180';
  page?: number;
  page_size?: number;
}

export type MessageTarget =
  | { gid: number }
  | { uid: number };

export type ChatMessageProperties = Record<string, unknown> & {
  local_id?: number;
  content_type?: string;
  name?: string;
  size?: number;
};

interface MessageBaseDetail {
  content_type: string;
  content: string;
  properties?: ChatMessageProperties;
}

export interface MessageNormalDetail extends MessageBaseDetail {
  type: 'normal';
  mid?: number;
  expires_in?: number;
}

export interface MessageReplyDetail extends MessageBaseDetail {
  type: 'reply';
  mid: number;
}

export interface MessageReactionEditDetail extends MessageBaseDetail {
  type: 'edit';
}

export interface MessageReactionLikeDetail {
  type: 'like';
  action: string;
}

export interface MessageReactionDeleteDetail {
  type: 'delete';
}

export interface MessageReactionDetail {
  type: 'reaction';
  mid: number;
  detail: MessageReactionEditDetail | MessageReactionLikeDetail | MessageReactionDeleteDetail;
}

export interface MessageCommandDetail extends Record<string, unknown> {
  type: 'command';
}

export type VoceChatMessageDetail =
  | MessageNormalDetail
  | MessageReplyDetail
  | MessageReactionDetail
  | MessageCommandDetail;

export interface VoceChatHistoryMessage {
  mid: number;
  from_uid: number;
  created_at: number;
  target: MessageTarget;
  detail: VoceChatMessageDetail;
}

export interface SSEChatEvent extends VoceChatHistoryMessage {
  type: 'chat';
}

export interface ChatMessage {
  mid: number;
  from_uid: number;
  created_at: number;
  target: MessageTarget;
  content: string;
  content_type: string;
  properties?: ChatMessageProperties;
  reply_mid?: number;
  detail_type?: VoceChatMessageDetail['type'];
}

export interface UserInfo {
  uid: number;
  email?: string;
  name: string;
  gender: number;
  language: string;
  is_admin: boolean;
  is_bot: boolean;
  avatar_updated_at: number;
  create_by: string;
  msg_smtp_notify_enable: boolean;
  birthday?: number;
}

export type Theme = 'light' | 'dark';

export interface CalendarEvent {
  id: string;
  title: string;
  date: Date;
  color?: string;
}

export type EventRsvpStatus = 'coming' | 'maybe' | 'cannot';

export interface EventResponse {
  uid: number;
  name: string;
  status: EventRsvpStatus;
  respondedAt: number;
}

export interface CommunityEvent {
  id: string;
  title: string;
  startsAt: string;
  location?: string;
  description?: string;
  createdAt: number;
  createdBy: Pick<User, 'uid' | 'name'>;
  responses: EventResponse[];
}

export interface CommunityEventInput {
  title: string;
  startsAt: string;
  location?: string;
  description?: string;
  creator: Pick<User, 'uid' | 'name'>;
}
