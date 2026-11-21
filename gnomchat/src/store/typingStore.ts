import { create } from 'zustand';
import type { CommentThreadRef } from '@/types';

const TYPING_TTL_MS = 6000;
const key = (thread: CommentThreadRef) => `${thread.kind}:${thread.id}`;

interface TypingStore {
  typing: Record<string, Record<number, { name: string; until: number }>>;
  markTyping: (thread: CommentThreadRef, uid: number, name: string) => void;
  clearTyping: (thread: CommentThreadRef, uid: number) => void;
}

export const useTypingStore = create<TypingStore>()((set) => ({
  typing: {},
  markTyping: (thread, uid, name) => {
    set((state) => ({ typing: { ...state.typing, [key(thread)]: { ...state.typing[key(thread)], [uid]: { name, until: Date.now() + TYPING_TTL_MS } } } }));
    setTimeout(() => set((state) => {
      const entry = state.typing[key(thread)]?.[uid];
      if (!entry || entry.until > Date.now()) return state;
      const { [uid]: _gone, ...rest } = state.typing[key(thread)] ?? {};
      return { typing: { ...state.typing, [key(thread)]: rest } };
    }), TYPING_TTL_MS + 50);
  },
  clearTyping: (thread, uid) => set((state) => {
    const { [uid]: _gone, ...rest } = state.typing[key(thread)] ?? {};
    return { typing: { ...state.typing, [key(thread)]: rest } };
  }),
}));

export function useTypingNames(thread: CommentThreadRef): string[] {
  const entries = useTypingStore((state) => state.typing[key(thread)]);
  return Object.values(entries ?? {}).filter((entry) => entry.until > Date.now()).map((entry) => entry.name);
}
