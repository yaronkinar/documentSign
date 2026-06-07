import { en } from './locales/en';
import { he } from './locales/he';
import type { Locale } from './locale';

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

export function translate(
  locale: Locale,
  key: string,
  values?: InterpolationValues,
): string {
  const dict = dictionaries[locale] as Record<string, unknown>;
  const template = getNestedValue(dict, key);
  return interpolate(template, values);
}
