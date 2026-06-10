'use client';

import { useEffect, useRef, useState } from 'react';
import { useAuth } from '@clerk/nextjs';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

/**
 * Fetches the raw uploaded PDF (/documents/:id/source.pdf) with auth and
 * exposes a blob URL for pdf.js. Avoids CORS issues with presigned storage URLs.
 */
export function useDocumentPdfUrl(documentId: string | null) {
  const { getToken } = useAuth();
  const getTokenRef = useRef(getToken);
  getTokenRef.current = getToken;

  const bypassToken =
    process.env.NEXT_PUBLIC_BYPASS_AUTH === 'true'
      ? (process.env.NEXT_PUBLIC_BYPASS_TOKEN ?? null)
      : null;
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!documentId) {
      setPdfUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
      setError(null);
      setLoading(false);
      return;
    }

    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const token = bypassToken ?? (await getTokenRef.current());
        if (!token) throw new Error('Not authenticated');
        const res = await fetch(`${API_URL}/documents/${documentId}/source.pdf`, {
          headers: { Authorization: `Bearer ${token}` },
          cache: 'no-store',
        });
        if (!res.ok) {
          throw new Error(`PDF unavailable (${res.status})`);
        }
        const blob = await res.blob();
        if (blob.size === 0) throw new Error('PDF file is empty');
        if (cancelled) return;
        const objectUrl = URL.createObjectURL(blob);
        setPdfUrl((prev) => {
          if (prev) URL.revokeObjectURL(prev);
          return objectUrl;
        });
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load PDF');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [documentId, bypassToken]);

  // Revoke blob when switching documents or unmounting (not on every re-render).
  useEffect(() => {
    return () => {
      setPdfUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
    };
  }, [documentId]);

  return { pdfUrl, loading, error };
}
