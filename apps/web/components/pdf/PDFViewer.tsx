'use client';

import { useEffect, useRef, useState } from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import type { CommentDto, PdfFormFieldTemplate, SignatureDto, SignatureFieldDto } from '@docflow/shared';

import { useTranslation } from '@/lib/i18n/LocaleProvider';

export interface PDFViewerProps {
  pdfUrl: string;
  signatures?: SignatureDto[];
  signatureFields?: SignatureFieldDto[];
  comments?: CommentDto[];
  placementMode?: boolean;
  fieldPlacementMode?: boolean;
  commentMode?: boolean;
  /** When set, only this signer's unsigned fields are clickable. */
  activeSignerId?: string | null;
  onSignaturePlace?: (page: number, xPct: number, yPct: number) => void;
  onFieldPlace?: (page: number, xPct: number, yPct: number) => void;
  onFieldClick?: (field: SignatureFieldDto) => void;
  onCommentPin?: (page: number, xPct: number, yPct: number) => void;
  formFields?: PdfFormFieldTemplate[];
  formValues?: Record<string, string>;
  activeFormFieldId?: string | null;
}

let pdfjsPromise: Promise<typeof import('pdfjs-dist')> | null = null;

function loadPdfJs() {
  if (!pdfjsPromise) {
    pdfjsPromise = import('pdfjs-dist').then((lib) => {
      lib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
      return lib;
    });
  }
  return pdfjsPromise;
}

function computeScale(containerWidth: number, pageWidth: number) {
  const available = Math.max(containerWidth - 32, 320);
  return Math.min(1.5, Math.max(0.75, available / pageWidth));
}

/**
 * Renders a PDF using pdfjs-dist with progressive loading:
 * page 1 appears as soon as it is ready; other pages render when scrolled near.
 *
 * Placement coordinates (x, y, width, height) are stored as PERCENTAGES of
 * the rendered page dimensions so they remain consistent across zoom levels.
 */
export function PDFViewer(props: PDFViewerProps) {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [numPages, setNumPages] = useState(0);
  const [scale, setScale] = useState(1.2);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let loadingTask: { destroy: () => void } | null = null;

    setLoading(true);
    setError(null);
    setPdf(null);
    setNumPages(0);

    (async () => {
      try {
        const pdfjsLib = await loadPdfJs();
        loadingTask = pdfjsLib.getDocument({
          url: props.pdfUrl,
          disableAutoFetch: false,
          disableStream: false,
        });
        const doc = await loadingTask.promise;
        if (cancelled) return;

        const page1 = await doc.getPage(1);
        const baseViewport = page1.getViewport({ scale: 1 });
        const containerWidth = containerRef.current?.clientWidth ?? 800;
        const nextScale = computeScale(containerWidth, baseViewport.width);

        setScale(nextScale);
        setPdf(doc);
        setNumPages(doc.numPages);
        setLoading(false);
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : t('pdf.renderFailed'),
          );
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
      loadingTask?.destroy();
    };
  }, [props.pdfUrl, t]);

  return (
    <div ref={containerRef} className="relative">
      {loading && (
        <div className="py-16 text-center text-sm text-gray-500">
          {t('pdf.loading')}
        </div>
      )}
      {error && (
        <div className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}
      {pdf &&
        Array.from({ length: numPages }, (_, index) => {
          const pageNumber = index + 1;
          return (
            <LazyPDFPage
              key={pageNumber}
              pdf={pdf}
              pageNumber={pageNumber}
              scale={scale}
              eager={pageNumber === 1}
              prefetch={pageNumber === 2}
              signatures={(props.signatures ?? []).filter(
                (s) => s.pageNumber === pageNumber,
              )}
              signatureFields={(props.signatureFields ?? []).filter(
                (f) => f.pageNumber === pageNumber,
              )}
              comments={(props.comments ?? []).filter(
                (c) =>
                  c.pageNumber === pageNumber &&
                  c.x !== null &&
                  c.y !== null,
              )}
              placementMode={!!props.placementMode}
              fieldPlacementMode={!!props.fieldPlacementMode}
              commentMode={!!props.commentMode}
              activeSignerId={props.activeSignerId}
              onSignaturePlace={props.onSignaturePlace}
              onFieldPlace={props.onFieldPlace}
              onFieldClick={props.onFieldClick}
              onCommentPin={props.onCommentPin}
              formFields={(props.formFields ?? []).filter(
                (f) => f.pageNumber === pageNumber,
              )}
              formValues={props.formValues}
              activeFormFieldId={props.activeFormFieldId}
            />
          );
        })}
    </div>
  );
}

function LazyPDFPage({
  pdf,
  pageNumber,
  scale,
  eager,
  prefetch,
  signatures,
  signatureFields,
  comments,
  placementMode,
  fieldPlacementMode,
  commentMode,
  activeSignerId,
  onSignaturePlace,
  onFieldPlace,
  onFieldClick,
  onCommentPin,
  formFields,
  formValues,
  activeFormFieldId,
}: {
  pdf: PDFDocumentProxy;
  pageNumber: number;
  scale: number;
  eager?: boolean;
  prefetch?: boolean;
  signatures: SignatureDto[];
  signatureFields: SignatureFieldDto[];
  comments: CommentDto[];
  placementMode: boolean;
  fieldPlacementMode: boolean;
  commentMode: boolean;
  activeSignerId?: string | null;
  onSignaturePlace?: (page: number, xPct: number, yPct: number) => void;
  onFieldPlace?: (page: number, xPct: number, yPct: number) => void;
  onFieldClick?: (field: SignatureFieldDto) => void;
  onCommentPin?: (page: number, xPct: number, yPct: number) => void;
  formFields?: PdfFormFieldTemplate[];
  formValues?: Record<string, string>;
  activeFormFieldId?: string | null;
}) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const renderTaskRef = useRef<{ cancel: () => void } | null>(null);
  const [dimensions, setDimensions] = useState<{
    width: number;
    height: number;
  } | null>(null);
  const [rendered, setRendered] = useState(false);
  const [renderError, setRenderError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    pdf.getPage(pageNumber).then((page) => {
      if (cancelled) return;
      const viewport = page.getViewport({ scale });
      setDimensions({ width: viewport.width, height: viewport.height });
    });

    return () => {
      cancelled = true;
    };
  }, [pdf, pageNumber, scale]);

  useEffect(() => {
    if (!dimensions) return;

    let cancelled = false;

    async function renderPage() {
      const canvas = canvasRef.current;
      if (!canvas || cancelled) return;

      try {
        renderTaskRef.current?.cancel();
        const page = await pdf.getPage(pageNumber);
        const viewport = page.getViewport({ scale });
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const ctx = canvas.getContext('2d');
        if (!ctx || cancelled) return;

        const task = page.render({ canvasContext: ctx, viewport });
        renderTaskRef.current = task;
        await task.promise;
        if (!cancelled) setRendered(true);
      } catch (err) {
        if (!cancelled && err instanceof Error && err.name !== 'RenderingCancelledException') {
          setRenderError(err.message);
        }
      }
    }

    if (eager || prefetch) {
      void renderPage();
      return () => {
        cancelled = true;
        renderTaskRef.current?.cancel();
      };
    }

    const el = wrapperRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          void renderPage();
          observer.disconnect();
        }
      },
      { rootMargin: '600px 0px' },
    );
    observer.observe(el);

    return () => {
      cancelled = true;
      observer.disconnect();
      renderTaskRef.current?.cancel();
    };
  }, [pdf, pageNumber, scale, dimensions, eager, prefetch]);

  function handleClick(e: React.MouseEvent<HTMLDivElement>) {
    if (!placementMode && !fieldPlacementMode && !commentMode) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const xPct = ((e.clientX - rect.left) / rect.width) * 100;
    const yPct = ((e.clientY - rect.top) / rect.height) * 100;
    if (fieldPlacementMode && onFieldPlace) {
      onFieldPlace(pageNumber, xPct, yPct);
    } else if (placementMode && onSignaturePlace) {
      onSignaturePlace(pageNumber, xPct, yPct);
    } else if (commentMode && onCommentPin) {
      onCommentPin(pageNumber, xPct, yPct);
    }
  }

  function handleFieldClick(
    e: React.MouseEvent<HTMLButtonElement>,
    field: SignatureFieldDto,
  ) {
    e.stopPropagation();
    if (field.signed) return;
    if (activeSignerId && field.signerId !== activeSignerId) return;
    onFieldClick?.(field);
  }

  const overlayInteractive =
    placementMode ||
    fieldPlacementMode ||
    commentMode ||
    signatureFields.some(
      (f) =>
        !f.signed &&
        (!activeSignerId || f.signerId === activeSignerId),
    );

  return (
    <div
      ref={wrapperRef}
      data-page-number={pageNumber}
      className="relative mx-auto mb-4 border border-gray-200 bg-white shadow-sm"
      style={{
        width: dimensions?.width,
        minHeight: dimensions?.height,
      }}
    >
      {!rendered && dimensions && (
        <div
          className="flex items-center justify-center bg-gray-100 text-xs text-gray-400"
          style={{ width: dimensions.width, height: dimensions.height }}
        >
          Loading page {pageNumber}...
        </div>
      )}
      <canvas
        ref={canvasRef}
        className="block max-w-full"
        style={{ display: rendered ? 'block' : 'none' }}
      />
      {renderError && (
        <div className="p-3 text-xs text-red-600">{renderError}</div>
      )}
      {rendered && (
        <div
          onClick={handleClick}
          className="absolute inset-0"
          style={{
            cursor:
              placementMode || fieldPlacementMode || commentMode
                ? 'crosshair'
                : 'default',
            pointerEvents: overlayInteractive ? 'auto' : 'none',
          }}
        >
          {formFields?.map((field) => {
            const value = formValues?.[field.id]?.trim();
            const highlighted = activeFormFieldId === field.id;
            return (
              <div
                key={field.id}
                title={field.label}
                style={{
                  position: 'absolute',
                  left: `${field.x}%`,
                  top: `${field.y}%`,
                  width: `${field.width}%`,
                  minHeight: `${field.height}%`,
                  border: highlighted
                    ? '1px solid #2563eb'
                    : value
                      ? '1px solid transparent'
                      : '1px dashed rgba(37, 99, 235, 0.35)',
                  background: value
                    ? 'rgba(255, 255, 255, 0.82)'
                    : 'rgba(37, 99, 235, 0.04)',
                  borderRadius: 2,
                  pointerEvents: 'none',
                  overflow: 'hidden',
                  display: 'flex',
                  alignItems: 'center',
                  padding: '0 2px',
                }}
              >
                {value && (
                  <span
                    style={{
                      fontSize: 10,
                      lineHeight: 1.1,
                      color: '#111',
                      direction: 'rtl',
                      textAlign: 'right',
                      width: '100%',
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word',
                    }}
                  >
                    {value}
                  </span>
                )}
              </div>
            );
          })}
          {signatureFields.map((field) => {
            const isMine =
              !activeSignerId || field.signerId === activeSignerId;
            const clickable = !field.signed && isMine && !!onFieldClick;
            const label =
              field.label ||
              field.signerName ||
              field.signerEmail.split('@')[0];
            return (
              <button
                key={field._id}
                type="button"
                onClick={(e) => handleFieldClick(e, field)}
                disabled={!clickable}
                title={
                  field.signed
                    ? `Signed – ${field.signerEmail}`
                    : `${label} – ${field.signerEmail}`
                }
                style={{
                  position: 'absolute',
                  left: `${field.x}%`,
                  top: `${field.y}%`,
                  width: `${field.width}%`,
                  height: `${field.height}%`,
                  border: field.signed
                    ? '2px solid #10b981'
                    : isMine
                      ? '2px dashed #2563eb'
                      : '2px dashed #9ca3af',
                  background: field.signed
                    ? 'rgba(16, 185, 129, 0.12)'
                    : isMine
                      ? 'rgba(37, 99, 235, 0.08)'
                      : 'rgba(156, 163, 175, 0.08)',
                  borderRadius: 4,
                  cursor: clickable ? 'pointer' : 'default',
                  pointerEvents: clickable || fieldPlacementMode ? 'auto' : 'none',
                  padding: 0,
                }}
              >
                {!field.signed && (
                  <span
                    style={{
                      position: 'absolute',
                      top: -18,
                      left: 0,
                      fontSize: 10,
                      lineHeight: 1,
                      color: isMine ? '#1d4ed8' : '#6b7280',
                      whiteSpace: 'nowrap',
                      pointerEvents: 'none',
                    }}
                  >
                    {label}
                  </span>
                )}
              </button>
            );
          })}
          {signatures.map((s) => (
            <img
              key={s._id}
              src={s.imageUrl}
              alt="signature"
              style={{
                position: 'absolute',
                left: `${s.x}%`,
                top: `${s.y}%`,
                width: `${s.width}%`,
                height: `${s.height}%`,
                pointerEvents: 'none',
              }}
            />
          ))}
          {comments.map((c) => (
            <div
              key={c._id}
              title={c.content}
              style={{
                position: 'absolute',
                left: `${c.x}%`,
                top: `${c.y}%`,
                transform: 'translate(-50%, -50%)',
                width: 14,
                height: 14,
                borderRadius: '50%',
                background: c.resolved ? '#10b981' : '#f59e0b',
                border: '2px solid white',
                boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
                pointerEvents: 'auto',
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
