import { create } from 'zustand';
import { persist, createJSONStorage, type StateStorage } from 'zustand/middleware';
import * as SecureStore from '@/utils/secureStore';
import type { User } from '@/types';

// SecureStore keeps the session token out of plain storage. Keys can't contain '/'.
const secureStorage: StateStorage = {
  getItem: (name) => SecureStore.getItemAsync(name),
  setItem: (name, value) => SecureStore.setItemAsync(name, value),
  removeItem: (name) => SecureStore.deleteItemAsync(name),
};

export interface AppSession {
  user: User;
  /** Our own session token (gns_…), sent as X-API-Key to /app-api. */
  token: string;
  expiresAt: number;
}

interface AuthStore {
  user: User | null;
  token: string | null;
  expiresAt: number | null;
  hydrated: boolean;
  /** Set when the server rejected the session, so the login screen can say why. */
  signedOutReason: string | null;
  setAuth: (session: AppSession) => void;
  setUser: (user: User) => void;
  clearAuth: (reason?: string) => void;
}

export const useAuthStore = create<AuthStore>()(
  persist(
    (set) => ({
      user: null,
      token: null,
      expiresAt: null,
      hydrated: false,
      signedOutReason: null,
      setAuth: ({ user, token, expiresAt }) => set({ user, token, expiresAt, signedOutReason: null }),
      setUser: (user) => set({ user }),
      clearAuth: (reason) => set({ user: null, token: null, expiresAt: null, signedOutReason: reason ?? null }),
    }),
    {
      // v2: the session is our own login now, not VoceChat's.
      name: 'gnomchat-auth-v2',
      storage: createJSONStorage(() => secureStorage),
      partialize: (state) => ({ user: state.user, token: state.token, expiresAt: state.expiresAt }),
      onRehydrateStorage: () => () => {
        useAuthStore.setState({ hydrated: true });
        // The old VoceChat session can't be used any more.
        void SecureStore.deleteItemAsync('gnomchat-auth').catch(() => {});
      },
    },
  ),
);
