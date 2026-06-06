'use client';

import type { DocumentStatus } from '@docflow/shared';

import { Badge, type BadgeProps } from '@/components/ui/badge';
import { useTranslation } from '@/lib/i18n/LocaleProvider';
import { cn } from '@/lib/utils';

const STATUS_VARIANT: Record<DocumentStatus, BadgeProps['variant']> = {
  draft: 'secondary',
  pending_review: 'secondary',
  pending_signature: 'default',
  approved: 'default',
  rejected: 'destructive',
  completed: 'default',
};

const STATUS_OVERRIDE: Record<DocumentStatus, string> = {
  draft: 'bg-surface-muted text-fg-muted border-border',
  pending_review: 'bg-pill-bg text-pill-fg border-transparent',
  pending_signature: 'bg-surface-muted text-info border-info',
  approved: 'bg-surface-muted text-success border-success',
  rejected: '', // uses default destructive variant
  completed: 'bg-surface-muted text-success border-success',
};

export function StatusBadge({ status }: { status: DocumentStatus }) {
  const { t } = useTranslation();
  return (
    <Badge
      variant={STATUS_VARIANT[status]}
      className={cn(STATUS_OVERRIDE[status])}
    >
      {t(`status.${status}`)}
    </Badge>
  );
}
