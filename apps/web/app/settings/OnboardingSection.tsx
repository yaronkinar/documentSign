'use client';

import { BookOpen } from 'lucide-react';
import Link from 'next/link';
import { motion } from 'motion/react';

import { Button } from '@/components/ui/button';
import { useTranslation } from '@/lib/i18n/LocaleProvider';

export function OnboardingSection() {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-6">
      <div className="flex flex-col gap-1">
        <h2 className="text-base">{t('settings.onboarding.title')}</h2>
        <p className="text-sm text-fg-muted">
          {t('settings.onboarding.description')}
        </p>
      </div>
      <motion.div whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.99 }}>
        <Button variant="outline" asChild>
          <Link href="/onboarding?replay=1">
            <BookOpen className="h-4 w-4" aria-hidden />
            {t('settings.onboarding.viewTour')}
          </Link>
        </Button>
      </motion.div>
    </div>
  );
}
