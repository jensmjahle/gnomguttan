import { create } from 'zustand';
import { persist, createJSONStorage, type StateStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from '@/utils/secureStore';
import type { EngineSession, RoomSummary, RoomTimeline, SyncStatus, VerificationView } from '@/matrix/protocol.generated';

const secureStorage: StateStorage = {
  getItem: (name) => SecureStore.getItemAsync(name),
  setItem: (name, value) => SecureStore.setItemAsync(name, value),
  removeItem: (name) => SecureStore.deleteItemAsync(name),
};

/** The Matrix login (separate from the Gnomguttan login, like on the website). */
interface MatrixSessionStore {
  session: EngineSession | null;
  hydrated: boolean;
  setSession: (session: EngineSession | null) => void;
}

export const useMatrixSession = create<MatrixSessionStore>()(
  persist(
    (set) => ({ session: null, hydrated: false, setSession: (session) => set({ session }) }),
    {
      name: 'gnomchat-matrix-session',
      storage: createJSONStorage(() => secureStorage),
      partialize: (state) => ({ session: state.session }),
      onRehydrateStorage: () => () => useMatrixSession.setState({ hydrated: true }),
    },
  ),
);

/**
 * What the engine last told us: the room list and the recent timeline of rooms
 * we've opened. Kept on the device so the chat opens instantly, also offline.
 */
interface MatrixState {
  engineReady: boolean;
  engineError: string | null;
  status: SyncStatus;
  statusDetail: string;
  cryptoReady: boolean;
  rooms: RoomSummary[];
  timelines: Record<string, RoomTimeline>;
  uploads: Record<string, number | null>;
  verification: VerificationView;
  setRooms: (rooms: RoomSummary[]) => void;
  setTimeline: (timeline: RoomTimeline) => void;
  reset: () => void;
}

const initial = {
  engineReady: false,
  engineError: null,
  status: 'stopped' as SyncStatus,
  statusDetail: '',
  cryptoReady: false,
  rooms: [] as RoomSummary[],
  timelines: {} as Record<string, RoomTimeline>,
  uploads: {} as Record<string, number | null>,
  verification: { phase: 'none', initiatedByMe: false, otherDeviceId: '' } as VerificationView,
};

const KEEP_TIMELINES = 12;
const KEEP_ITEMS = 60;

export const useMatrixStore = create<MatrixState>()(
  persist(
    (set) => ({
      ...initial,
      setRooms: (rooms) => set({ rooms }),
      setTimeline: (timeline) => set((state) => ({ timelines: { ...state.timelines, [timeline.roomId]: timeline } })),
      reset: () => set({ ...initial }),
    }),
    {
      name: 'gnomchat-matrix-cache-v1',
      storage: createJSONStorage(() => AsyncStorage),
      // Only the most recent rooms and messages are kept on disk.
      partialize: (state) => {
        const recent = state.rooms.slice(0, KEEP_TIMELINES).map((room) => room.roomId);
        return {
          rooms: state.rooms,
          timelines: Object.fromEntries(recent.filter((id) => state.timelines[id]).map((id) => {
            const timeline = state.timelines[id];
            return [id, { ...timeline, typing: [], items: timeline.items.filter((item) => item.status === 'sent').slice(-KEEP_ITEMS) }];
          })),
        };
      },
    },
  ),
);

export function useRoom(roomId: string) {
  return useMatrixStore((state) => state.rooms.find((room) => room.roomId === roomId));
}

export function totalUnread(rooms: RoomSummary[]) {
  return rooms.filter((room) => room.membership === 'join').reduce((sum, room) => sum + room.unread, 0) + rooms.filter((room) => room.membership === 'invite').length;
}
