'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from 'react';

import {
  LOCALE_STORAGE_KEY,
  parseLocale,
  persistLocale,
  type Locale,
} from './locale';
import { translate } from './translate';

const LOCALE_CHANGE_EVENT = 'docflow-locale-change';

type InterpolationValues = Record<string, string | number>;

interface LocaleContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: string, values?: InterpolationValues) => string;
  dir: 'ltr' | 'rtl';
}

const LocaleContext = createContext<LocaleContextValue | null>(null);

function subscribeToLocale(onStoreChange: () => void) {
  const onStorage = (event: StorageEvent) => {
    if (event.key === LOCALE_STORAGE_KEY) onStoreChange();
  };
  window.addEventListener('storage', onStorage);
  window.addEventListener(LOCALE_CHANGE_EVENT, onStoreChange);
  return () => {
    window.removeEventListener('storage', onStorage);
    window.removeEventListener(LOCALE_CHANGE_EVENT, onStoreChange);
  };
}

function readClientLocale(fallback: Locale): Locale {
  return parseLocale(window.localStorage.getItem(LOCALE_STORAGE_KEY)) ?? fallback;
}

export function LocaleProvider({
  children,
  initialLocale,
}: {
  children: React.ReactNode;
  initialLocale: Locale;
}) {
  const [mounted, setMounted] = useState(false);
  const storedLocale = useSyncExternalStore(
    subscribeToLocale,
    () => readClientLocale(initialLocale),
    () => initialLocale,
  );

  // Match SSR on the first client render, then apply saved locale after mount.
  const locale = mounted ? storedLocale : initialLocale;

  const setLocale = useCallback((next: Locale) => {
    persistLocale(next);
    window.dispatchEvent(new Event(LOCALE_CHANGE_EVENT));
  }, []);

  const dir: 'ltr' | 'rtl' = locale === 'he' ? 'rtl' : 'ltr';

  useEffect(() => {
    const saved = parseLocale(window.localStorage.getItem(LOCALE_STORAGE_KEY));
    if (saved) persistLocale(saved);
    setMounted(true);
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = dir;
  }, [locale, dir]);

  const t = useCallback(
    (key: string, values?: InterpolationValues) => translate(locale, key, values),
    [locale],
  );

  const value = useMemo(
    () => ({ locale, setLocale, t, dir }),
    [locale, setLocale, t, dir],
  );

  return (
    <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>
  );
}

export function useTranslation() {
  const ctx = useContext(LocaleContext);
  if (!ctx) {
    throw new Error('useTranslation must be used within LocaleProvider');
  }
  return ctx;
}

export function useDateLocale() {
  const { locale } = useTranslation();
  return locale === 'he' ? 'he-IL' : 'en-US';
}
