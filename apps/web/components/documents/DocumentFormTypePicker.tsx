'use client';

import { FORM_TEMPLATE_CATALOG } from '@docflow/shared';
import { useTranslation } from '@/lib/i18n/LocaleProvider';

interface Props {
  hasUploadedPdf: boolean;
  busy: boolean;
  onSelect: (formTemplateId: string) => void;
  onExtractFromPdf?: () => void;
}

export function DocumentFormTypePicker({
  hasUploadedPdf,
  busy,
  onSelect,
  onExtractFromPdf,
}: Props) {
  const { t, locale } = useTranslation();
  const label = (entry: (typeof FORM_TEMPLATE_CATALOG)[number]) =>
    locale === 'he' ? entry.labelHe : entry.labelEn;

  const available = FORM_TEMPLATE_CATALOG.filter(
    (entry) => !hasUploadedPdf || entry.supportsUploadedPdf,
  );

  return (
    <div className="space-y-3 rounded-lg border border-border bg-surface-muted p-4 text-sm">
      <p className="font-medium text-fg">{t('document.selectFormTypeTitle')}</p>
      <p className="text-xs text-fg-muted">{t('document.selectFormTypeHint')}</p>
      <div className="flex flex-wrap gap-2">
        {available.map((entry) => (
          <button
            key={entry.id}
            type="button"
            disabled={busy}
            onClick={() => onSelect(entry.id)}
            className="rounded-md border border-input bg-background px-3 py-2 text-sm font-medium text-fg hover:bg-surface disabled:opacity-50"
          >
            {label(entry)}
          </button>
        ))}
        {hasUploadedPdf && onExtractFromPdf && (
          <button
            type="button"
            disabled={busy}
            onClick={onExtractFromPdf}
            className="rounded-md border border-dashed border-input bg-background px-3 py-2 text-sm text-fg-muted hover:bg-surface hover:text-fg disabled:opacity-50"
          >
            {t('document.extractFormFromPdf')}
          </button>
        )}
      </div>
    </div>
  );
}
