'use client';

import type { DocumentStatus } from '@docflow/shared';

import { useTranslation } from '@/lib/i18n/LocaleProvider';

const STATUS_COLORS: Record<DocumentStatus, string> = {
  draft: 'bg-gray-200 text-gray-800',
  pending_review: 'bg-yellow-100 text-yellow-800',
  pending_signature: 'bg-blue-100 text-blue-800',
  approved: 'bg-green-100 text-green-800',
  rejected: 'bg-red-100 text-red-800',
  completed: 'bg-teal-100 text-teal-800',
};

export function StatusBadge({ status }: { status: DocumentStatus }) {
  const { t } = useTranslation();

  return (
    <span
      className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[status]}`}
    >
      {t(`status.${status}`)}
    </span>
  );
}
