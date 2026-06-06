export type Theme = 'humane' | 'classic' | 'modern';

export const THEMES: readonly Theme[] = ['humane', 'classic', 'modern'] as const;
export const DEFAULT_THEME: Theme = 'humane';

export const THEME_STORAGE_KEY = 'docflow-theme';
export const THEME_COOKIE = 'docflow-theme';
export const THEME_CLASS_PREFIX = 'theme-';

export function parseTheme(value: string | null | undefined): Theme | null {
  if (value === 'humane' || value === 'classic' || value === 'modern') return value;
  return null;
}

export function themeClass(theme: Theme): string {
  return `${THEME_CLASS_PREFIX}${theme}`;
}

export function persistTheme(theme: Theme): void {
  window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  document.cookie = `${THEME_COOKIE}=${theme};path=/;max-age=31536000;samesite=lax`;
}

/**
 * Inline script: apply saved theme class before React paints (localStorage
 * wins over the SSR default). Runs synchronously in <head> to prevent flash
 * of the wrong theme on first paint. Also writes the cookie so the server
 * can read the device theme on the next request. Mirrors LOCALE_BOOTSTRAP_SCRIPT.
 */
export const THEME_BOOTSTRAP_SCRIPT = `(function(){try{var k='${THEME_STORAGE_KEY}',c='${THEME_COOKIE}',s=localStorage.getItem(k);if(s!=='humane'&&s!=='classic'&&s!=='modern')return;var el=document.documentElement;el.classList.remove('${THEME_CLASS_PREFIX}humane','${THEME_CLASS_PREFIX}classic','${THEME_CLASS_PREFIX}modern');el.classList.add('${THEME_CLASS_PREFIX}'+s);document.cookie=c+'='+s+';path=/;max-age=31536000;samesite=lax'}catch(e){}})();`;
