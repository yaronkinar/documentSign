'use client';

import { useEffect, useState } from 'react';
import { HAKNASOT_FORM_TEMPLATE_ID } from '@docflow/shared';

/** API route avoids .pdf URLs that download managers intercept during fetch(). */
const TEMPLATE_PDF_URLS: Record<string, string> = {
  [HAKNASOT_FORM_TEMPLATE_ID]: `/api/template-pdf/${HAKNASOT_FORM_TEMPLATE_ID}`,
};

function base64ToBlob(base64: string, mimeType: string) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Blob([bytes], { type: mimeType });
}

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
        const res = await fetch(staticUrl, {
          headers: { Accept: 'application/json' },
        });
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as {
            error?: string;
          } | null;
          throw new Error(
            body?.error ?? `Template PDF not found (${res.status})`,
          );
        }

        const payload = (await res.json()) as {
          mimeType?: string;
          data?: string;
        };
        if (!payload.data) {
          throw new Error('Template PDF response is missing data');
        }

        const blob = base64ToBlob(
          payload.data,
          payload.mimeType ?? 'application/pdf',
        );
        if (blob.size === 0) {
          throw new Error(
            'Template PDF failed to load. Run: npm run generate:haknasot-pdf',
          );
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
