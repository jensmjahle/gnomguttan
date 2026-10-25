export interface MatrixSession { baseUrl: string; accessToken: string; userId: string; deviceId: string }
export interface MatrixRoom {
  id: string; name: string; direct: boolean; membership: string; unread: number;
  encrypted: boolean; lastActivity: number; preview: string; avatar?: string;
}
export interface MatrixMessage {
  id: string; sender: string; senderName: string; body: string; timestamp: number;
  msgtype: string; pending: boolean; failed: boolean; encrypted: boolean; redacted: boolean; avatar?: string;
  media?: { url?: string; file?: Record<string, unknown>; mimetype?: string; name: string };
  reactions: { key: string; count: number; mine: boolean; eventIds: string[] }[];
  readBy: string[];
}
