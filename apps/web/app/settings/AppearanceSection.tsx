'use client';

import { ThemePicker } from '@/components/ThemePicker';
import { useTranslation } from '@/lib/i18n/LocaleProvider';

export function AppearanceSection() {
  const { t } = useTranslation();

  return (
    <section className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl">{t('settings.title')}</h1>
      </header>

      <div className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-6">
        <div className="flex flex-col gap-1">
          <h2 className="text-base">{t('settings.appearance.title')}</h2>
          <p className="text-sm text-fg-muted">
            {t('settings.appearance.description')}
          </p>
        </div>
        <ThemePicker />
      </div>
    </section>
  );
}
