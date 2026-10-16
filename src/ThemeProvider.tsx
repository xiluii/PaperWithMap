import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';

export type ThemePreference = 'light' | 'dark' | 'system';
type Theme = 'light' | 'dark';
const storageKey = 'paperly:theme';
function readPreference(): ThemePreference {
  try { const value = localStorage.getItem(storageKey); if (value === 'light' || value === 'dark') return value; } catch { /* Preferences are optional. */ }
  return 'system';
}
const ThemeContext = createContext<{ preference: ThemePreference; theme: Theme; setPreference: (value: ThemePreference) => void } | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreference] = useState<ThemePreference>(readPreference);
  const [systemDark, setSystemDark] = useState(() => window.matchMedia('(prefers-color-scheme: dark)').matches);
  const theme = preference === 'system' ? systemDark ? 'dark' : 'light' : preference;
  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const changed = () => setSystemDark(media.matches);
    changed(); media.addEventListener('change', changed);
    const synced = (event: StorageEvent) => { if (event.key === storageKey || event.key === null) setPreference(readPreference()); };
    window.addEventListener('storage', synced);
    return () => { media.removeEventListener('change', changed); window.removeEventListener('storage', synced); };
  }, []);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#101923' : '#edf2f6');
    try { localStorage.setItem(storageKey, preference); } catch { /* Switching still works without storage. */ }
  }, [preference, theme]);
  const value = useMemo(() => ({ preference, theme, setPreference }), [preference, theme]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('ThemeProvider is required');
  return context;
}
