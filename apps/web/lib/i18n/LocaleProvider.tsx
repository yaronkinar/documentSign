'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useSyncExternalStore,
} from 'react';

import { en } from './locales/en';
import { he } from './locales/he';
import {
  LOCALE_STORAGE_KEY,
  parseLocale,
  persistLocale,
  type Locale,
} from './locale';

const LOCALE_CHANGE_EVENT = 'docflow-locale-change';
const dictionaries = { en, he } as const;

type InterpolationValues = Record<string, string | number>;

function getNestedValue(obj: Record<string, unknown>, path: string): string {
  const value = path.split('.').reduce<unknown>((acc, key) => {
    if (acc && typeof acc === 'object' && key in acc) {
      return (acc as Record<string, unknown>)[key];
    }
    return undefined;
  }, obj);
  return typeof value === 'string' ? value : path;
}

function interpolate(template: string, values?: InterpolationValues): string {
  if (!values) return template;
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) =>
    values[key] !== undefined ? String(values[key]) : `{{${key}}}`,
  );
}

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
  const locale = useSyncExternalStore(
    subscribeToLocale,
    () => readClientLocale(initialLocale),
    () => initialLocale,
  );

  const setLocale = useCallback((next: Locale) => {
    persistLocale(next);
    window.dispatchEvent(new Event(LOCALE_CHANGE_EVENT));
  }, []);

  const dir: 'ltr' | 'rtl' = locale === 'he' ? 'rtl' : 'ltr';

  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = dir;
  }, [locale, dir]);

  const t = useCallback(
    (key: string, values?: InterpolationValues) => {
      const dict = dictionaries[locale] as Record<string, unknown>;
      const template = getNestedValue(dict, key);
      return interpolate(template, values);
    },
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
