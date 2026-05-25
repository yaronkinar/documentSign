'use client';

import { useEffect, useState } from 'react';
import { HAKNASOT_FORM_TEMPLATE_ID, HEBREW_SAMPLE_PDF_FILENAME } from '@docflow/shared';

const TEMPLATE_PDF_URLS: Record<string, string> = {
  [HAKNASOT_FORM_TEMPLATE_ID]: `/samples/${HEBREW_SAMPLE_PDF_FILENAME}`,
};

/** Object URL for a template-backed PDF (no uploaded file). */
export function useTemplatePdfUrl(formTemplateId: string | null | undefined) {
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!formTemplateId) {
      setPdfUrl(null);
      return;
    }

    const staticUrl = TEMPLATE_PDF_URLS[formTemplateId];
    if (!staticUrl) {
      setError(`Unknown form template: ${formTemplateId}`);
      setPdfUrl(null);
      return;
    }

    let objectUrl: string | null = null;
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(staticUrl);
        if (!res.ok) {
          throw new Error(`Template PDF not found (${res.status})`);
        }
        const blob = await res.blob();
        if (blob.size === 0) {
          throw new Error('Template PDF is empty. Regenerate the sample PDF.');
        }
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setPdfUrl(objectUrl);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load template PDF');
          setPdfUrl(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [formTemplateId]);

  return { pdfUrl, loading, error };
}
