export interface MatrixSession { baseUrl: string; accessToken: string; userId: string; deviceId: string }
export interface MatrixRoom {
  id: string; name: string; direct: boolean; membership: string; unread: number;
  encrypted: boolean; lastActivity: number; preview: string; avatar?: string; space?: boolean; topic?: string;
}
export interface MatrixMessage {
  id: string; sender: string; senderName: string; body: string; timestamp: number;
  msgtype: string; pending: boolean; failed: boolean; encrypted: boolean; redacted: boolean; avatar?: string; sticker?: boolean; edited?: boolean; replyTo?: string;
  location?: { latitude: number; longitude: number; accuracy?: number };
  poll?: { question: string; answers: { id: string; text: string; count: number }[]; maxSelections: number; ended: boolean; myVote: string[]; total: number; showResults: boolean; canEnd?: boolean; loading?: boolean; error?: string };
  media?: { url?: string; file?: Record<string, unknown>; mimetype?: string; name: string };
  reactions: { key: string; count: number; mine: boolean; eventIds: string[]; names?: string[] }[];
  readBy: string[];
}
export interface MatrixRoomDetails {
  id: string; name: string; topic: string; avatar?: string; alias?: string; encrypted: boolean; space: boolean; joinRule: string; history: string;
  muted: boolean; canInvite: boolean; mayAddChild: boolean; permissions: Record<string, boolean>;
  members: { id: string; name: string; avatar?: string; membership: string; power: number }[];
}
