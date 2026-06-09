import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import * as SecureStore from 'expo-secure-store';
import {
  THEME_TOKENS,
  THEME_LIST,
  DEFAULT_THEME_ID,
  RADIUS,
  type ThemeId,
  type ThemeTokens,
  type ThemeMeta,
} from './themeTokens.generated';
import { fontFamily, type FontWeight } from './fonts';

const STORAGE_KEY = 'gnomchat-theme';

interface ThemeContextValue {
  themeId: ThemeId;
  tokens: ThemeTokens;
  radius: typeof RADIUS;
  themes: ThemeMeta[];
  setTheme: (id: ThemeId) => void;
  /** Font family for a weight, honouring the active theme's system-font override. */
  font: (weight?: FontWeight) => string | undefined;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function isThemeId(value: string | null): value is ThemeId {
  return !!value && value in THEME_TOKENS;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [themeId, setThemeId] = useState<ThemeId>(DEFAULT_THEME_ID);

  // Restore persisted theme on launch.
  useEffect(() => {
    let active = true;
    SecureStore.getItemAsync(STORAGE_KEY)
      .then((stored) => {
        if (active && isThemeId(stored)) setThemeId(stored);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  const setTheme = useCallback((id: ThemeId) => {
    setThemeId(id);
    SecureStore.setItemAsync(STORAGE_KEY, id).catch(() => {});
  }, []);

  const value = useMemo<ThemeContextValue>(() => {
    const tokens = THEME_TOKENS[themeId] ?? THEME_TOKENS[DEFAULT_THEME_ID];
    return {
      themeId,
      tokens,
      radius: RADIUS,
      themes: THEME_LIST,
      setTheme,
      font: (weight: FontWeight = 400) => fontFamily(weight, tokens.fontOverride),
    };
  }, [themeId, setTheme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within a ThemeProvider');
  return ctx;
}
