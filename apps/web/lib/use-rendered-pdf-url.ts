'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@clerk/nextjs';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

/**
 * Fetches a server-flattened PDF (e.g. /documents/:id/rendered.pdf) with the
 * Clerk bearer token, wraps it in an object URL, and returns it for pdf.js.
 * The URL is revoked on cleanup.
 *
 * Set `cacheKey` to a value that changes when the rendering inputs change
 * (formValues, signature count, etc.) to force a refetch.
 */
export function useRenderedPdfUrl(
  documentId: string | null,
  cacheKey: string,
) {
  const { getToken } = useAuth();
  const bypassToken =
    process.env.NEXT_PUBLIC_BYPASS_AUTH === 'true'
      ? (process.env.NEXT_PUBLIC_BYPASS_TOKEN ?? null)
      : null;
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!documentId) {
      setPdfUrl(null);
      return;
    }

    let objectUrl: string | null = null;
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const token = bypassToken ?? (await getToken());
        if (!token) throw new Error('Not authenticated');
        const res = await fetch(
          `${API_URL}/documents/${documentId}/rendered.pdf`,
          {
            headers: { Authorization: `Bearer ${token}` },
            cache: 'no-store',
          },
        );
        if (!res.ok) {
          throw new Error(`Rendered PDF unavailable (${res.status})`);
        }
        const blob = await res.blob();
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setPdfUrl(objectUrl);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to render PDF');
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
  }, [documentId, cacheKey, getToken]);

  return { pdfUrl, loading, error };
}
