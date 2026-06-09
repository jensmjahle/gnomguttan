import { create } from 'zustand';
import { mergeChatMessages, sortChatMessages } from '@/services/vocechat';
import type { ChatMessage, Group, MessageTarget, UserInfo, VoceChatHistoryMessage, SSEChatEvent } from '@/types';

// A "thread" is either a group channel (`g:<gid>`) or a 1:1 DM (`u:<uid>`).
export type ThreadKey = `g:${number}` | `u:${number}`;

export function groupThreadKey(gid: number): ThreadKey {
  return `g:${gid}`;
}
export function dmThreadKey(uid: number): ThreadKey {
  return `u:${uid}`;
}

/** Resolve which thread a message belongs to, from the current user's perspective. */
export function threadKeyForMessage(target: MessageTarget, fromUid: number, myUid: number): ThreadKey {
  if ('gid' in target) return groupThreadKey(target.gid);
  const partner = fromUid === myUid ? target.uid : fromUid;
  return dmThreadKey(partner);
}

interface ChatState {
  groups: Group[];
  usersById: Record<number, UserInfo>;
  messages: Record<string, ChatMessage[]>;
  activeThread: ThreadKey | null;

  setGroups: (groups: Group[]) => void;
  cacheUsers: (users: UserInfo[]) => void;
  setActiveThread: (key: ThreadKey | null) => void;
  /** Replace a thread's history (initial load). */
  setHistory: (key: ThreadKey, history: VoceChatHistoryMessage[]) => void;
  /** Prepend older messages (pagination upward). */
  prependHistory: (key: ThreadKey, older: VoceChatHistoryMessage[]) => void;
  /** Merge a single realtime event into its thread. Returns the affected thread key. */
  ingestEvent: (event: SSEChatEvent, myUid: number) => ThreadKey;
  reset: () => void;
}

function applyHistory(history: VoceChatHistoryMessage[]): ChatMessage[] {
  return sortChatMessages(history.reduce<ChatMessage[]>((acc, m) => mergeChatMessages(acc, m), []));
}

export const useChatStore = create<ChatState>((set, get) => ({
  groups: [],
  usersById: {},
  messages: {},
  activeThread: null,

  setGroups: (groups) => set({ groups }),

  cacheUsers: (users) =>
    set((state) => {
      const next = { ...state.usersById };
      for (const u of users) next[u.uid] = u;
      return { usersById: next };
    }),

  setActiveThread: (key) => set({ activeThread: key }),

  setHistory: (key, history) =>
    set((state) => ({ messages: { ...state.messages, [key]: applyHistory(history) } })),

  prependHistory: (key, older) =>
    set((state) => {
      const existing = state.messages[key] ?? [];
      const merged = sortChatMessages(
        older.reduce<ChatMessage[]>((acc, m) => mergeChatMessages(acc, m), [...existing]),
      );
      return { messages: { ...state.messages, [key]: merged } };
    }),

  ingestEvent: (event, myUid) => {
    const key = threadKeyForMessage(event.target, event.from_uid, myUid);
    set((state) => {
      const existing = state.messages[key] ?? [];
      return { messages: { ...state.messages, [key]: mergeChatMessages(existing, event) } };
    });
    return key;
  },

  reset: () => set({ groups: [], usersById: {}, messages: {}, activeThread: null }),
}));

export function selectThreadMessages(key: ThreadKey) {
  return (state: ChatState) => state.messages[key] ?? [];
}

export const useChatStoreGetState = () => useChatStore.getState();
