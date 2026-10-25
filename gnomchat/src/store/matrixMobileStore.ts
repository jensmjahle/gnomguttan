import { create } from 'zustand';
import type { MatrixSession, MatrixRoom, MatrixMessage } from '@/types/matrix';
export const useMatrixMobileStore = create<{
  authenticated: boolean; userId: string | null; pendingRoom: string | null; notificationError: string | null; activeRoom: string | null; unreadCount: number; chatVisible: boolean;
  session: MatrixSession | null; hydrated: boolean; engineReady: boolean; status: string; error: string | null;
  rooms: MatrixRoom[]; messages: Record<string, MatrixMessage[]>; typing: string[];
  verification: { phase: string; incoming: boolean; device: string; emoji: [string, string][]; decimal: number[] } | null;
}>(() => ({ authenticated: false, userId: null, pendingRoom: null, notificationError: null, activeRoom: null, unreadCount: 0, chatVisible: false,
  session: null, hydrated: false, engineReady: false, status: 'Starter Matrix …', error: null, rooms: [], messages: {}, typing: [], verification: null }));
