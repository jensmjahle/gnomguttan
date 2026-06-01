import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Theme } from '@/types';

interface ThemeStore {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
}

function applyTheme(theme: Theme) {
  document.documentElement.setAttribute('data-theme', theme);
}

export const useThemeStore = create<ThemeStore>()(
  persist(
    (set) => ({
      theme: 'forest' as Theme,
      setTheme: (theme) => {
        applyTheme(theme);
        set({ theme });
      },
      toggleTheme: () =>
        set((s) => {
          const order: Theme[] = ['forest', 'sky', 'light', 'dark'];
          const next = order[(order.indexOf(s.theme) + 1) % order.length];
          applyTheme(next);
          return { theme: next };
        }),
    }),
    {
      name: 'gnomguttan-theme',
      onRehydrateStorage: () => (state) => {
        if (state) applyTheme(state.theme);
      },
    }
  )
);
