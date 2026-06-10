import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Per-thread read state. VoceChat doesn't hand us server-side read markers here,
// so we track the highest message id the local user has seen in each thread and
// persist it (in plain AsyncStorage — this isn't sensitive like the auth token).
//
// A thread counts as unread when its newest message is from someone else and is
// newer than our marker. The marker is:
//   • seeded   the first time a thread is ever seen (baseline = current latest,
//              so a fresh install doesn't show every chat as unread), and
//   • bumped   to the latest mid whenever the user opens/views the thread.
// Because the marker is persisted, messages that arrive while the app is closed
// still surface as unread on the next launch.

interface ReadState {
  lastRead: Record<string, number>;
  /** Bump the marker to `mid` when the user has seen it (open / live view). */
  markRead: (key: string, mid: number) => void;
  /** Establish a baseline the first time a thread is seen; no-op if one exists. */
  seedRead: (key: string, mid: number) => void;
}

export const useReadStore = create<ReadState>()(
  persist(
    (set) => ({
      lastRead: {},
      markRead: (key, mid) =>
        set((state) => {
          const cur = state.lastRead[key];
          if (cur !== undefined && cur >= mid) return state;
          return { lastRead: { ...state.lastRead, [key]: mid } };
        }),
      seedRead: (key, mid) =>
        set((state) =>
          state.lastRead[key] !== undefined
            ? state
            : { lastRead: { ...state.lastRead, [key]: mid } },
        ),
    }),
    {
      name: 'gnomchat-read',
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);

/** Newest message in a thread is unread for `myUid`, given the read markers. */
export function isThreadUnread(
  lastRead: Record<string, number>,
  key: string,
  latest: { mid: number; from_uid: number } | undefined,
  myUid: number,
): boolean {
  if (!latest || latest.from_uid === myUid) return false;
  const lr = lastRead[key];
  // Undefined marker means "not yet baselined" — treat as read; seedRead will
  // set a baseline momentarily so genuinely new messages surface afterwards.
  return lr !== undefined && latest.mid > lr;
}
