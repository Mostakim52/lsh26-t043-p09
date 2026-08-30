import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

export type Theme = 'light' | 'dark';

const STORAGE_KEY = 'servicedesk.theme.v1';

function systemPrefersLight(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-color-scheme: light)').matches;
}

function readStored(): Theme | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === 'light' || raw === 'dark') return raw;
  } catch { /* ignore */ }
  return null;
}

function applyTheme(theme: Theme) {
  document.documentElement.setAttribute('data-theme', theme);
  document.documentElement.style.colorScheme = theme;
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch { /* ignore */ }
}

interface ThemeCtx {
  theme: Theme;
  toggle: () => void;
  setTheme: (t: Theme) => void;
}

const Ctx = createContext<ThemeCtx | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(() => {
    const stored = readStored();
    if (stored) return stored;
    return systemPrefersLight() ? 'light' : 'dark';
  });

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  // Keep in sync if user changes OS preference and no explicit choice stored
  useEffect(() => {
    const mql = window.matchMedia('(prefers-color-scheme: light)');
    const handler = () => {
      // Only auto-switch if user hasn't locked a preference
      if (!readStored()) {
        setThemeState(mql.matches ? 'light' : 'dark');
      }
    };
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, []);

  const setTheme = (t: Theme) => setThemeState(t);
  const toggle = () => setThemeState((p) => (p === 'dark' ? 'light' : 'dark'));

  const value = useMemo(() => ({ theme, toggle, setTheme }), [theme]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useTheme(): ThemeCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useTheme must be used inside ThemeProvider');
  return ctx;
}
