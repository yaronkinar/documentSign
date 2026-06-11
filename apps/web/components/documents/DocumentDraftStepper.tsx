'use client';

import { useTranslation } from '@/lib/i18n/LocaleProvider';
import { cn } from '@/lib/utils';

export type DraftSetupStep =
  | 'workflow'
  | 'map'
  | 'form-setup'
  | 'form-fill'
  | 'send';

interface Props {
  current: DraftSetupStep;
  hasWorkflow: boolean;
  signersMapped: boolean;
  hasFormFields: boolean;
  formFilled: boolean;
}

const STEPS: DraftSetupStep[] = [
  'form-setup',
  'form-fill',
  'workflow',
  'map',
  'send',
];

export function DocumentDraftStepper({
  current,
  hasWorkflow,
  signersMapped,
  hasFormFields,
  formFilled,
}: Props) {
  const { t } = useTranslation();

  const labels: Record<DraftSetupStep, string> = {
    workflow: t('document.draftStepWorkflow'),
    map: t('document.draftStepMapSigners'),
    'form-setup': t('document.draftStepFormSetup'),
    'form-fill': t('document.draftStepFormFill'),
    send: t('document.draftStepSend'),
  };

  function stepDone(step: DraftSetupStep): boolean {
    switch (step) {
      case 'form-setup':
        return hasFormFields || hasWorkflow;
      case 'form-fill':
        return formFilled || !hasFormFields || hasWorkflow;
      case 'workflow':
        return hasWorkflow;
      case 'map':
        return signersMapped;
      case 'send':
        return false;
      default:
        return false;
    }
  }

  const currentIndex = STEPS.indexOf(current);

  return (
    <ol className="flex flex-wrap items-center gap-2 border-b border-border bg-surface-muted px-4 py-3 text-xs">
      {STEPS.map((step, index) => {
        const active = step === current;
        const complete =
          index < currentIndex || (index === currentIndex && stepDone(step));
        return (
          <li key={step} className="flex items-center gap-2">
            <span
              className={cn(
                'flex h-6 w-6 items-center justify-center rounded-full text-center leading-6',
                complete
                  ? 'bg-success text-accent-fg'
                  : active
                    ? 'bg-fg text-accent-fg'
                    : 'bg-muted text-fg-muted',
              )}
            >
              {complete && !active ? '✓' : index + 1}
            </span>
            <span
              className={cn(active ? 'font-medium text-fg' : 'text-fg-muted')}
            >
              {labels[step]}
            </span>
            {index < STEPS.length - 1 && (
              <span className="mx-1 text-fg-muted rtl-flip">›</span>
            )}
          </li>
        );
      })}
    </ol>
  );
}
