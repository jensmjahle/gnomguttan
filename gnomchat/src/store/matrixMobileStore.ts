import { create } from 'zustand';
export const useMatrixMobileStore = create<{
  authenticated: boolean; userId: string | null; pendingRoom: string | null; notificationError: string | null; activeRoom: string | null; unreadCount: number;
}>(() => ({ authenticated: false, userId: null, pendingRoom: null, notificationError: null, activeRoom: null, unreadCount: 0 }));
