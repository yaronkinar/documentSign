'use client';

import Link from 'next/link';

import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { useTranslation } from '@/lib/i18n/LocaleProvider';

export function GuestSignErrorScreen({
  titleKey,
  bodyKey,
  bodyValues,
}: {
  titleKey: string;
  bodyKey: string;
  bodyValues?: Record<string, string | number>;
}) {
  const { t } = useTranslation();

  return (
    <main className="flex min-h-screen items-center justify-center px-6">
      <div className="max-w-md text-center">
        <div className="mb-6 flex justify-center">
          <LanguageSwitcher />
        </div>
        <h1 className="mb-3 text-2xl font-semibold">{t(titleKey)}</h1>
        <p className="mb-6 text-gray-600">{t(bodyKey, bodyValues)}</p>
        <Link href="/" className="text-sm text-blue-600 hover:underline">
          {t('sign.backToHome')}
        </Link>
      </div>
    </main>
  );
}
