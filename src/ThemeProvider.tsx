import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { Monitor, Moon, Sun } from 'lucide-react';

export type Theme = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';
type ThemeContextValue = { theme: Theme; resolvedTheme: ResolvedTheme; setTheme: (theme: Theme) => void };
const STORAGE_KEY = 'anatomy-studio-theme';
const ThemeContext = createContext<ThemeContextValue | null>(null);
const isTheme = (value: unknown): value is Theme => value === 'light' || value === 'dark' || value === 'system';
const readTheme = (): Theme => {
  try { const saved = localStorage.getItem(STORAGE_KEY); return isTheme(saved) ? saved : 'system'; }
  catch { return 'system'; }
};
const readSystem = (): ResolvedTheme => typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeValue] = useState<Theme>(readTheme);
  const [systemTheme, setSystemTheme] = useState<ResolvedTheme>(readSystem);
  const resolvedTheme = theme === 'system' ? systemTheme : theme;
  const setTheme = useCallback((value: Theme) => {
    if (!isTheme(value)) return;
    setThemeValue(value);
    try { localStorage.setItem(STORAGE_KEY, value); } catch { /* Private browsing can make storage unavailable. */ }
  }, []);
  useLayoutEffect(() => {
    document.documentElement.dataset.theme = resolvedTheme;
    document.documentElement.style.colorScheme = resolvedTheme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', resolvedTheme === 'dark' ? '#101b1b' : '#f4f3ee');
  }, [resolvedTheme]);
  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => setSystemTheme(media.matches ? 'dark' : 'light');
    onChange();
    media.addEventListener('change', onChange);
    const onStorage = (event: StorageEvent) => {
      if (event.key === STORAGE_KEY || event.key === null) setThemeValue(isTheme(event.newValue) ? event.newValue : 'system');
    };
    window.addEventListener('storage', onStorage);
    return () => { media.removeEventListener('change', onChange); window.removeEventListener('storage', onStorage); };
  }, []);
  const value = useMemo(() => ({ theme, resolvedTheme, setTheme }), [theme, resolvedTheme, setTheme]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const value = useContext(ThemeContext);
  if (!value) throw new Error('useTheme must be used within ThemeProvider.');
  return value;
}

/** A predictable three-state control: system → light → dark → system. */
export function ThemeToggle({ className = '', compact = false }: { className?: string; compact?: boolean }) {
  const { theme, resolvedTheme, setTheme } = useTheme();
  const nextTheme: Theme = theme === 'system' ? 'light' : theme === 'light' ? 'dark' : 'system';
  const label = theme === 'system' ? 'System' : theme === 'light' ? 'Light' : 'Dark';
  const Icon = theme === 'system' ? Monitor : theme === 'light' ? Sun : Moon;
  return <button type="button" className={`theme-toggle ${compact ? 'theme-toggle-compact' : ''} ${className}`.trim()}
    onClick={() => setTheme(nextTheme)} aria-label={`Theme: ${label}${theme === 'system' ? ` (${resolvedTheme})` : ''}. Switch to ${nextTheme} theme.`}
    title={`${label} theme · switch to ${nextTheme}`}>
    <Icon size={18} aria-hidden="true" /><span>{label}</span>
  </button>;
}
