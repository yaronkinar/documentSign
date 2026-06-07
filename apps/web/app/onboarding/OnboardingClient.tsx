'use client';

import {
  CheckCircle2,
  FileUp,
  LayoutDashboard,
  Play,
  Sparkles,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import type { OnboardingStatus } from '@docflow/shared';

import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { ProductDemoVideo } from '@/components/ProductDemoVideo';
import { Button } from '@/components/ui/button';
import { useApiClient } from '@/lib/api-client';
import { useTranslation } from '@/lib/i18n/LocaleProvider';
import { cn } from '@/lib/utils';

const STEPS: LucideIcon[] = [Sparkles, Play, FileUp, Users, LayoutDashboard];

type StepContent = {
  titleKey: string;
  descriptionKey: string;
  detailKeys: [string, string, string];
  showVideo?: boolean;
};

const STEP_CONTENT: StepContent[] = [
  {
    titleKey: 'onboarding.steps.welcome.title',
    descriptionKey: 'onboarding.steps.welcome.description',
    detailKeys: [
      'onboarding.steps.welcome.detail1',
      'onboarding.steps.welcome.detail2',
      'onboarding.steps.welcome.detail3',
    ],
  },
  {
    titleKey: 'onboarding.steps.demo.title',
    descriptionKey: 'onboarding.steps.demo.description',
    detailKeys: [
      'onboarding.steps.demo.detail1',
      'onboarding.steps.demo.detail2',
      'onboarding.steps.demo.detail3',
    ],
    showVideo: true,
  },
  {
    titleKey: 'onboarding.steps.prepare.title',
    descriptionKey: 'onboarding.steps.prepare.description',
    detailKeys: [
      'onboarding.steps.prepare.detail1',
      'onboarding.steps.prepare.detail2',
      'onboarding.steps.prepare.detail3',
    ],
  },
  {
    titleKey: 'onboarding.steps.signers.title',
    descriptionKey: 'onboarding.steps.signers.description',
    detailKeys: [
      'onboarding.steps.signers.detail1',
      'onboarding.steps.signers.detail2',
      'onboarding.steps.signers.detail3',
    ],
  },
  {
    titleKey: 'onboarding.steps.track.title',
    descriptionKey: 'onboarding.steps.track.description',
    detailKeys: [
      'onboarding.steps.track.detail1',
      'onboarding.steps.track.detail2',
      'onboarding.steps.track.detail3',
    ],
  },
];

export function OnboardingClient({
  replay,
  initialStatus,
}: {
  replay: boolean;
  initialStatus: OnboardingStatus;
}) {
  const { t, locale } = useTranslation();
  const router = useRouter();
  const api = useApiClient();
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    document.title = replay
      ? t('onboarding.meta.replayTitle')
      : t('onboarding.meta.title');
  }, [replay, t, locale]);

  useEffect(() => {
    document.querySelectorAll('video').forEach((video) => {
      video.pause();
    });
  }, [step]);

  const isLastStep = step === STEP_CONTENT.length - 1;
  const StepIcon = STEPS[step];
  const content = STEP_CONTENT[step];

  async function persistStatus(status: 'completed' | 'skipped') {
    if (replay || initialStatus !== 'pending') return;
    await api.patch('/users/me/onboarding', { status });
  }

  async function finish(status: 'completed' | 'skipped') {
    setBusy(true);
    try {
      await persistStatus(status);
      router.push('/dashboard');
    } catch {
      router.push('/dashboard');
    } finally {
      setBusy(false);
    }
  }

  function exitReplay() {
    router.push(replay ? '/settings' : '/dashboard');
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-background px-4 py-16">
      <div className="absolute end-6 top-6">
        <LanguageSwitcher />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: 'easeOut' }}
        className={cn('w-full', content.showVideo ? 'max-w-2xl' : 'max-w-lg')}
      >
        <div className="mb-8 flex flex-col items-center gap-2 text-center">
          <p className="text-sm font-medium tracking-[0.14em] text-fg-muted">
            {replay ? t('onboarding.replayLabel') : t('onboarding.label')}
          </p>
          <div className="flex items-center gap-2">
            {STEP_CONTENT.map((_, index) => (
              <span
                key={index}
                className={cn(
                  'h-2 rounded-full transition-all duration-300',
                  index === step
                    ? 'w-8 bg-primary'
                    : index < step
                      ? 'w-2 bg-primary/50'
                      : 'w-2 bg-border',
                )}
                aria-hidden
              />
            ))}
          </div>
          <p className="text-xs text-fg-muted">
            {t('onboarding.stepCounter', {
              current: step + 1,
              total: STEP_CONTENT.length,
            })}
          </p>
        </div>

        <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-sm">
          <AnimatePresence mode="wait">
            <motion.div
              key={`${step}-${locale}`}
              initial={{ opacity: 0, x: 16 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -16 }}
              transition={{ duration: 0.22, ease: 'easeOut' }}
              className="flex flex-col gap-6 p-8"
            >
              <div className="flex flex-col items-center gap-4 text-center">
                <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                  <StepIcon className="h-8 w-8" aria-hidden />
                </div>
                <div className="space-y-2">
                  <h1 className="text-2xl font-semibold tracking-tight">
                    {t(content.titleKey)}
                  </h1>
                  <p className="text-sm leading-relaxed text-fg-muted">
                    {t(content.descriptionKey)}
                  </p>
                </div>
              </div>

              {content.showVideo ? <ProductDemoVideo /> : null}

              <ul className="flex flex-col gap-3">
                {content.detailKeys.map((key) => (
                  <li
                    key={key}
                    className="flex items-start gap-3 rounded-lg border border-border/70 bg-background px-4 py-3 text-sm"
                  >
                    <CheckCircle2
                      className="mt-0.5 h-4 w-4 shrink-0 text-primary"
                      aria-hidden
                    />
                    <span>{t(key)}</span>
                  </li>
                ))}
              </ul>
            </motion.div>
          </AnimatePresence>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border bg-background/60 px-6 py-4">
            <Button
              type="button"
              variant="ghost"
              disabled={busy || step === 0}
              onClick={() => setStep((s) => Math.max(0, s - 1))}
            >
              {t('common.back')}
            </Button>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => (replay ? exitReplay() : finish('skipped'))}
              >
                {replay ? t('onboarding.close') : t('onboarding.skipForNow')}
              </Button>

              {isLastStep ? (
                <Button
                  type="button"
                  disabled={busy}
                  onClick={() => (replay ? exitReplay() : finish('completed'))}
                >
                  {replay ? t('onboarding.doneReplay') : t('onboarding.getStarted')}
                </Button>
              ) : (
                <Button
                  type="button"
                  disabled={busy}
                  onClick={() => setStep((s) => s + 1)}
                >
                  {t('common.next')}
                </Button>
              )}
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
