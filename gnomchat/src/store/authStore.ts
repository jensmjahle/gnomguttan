import { create } from 'zustand';
import { persist, createJSONStorage, type StateStorage } from 'zustand/middleware';
import * as SecureStore from 'expo-secure-store';
import type { User } from '@/types';

// SecureStore-backed storage adapter for zustand persist. Keeps the session
// token out of plain AsyncStorage. SecureStore keys can't contain '/', so the
// store name below stays simple.
const secureStorage: StateStorage = {
  getItem: (name) => SecureStore.getItemAsync(name),
  setItem: (name, value) => SecureStore.setItemAsync(name, value),
  removeItem: (name) => SecureStore.deleteItemAsync(name),
};

interface AuthStore {
  user: User | null;
  token: string | null;
  refreshToken: string | null;
  expiresAt: number | null;
  hydrated: boolean;
  setAuth: (session: { user: User; token: string; refreshToken: string; expiresAt: number }) => void;
  clearAuth: () => void;
}

export const useAuthStore = create<AuthStore>()(
  persist(
    (set) => ({
      user: null,
      token: null,
      refreshToken: null,
      expiresAt: null,
      hydrated: false,
      setAuth: (session) => set(session),
      clearAuth: () => set({ user: null, token: null, refreshToken: null, expiresAt: null }),
    }),
    {
      name: 'gnomchat-auth',
      storage: createJSONStorage(() => secureStorage),
      partialize: (state) => ({
        user: state.user,
        token: state.token,
        refreshToken: state.refreshToken,
        expiresAt: state.expiresAt,
      }),
      onRehydrateStorage: () => (state) => {
        useAuthStore.setState({ hydrated: true });
        void state;
      },
    },
  ),
);
