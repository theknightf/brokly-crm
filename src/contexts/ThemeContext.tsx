'use client';

import React, {
  createContext,
  useContext,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';

export type ThemePref = 'light' | 'dark' | 'system';

interface ThemeContextValue {
  theme: ThemePref;
  resolvedDark: boolean;
  setTheme: (t: ThemePref) => void;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

const STORAGE_KEY = 'brokly_theme';

function systemPrefersDark(): boolean {
  try {
    return (
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-color-scheme: dark)').matches === true
    );
  } catch {
    return false;
  }
}

function resolveDark(pref: ThemePref): boolean {
  if (pref === 'dark') return true;
  if (pref === 'light') return false;
  return systemPrefersDark();
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<ThemePref>('system');
  const [resolvedDark, setResolvedDark] = useState(false);

  // Load persisted preference (client only).
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved === 'light' || saved === 'dark' || saved === 'system') {
        setThemeState(saved);
      }
    } catch {
      /* ignore */
    }
  }, []);

  // Apply the dark class whenever the preference (or system) changes.
  useEffect(() => {
    const apply = () => {
      const dark = resolveDark(theme);
      setResolvedDark(dark);
      document.documentElement.classList.toggle('dark', dark);
    };
    apply();

    if (theme === 'system') {
      const mq = window.matchMedia('(prefers-color-scheme: dark)');
      const onChange = () => apply();
      mq.addEventListener('change', onChange);
      return () => mq.removeEventListener('change', onChange);
    }
  }, [theme]);

  const setTheme = useCallback((t: ThemePref) => {
    setThemeState(t);
    try {
      window.localStorage.setItem(STORAGE_KEY, t);
    } catch {
      /* ignore */
    }
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme(resolvedDark ? 'light' : 'dark');
  }, [resolvedDark, setTheme]);

  const value = useMemo<ThemeContextValue>(
    () => ({ theme, resolvedDark, setTheme, toggleTheme }),
    [theme, resolvedDark, setTheme, toggleTheme]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}
