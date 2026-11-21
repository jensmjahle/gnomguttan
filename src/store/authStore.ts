import { create } from 'zustand';
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware';
import type { User } from '@/types';

/** VoceChat's tokens, kept only for the pages that still read VoceChat until the cutoff. */
export interface VoceChatSession {
  token: string;
  refreshToken: string;
  expiresAt: number;
}

export interface AppSession {
  user: User;
  token: string;
  expiresAt: number;
  remember: boolean;
}

interface AuthStore {
  user: User | null;
  /** Our own session token, sent as X-API-Key to /app-api. */
  token: string | null;
  expiresAt: number | null;
  /** "Husk meg": kept across browser restarts. */
  remember: boolean;
  vocechat: VoceChatSession | null;
  /** An old VoceChat-only login was dropped on upgrade; the login page explains why. */
  needsRelogin: boolean;
  setAuth: (session: AppSession) => void;
  setUser: (user: User) => void;
  setVoceChat: (session: VoceChatSession | null) => void;
  clearAuth: () => void;
}

const STORAGE_KEY = 'gnomguttan-auth';

function attempt<T>(fn: () => T): T | null {
  try { return fn(); } catch { return null; }
}

// Remembered logins live in localStorage. Others live in sessionStorage, which the browser
// clears when it closes; authTabs.ts hands them to new tabs of the same browser session.
const authStorage: StateStorage = {
  getItem: (name) => attempt(() => localStorage.getItem(name)) ?? attempt(() => sessionStorage.getItem(name)),
  setItem: (name, value) => {
    const remember = Boolean(attempt(() => JSON.parse(value)?.state?.remember));
    attempt(() => (remember ? localStorage : sessionStorage).setItem(name, value));
    attempt(() => (remember ? sessionStorage : localStorage).removeItem(name));
  },
  removeItem: (name) => {
    attempt(() => localStorage.removeItem(name));
    attempt(() => sessionStorage.removeItem(name));
  },
};

const signedOut = { user: null, token: null, expiresAt: null, remember: false, vocechat: null };

export const useAuthStore = create<AuthStore>()(
  persist(
    (set) => ({
      ...signedOut,
      needsRelogin: false,
      setAuth: ({ user, token, expiresAt, remember }) => set({ user, token, expiresAt, remember, needsRelogin: false }),
      setUser: (user) => set({ user }),
      setVoceChat: (vocechat) => set({ vocechat }),
      clearAuth: () => set(signedOut),
    }),
    {
      name: STORAGE_KEY,
      version: 1,
      storage: createJSONStorage(() => authStorage),
      partialize: ({ user, token, expiresAt, remember, vocechat, needsRelogin }) => ({ user, token, expiresAt, remember, vocechat, needsRelogin }),
      // Version 0 stored a VoceChat token as the login. Logging in again moves the password
      // over to our own accounts, so it isn't carried forward.
      migrate: (persisted, version) => {
        if (version < 1) {
          const old = persisted as { token?: string | null } | undefined;
          return { ...signedOut, needsRelogin: Boolean(old?.token) };
        }
        return persisted as AuthStore;
      },
    }
  )
);
