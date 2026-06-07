'use client';

import Link from 'next/link';

import { PageLanguageSwitcher } from '@/components/PageLanguageSwitcher';
import { ProductDemoVideo } from '@/components/ProductDemoVideo';
import { useTranslation } from '@/lib/i18n/LocaleProvider';

export function DemoPageContent() {
  const { t } = useTranslation();

  return (
    <main className="relative flex min-h-screen flex-col items-center px-6 py-16">
      <PageLanguageSwitcher />
      <section className="flex w-full max-w-5xl flex-1 flex-col items-center justify-center gap-8 text-center">
        <div className="space-y-4">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-gray-500">
            {t('common.appName')}
          </p>
          <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
            {t('demo.title')}
          </h1>
          <p className="mx-auto max-w-2xl text-lg text-gray-600">
            {t('demo.subtitle')}
          </p>
        </div>

        <ProductDemoVideo className="w-full shadow-2xl" />

        <Link
          href="/"
          className="rounded border border-black px-5 py-2 font-medium hover:bg-gray-100"
        >
          {t('demo.backHome')}
        </Link>
      </section>
    </main>
  );
}
