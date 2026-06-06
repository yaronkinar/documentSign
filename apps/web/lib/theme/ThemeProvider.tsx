'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useSyncExternalStore,
} from 'react';

import {
  DEFAULT_THEME,
  THEME_CLASS_PREFIX,
  THEME_STORAGE_KEY,
  parseTheme,
  persistTheme,
  themeClass,
  type Theme,
} from './theme';

const THEME_CHANGE_EVENT = 'docflow-theme-change';

interface ThemeContextValue {
  theme: Theme;
  setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function subscribeToTheme(onStoreChange: () => void) {
  const onStorage = (event: StorageEvent) => {
    if (event.key === THEME_STORAGE_KEY) onStoreChange();
  };
  window.addEventListener('storage', onStorage);
  window.addEventListener(THEME_CHANGE_EVENT, onStoreChange);
  return () => {
    window.removeEventListener('storage', onStorage);
    window.removeEventListener(THEME_CHANGE_EVENT, onStoreChange);
  };
}

function readClientTheme(fallback: Theme): Theme {
  return parseTheme(window.localStorage.getItem(THEME_STORAGE_KEY)) ?? fallback;
}

export function ThemeProvider({
  children,
  initialTheme = DEFAULT_THEME,
}: {
  children: React.ReactNode;
  initialTheme?: Theme;
}) {
  const theme = useSyncExternalStore(
    subscribeToTheme,
    () => readClientTheme(initialTheme),
    () => initialTheme,
  );

  const setTheme = useCallback((next: Theme) => {
    persistTheme(next);
    window.dispatchEvent(new Event(THEME_CHANGE_EVENT));
  }, []);

  useEffect(() => {
    const el = document.documentElement;
    el.classList.remove(
      `${THEME_CLASS_PREFIX}humane`,
      `${THEME_CLASS_PREFIX}classic`,
      `${THEME_CLASS_PREFIX}modern`,
    );
    el.classList.add(themeClass(theme));
  }, [theme]);

  const value = useMemo(() => ({ theme, setTheme }), [theme, setTheme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error('useTheme must be used within ThemeProvider');
  }
  return ctx;
}
