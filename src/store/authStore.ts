import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { User } from '@/types';

interface AuthStore {
  user: User | null;
  token: string | null;
  refreshToken: string | null;
  expiresAt: number | null;
  setAuth: (session: {
    user: User;
    token: string;
    refreshToken: string;
    expiresAt: number;
  }) => void;
  clearAuth: () => void;
}

export const useAuthStore = create<AuthStore>()(
  persist(
    (set) => ({
      user: null,
      token: null,
      refreshToken: null,
      expiresAt: null,
      setAuth: (session) => set(session),
      clearAuth: () => set({ user: null, token: null, refreshToken: null, expiresAt: null }),
    }),
    { name: 'gnomguttan-auth' }
  )
);
