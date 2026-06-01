'use client';

import Link from 'next/link';

import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { useTranslation } from '@/lib/i18n/LocaleProvider';

export function HomePageContent() {
  const { t } = useTranslation();

  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center gap-6 px-6 py-24 text-center">
      <div className="absolute end-6 top-6">
        <LanguageSwitcher />
      </div>
      <h1 className="text-4xl font-bold tracking-tight">{t('common.appName')}</h1>
      <p className="max-w-md text-lg text-gray-600">{t('home.tagline')}</p>
      <div className="flex gap-3">
        <Link
          href="/demo"
          className="rounded border border-gray-300 px-5 py-2 hover:bg-gray-100"
        >
          {t('home.watchDemo')}
        </Link>
        <Link
          href="/sign-in"
          className="rounded bg-black px-5 py-2 text-white hover:bg-gray-800"
        >
          {t('common.signIn')}
        </Link>
        <Link
          href="/sign-up"
          className="rounded border border-black px-5 py-2 hover:bg-gray-100"
        >
          {t('common.signUp')}
        </Link>
      </div>
    </main>
  );
}
