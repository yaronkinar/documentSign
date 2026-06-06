export type Locale = 'en' | 'he';

export const LOCALE_STORAGE_KEY = 'docflow-locale';
export const LOCALE_COOKIE = 'docflow-locale';

export function parseLocale(value: string | null | undefined): Locale | null {
  if (value === 'en' || value === 'he') return value;
  return null;
}

export function localeFromAcceptLanguage(header: string | null | undefined): Locale {
  if (!header) return 'en';
  const languages = header
    .split(',')
    .map((part) => part.split(';')[0]?.trim().toLowerCase())
    .filter(Boolean);

  for (const language of languages) {
    if (language.startsWith('he')) return 'he';
    if (language.startsWith('en')) return 'en';
  }

  return 'en';
}

export function localeDirection(locale: Locale): 'ltr' | 'rtl' {
  return locale === 'he' ? 'rtl' : 'ltr';
}

export function persistLocale(locale: Locale): void {
  window.localStorage.setItem(LOCALE_STORAGE_KEY, locale);
  document.cookie = `${LOCALE_COOKIE}=${locale};path=/;max-age=31536000;samesite=lax`;
}

/** Inline script: apply saved locale before React paints (localStorage wins over SSR). */
export const LOCALE_BOOTSTRAP_SCRIPT = `(function(){try{var k='${LOCALE_STORAGE_KEY}',c='${LOCALE_COOKIE}',s=localStorage.getItem(k);if(s!=='en'&&s!=='he')return;var el=document.documentElement;el.lang=s;el.dir=s==='he'?'rtl':'ltr';document.cookie=c+'='+s+';path=/;max-age=31536000;samesite=lax'}catch(e){}})();`;
