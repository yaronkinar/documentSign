'use client';

import { HAKNASOT_FORM_TEMPLATE_ID, type DocumentDto } from '@docflow/shared';
import Link from 'next/link';

import { PDFViewer } from '@/components/pdf/PDFViewer';
import { PdfLoadingSkeleton } from '@/components/pdf/PdfLoadingSkeleton';
import { Button } from '@/components/ui/button';
import { useTranslation } from '@/lib/i18n/LocaleProvider';
import { useRenderedPdfUrl } from '@/lib/use-rendered-pdf-url';

export function canPreviewDocumentPdf(doc: DocumentDto): boolean {
  return (
    !!(doc.hasPdfFile ?? doc.fileUrl) ||
    doc.formTemplateId === HAKNASOT_FORM_TEMPLATE_ID
  );
}

export function DashboardDocumentPreview({ doc }: { doc: DocumentDto }) {
  const { t } = useTranslation();
  const canPreview = canPreviewDocumentPdf(doc);
  const cacheKey = `${doc.updatedAt}:${doc.status}`;
  const { pdfUrl, loading, error } = useRenderedPdfUrl(
    canPreview ? doc._id : null,
    cacheKey,
  );

  return (
    <div className="flex h-full min-h-0 flex-col rounded-lg border border-border bg-surface">
      <div className="flex shrink-0 items-start justify-between gap-3 border-b border-border px-4 py-3">
        <div className="min-w-0">
          <h2 className="truncate text-sm font-medium text-fg">{doc.title}</h2>
          <p className="text-xs text-fg-muted">{t('dashboard.pdfPreview')}</p>
        </div>
        <Button asChild size="sm" variant="outline">
          <Link href={`/documents/${doc._id}`}>{t('dashboard.openDocument')}</Link>
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-auto p-3">
        {!canPreview ? (
          <p className="py-12 text-center text-sm text-fg-muted">
            {t('dashboard.noPdfPreview')}
          </p>
        ) : loading ? (
          <PdfLoadingSkeleton />
        ) : error ? (
          <p className="py-12 text-center text-sm text-danger">{error}</p>
        ) : pdfUrl ? (
          <PDFViewer pdfUrl={pdfUrl} signatureTagHitTargetsOnly />
        ) : null}
      </div>
    </div>
  );
}
