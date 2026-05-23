'use client';

import { useTranslation } from '@/lib/i18n/LocaleProvider';
import type { Locale } from '@/lib/i18n/types';

const options: { value: Locale; labelKey: 'common.english' | 'common.hebrew' }[] = [
  { value: 'en', labelKey: 'common.english' },
  { value: 'he', labelKey: 'common.hebrew' },
];

export function LanguageSwitcher({ className = '' }: { className?: string }) {
  const { locale, setLocale, t } = useTranslation();

  return (
    <div className={`flex items-center gap-1 ${className}`}>
      {options.map(({ value, labelKey }, index) => (
        <span key={value} className="flex items-center gap-1">
          {index > 0 && <span className="text-gray-300">|</span>}
          <button
            type="button"
            onClick={() => setLocale(value)}
            className={`rounded px-2 py-0.5 text-sm transition-colors ${
              locale === value
                ? 'font-semibold text-black'
                : 'text-gray-500 hover:text-black'
            }`}
            aria-current={locale === value ? 'true' : undefined}
          >
            {t(labelKey)}
          </button>
        </span>
      ))}
    </div>
  );
}
