import { create } from 'zustand';
import type { CommentThreadRef } from '@/types';

/** How long a typing signal counts; clients resend about every 3 s while typing. */
const TYPING_TTL_MS = 6000;

interface Typist {
  name: string;
  until: number;
}

interface TypingStore {
  /** `${kind}:${id}` -> uid -> who is typing there, and until when. */
  byThread: Record<string, Record<number, Typist>>;
  markTyping: (thread: CommentThreadRef, uid: number, name: string) => void;
  clearTyping: (thread: CommentThreadRef, uid: number) => void;
}

export function threadKey(thread: CommentThreadRef) {
  return `${thread.kind}:${thread.id}`;
}

function withoutTypist(state: TypingStore, key: string, uid: number) {
  const typists = state.byThread[key];
  if (!typists?.[uid]) return state.byThread;
  const { [uid]: _removed, ...rest } = typists;
  return { ...state.byThread, [key]: rest };
}

export const useTypingStore = create<TypingStore>()((set, get) => ({
  byThread: {},
  markTyping: (thread, uid, name) => {
    const key = threadKey(thread);
    const until = Date.now() + TYPING_TTL_MS;
    set((state) => ({ byThread: { ...state.byThread, [key]: { ...state.byThread[key], [uid]: { name, until } } } }));
    setTimeout(() => {
      // Only expire if no newer signal extended it in the meantime.
      if (get().byThread[key]?.[uid]?.until === until) {
        set((state) => ({ byThread: withoutTypist(state, key, uid) }));
      }
    }, TYPING_TTL_MS);
  },
  clearTyping: (thread, uid) => set((state) => ({ byThread: withoutTypist(state, threadKey(thread), uid) })),
}));
