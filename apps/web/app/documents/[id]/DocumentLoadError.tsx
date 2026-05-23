'use client';

import Link from 'next/link';

import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { useTranslation } from '@/lib/i18n/LocaleProvider';

export function DocumentLoadError({ message }: { message: string }) {
  const { t } = useTranslation();
  const displayMessage =
    message === 'Failed to load document'
      ? t('document.loadFailedGeneric')
      : message;

  return (
    <main className="mx-auto max-w-lg px-6 py-16 text-center">
      <div className="mb-6 flex justify-end">
        <LanguageSwitcher />
      </div>
      <h1 className="mb-2 text-xl font-semibold">{t('document.loadFailedTitle')}</h1>
      <p className="mb-6 text-sm text-gray-600">{displayMessage}</p>
      <p className="text-xs text-gray-500">{t('document.loadFailedHint')}</p>
    </main>
  );
}
