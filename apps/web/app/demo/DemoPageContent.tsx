'use client';

import Link from 'next/link';

import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { useTranslation } from '@/lib/i18n/LocaleProvider';

const DEMO_VIDEO_SRC = '/videos/product-demo.mp4';

export function DemoPageContent() {
  const { t } = useTranslation();

  return (
    <main className="relative flex min-h-screen flex-col items-center px-6 py-16">
      <div className="absolute end-6 top-6">
        <LanguageSwitcher />
      </div>

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

        <div className="w-full overflow-hidden rounded-2xl border border-gray-200 bg-black shadow-2xl">
          <video
            aria-label={t('demo.videoLabel')}
            className="aspect-video w-full"
            controls
            playsInline
            preload="metadata"
          >
            <source src={DEMO_VIDEO_SRC} type="video/mp4" />
            {t('demo.fallback')}
          </video>
        </div>

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
