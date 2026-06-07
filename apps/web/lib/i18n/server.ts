import 'server-only';

import { cookies, headers } from 'next/headers';

import {
  LOCALE_COOKIE,
  localeFromAcceptLanguage,
  parseLocale,
  type Locale,
} from './locale';
import { translate } from './translate';

export function resolveServerLocale(): Locale {
  const cookieLocale = parseLocale(cookies().get(LOCALE_COOKIE)?.value);
  if (cookieLocale) return cookieLocale;
  return localeFromAcceptLanguage(headers().get('accept-language'));
}

export function serverTranslate(
  key: string,
  locale?: Locale,
  values?: Record<string, string | number>,
): string {
  return translate(locale ?? resolveServerLocale(), key, values);
}
