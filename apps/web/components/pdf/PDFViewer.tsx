'use client';

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import type { CommentDto, PdfFormFieldTemplate, SignatureDto, SignatureFieldDto } from '@docflow/shared';

import { useTranslation } from '@/lib/i18n/LocaleProvider';

import { PdfLoadingSkeleton } from '@/components/pdf/PdfLoadingSkeleton';
import { Skeleton } from '@/components/ui/skeleton';
import { pdfjsLib } from '@/lib/pdfjs-client';

export interface TemplateEditField {
  id: string;
  label: string;
  pageNumber: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PDFViewerProps {
  pdfUrl: string;
  signatures?: SignatureDto[];
  signatureFields?: SignatureFieldDto[];
  comments?: CommentDto[];
  placementMode?: boolean;
  fieldPlacementMode?: boolean;
  /** Draft owner: drag unsigned signature fields to reposition. */
  fieldEditMode?: boolean;
  commentMode?: boolean;
  /** When set, only this signer's unsigned fields are clickable. */
  activeSignerId?: string | null;
  /** Signatures are baked into the PDF; render invisible click targets for tagging. */
  signatureTagHitTargetsOnly?: boolean;
  onSignaturePlace?: (page: number, xPct: number, yPct: number) => void;
  onFieldPlace?: (page: number, xPct: number, yPct: number) => void;
  onFieldMove?: (
    fieldId: string,
    page: number,
    x: number,
    y: number,
  ) => void;
  onFieldResize?: (fieldId: string, width: number, height: number) => void;
  onFieldClick?: (field: SignatureFieldDto) => void;
  onSignerTag?: (payload: {
    signerId: string;
    email: string;
    name: string | null;
    pageNumber: number;
    x: number;
    y: number;
  }) => void;
  onCommentPin?: (page: number, xPct: number, yPct: number) => void;
  onCommentSelect?: (commentId: string) => void;
  formFields?: PdfFormFieldTemplate[];
  formValues?: Record<string, string>;
  activeFormFieldId?: string | null;
  // Template editing
  templateEditMode?: boolean;
  templateEditFields?: TemplateEditField[];
  selectedTemplateFieldId?: string | null;
  onTemplateFieldSelect?: (id: string | null) => void;
  onTemplateFieldAdd?: (page: number, xPct: number, yPct: number) => void;
  onTemplateFieldMove?: (id: string, x: number, y: number) => void;
  onTemplateFieldResize?: (id: string, width: number, height: number) => void;
}

function computeScale(containerWidth: number, pageWidth: number) {
  const available = Math.max(containerWidth - 32, 100);
  return Math.min(1.5, Math.max(0.4, available / pageWidth));
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
    let loadingTask: { promise: Promise<any>; destroy: () => void } | null = null;

    setLoading(true);
    setError(null);
    setPdf(null);
    setNumPages(0);

    (async () => {
      try {
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
    <div
      ref={containerRef}
      className="relative"
      dir="ltr"
      style={{ direction: 'ltr', unicodeBidi: 'isolate' }}
    >
      {loading && <PdfLoadingSkeleton />}
      {error && (
        <div className="rounded-lg border border-danger/30 bg-danger/5 p-3 text-sm text-danger">
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
              fieldEditMode={!!props.fieldEditMode}
              commentMode={!!props.commentMode}
              activeSignerId={props.activeSignerId}
              signatureTagHitTargetsOnly={!!props.signatureTagHitTargetsOnly}
              onSignaturePlace={props.onSignaturePlace}
              onFieldPlace={props.onFieldPlace}
              onFieldMove={props.onFieldMove}
              onFieldResize={props.onFieldResize}
              onFieldClick={props.onFieldClick}
              onSignerTag={props.onSignerTag}
              onCommentPin={props.onCommentPin}
              onCommentSelect={props.onCommentSelect}
              formFields={(props.formFields ?? []).filter(
                (f) => f.pageNumber === pageNumber,
              )}
              formValues={props.formValues}
              activeFormFieldId={props.activeFormFieldId}
              templateEditMode={!!props.templateEditMode}
              templateEditFields={(props.templateEditFields ?? []).filter(
                (f) => f.pageNumber === pageNumber,
              )}
              selectedTemplateFieldId={props.selectedTemplateFieldId}
              onTemplateFieldSelect={props.onTemplateFieldSelect}
              onTemplateFieldAdd={props.onTemplateFieldAdd}
              onTemplateFieldMove={props.onTemplateFieldMove}
              onTemplateFieldResize={props.onTemplateFieldResize}
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
  fieldEditMode,
  commentMode,
  activeSignerId,
  signatureTagHitTargetsOnly,
  onSignaturePlace,
  onFieldPlace,
  onFieldMove,
  onFieldResize,
  onFieldClick,
  onSignerTag,
  onCommentPin,
  onCommentSelect,
  formFields,
  formValues,
  activeFormFieldId,
  templateEditMode,
  templateEditFields,
  selectedTemplateFieldId,
  onTemplateFieldSelect,
  onTemplateFieldAdd,
  onTemplateFieldMove,
  onTemplateFieldResize,
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
  fieldEditMode: boolean;
  commentMode: boolean;
  activeSignerId?: string | null;
  signatureTagHitTargetsOnly?: boolean;
  onSignaturePlace?: (page: number, xPct: number, yPct: number) => void;
  onFieldPlace?: (page: number, xPct: number, yPct: number) => void;
  onFieldMove?: (
    fieldId: string,
    page: number,
    x: number,
    y: number,
  ) => void;
  onFieldResize?: (fieldId: string, width: number, height: number) => void;
  onFieldClick?: (field: SignatureFieldDto) => void;
  onSignerTag?: (payload: {
    signerId: string;
    email: string;
    name: string | null;
    pageNumber: number;
    x: number;
    y: number;
  }) => void;
  onCommentPin?: (page: number, xPct: number, yPct: number) => void;
  onCommentSelect?: (commentId: string) => void;
  formFields?: PdfFormFieldTemplate[];
  formValues?: Record<string, string>;
  activeFormFieldId?: string | null;
  templateEditMode: boolean;
  templateEditFields: TemplateEditField[];
  selectedTemplateFieldId?: string | null;
  onTemplateFieldSelect?: (id: string | null) => void;
  onTemplateFieldAdd?: (page: number, xPct: number, yPct: number) => void;
  onTemplateFieldMove?: (id: string, x: number, y: number) => void;
  onTemplateFieldResize?: (id: string, width: number, height: number) => void;
}) {
  const { t } = useTranslation();
  const wrapperRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const renderTaskRef = useRef<{ cancel: () => void } | null>(null);
  const justDraggedRef = useRef(false);
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
        const cssViewport = page.getViewport({ scale });
        const dpr = window.devicePixelRatio || 1;
        canvas.width = cssViewport.width * dpr;
        canvas.height = cssViewport.height * dpr;
        canvas.style.width = `${cssViewport.width}px`;
        canvas.style.height = `${cssViewport.height}px`;
        const ctx = canvas.getContext('2d');
        if (!ctx || cancelled) return;

        const hiResViewport = page.getViewport({ scale: scale * dpr });
        const task = page.render({ canvasContext: ctx, viewport: hiResViewport });
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
    if (templateEditMode || fieldPlacementMode) {
      if (justDraggedRef.current) {
        justDraggedRef.current = false;
        return;
      }
    }
    if (templateEditMode) {
      const rect = e.currentTarget.getBoundingClientRect();
      const xPct = ((e.clientX - rect.left) / rect.width) * 100;
      const yPct = ((e.clientY - rect.top) / rect.height) * 100;
      onTemplateFieldSelect?.(null);
      onTemplateFieldAdd?.(pageNumber, xPct, yPct);
      return;
    }
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

  function canTagField(field: SignatureFieldDto): boolean {
    return (
      !!field.signerEmail.includes('@') ||
      !!field.signerName?.trim() ||
      !!field.label?.trim()
    );
  }

  function tagSignerFromField(field: SignatureFieldDto) {
    if (!signerTagEnabled || !canTagField(field)) return;
    onSignerTag?.({
      signerId: field.signerId,
      email: field.signerEmail,
      name: field.signerName ?? field.label,
      pageNumber: field.pageNumber,
      x: field.x,
      y: field.y,
    });
  }

  function handleFieldClick(
    e: React.MouseEvent<HTMLButtonElement>,
    field: SignatureFieldDto,
  ) {
    e.stopPropagation();
    const isMine = !activeSignerId || field.signerId === activeSignerId;
    const canSignThisField = !field.signed && isMine && !!onFieldClick;
    if (canSignThisField) {
      onFieldClick(field);
      return;
    }
    tagSignerFromField(field);
  }

  function handleSignatureImageClick(
    e: React.MouseEvent<HTMLButtonElement>,
    signature: SignatureDto,
  ) {
    e.stopPropagation();
    const field = signatureFields.find((f) => f._id === signature.signatureFieldId);
    if (!signerTagEnabled || !field || !canTagField(field)) return;
    onSignerTag?.({
      signerId: field.signerId,
      email: field.signerEmail || signature.signerEmail,
      name: field.signerName ?? field.label,
      pageNumber: signature.pageNumber,
      x: signature.x,
      y: signature.y,
    });
  }

  function startTemplateDrag(
    e: React.MouseEvent,
    field: TemplateEditField,
    mode: 'move' | 'resize',
  ) {
    e.stopPropagation();
    e.preventDefault();

    const fieldEl = (e.currentTarget as HTMLElement).closest('[data-tfield]') as HTMLElement;
    if (!fieldEl) return;

    const startMouseX = e.clientX;
    const startMouseY = e.clientY;
    const startFieldX = field.x;
    const startFieldY = field.y;
    const startWidth = field.width;
    const startHeight = field.height;

    onTemplateFieldSelect?.(field.id);

    function onMouseMove(ev: MouseEvent) {
      const overlay = overlayRef.current;
      if (!overlay) return;
      const rect = overlay.getBoundingClientRect();
      const dx = ((ev.clientX - startMouseX) / rect.width) * 100;
      const dy = ((ev.clientY - startMouseY) / rect.height) * 100;

      if (mode === 'move') {
        const newX = Math.max(0, Math.min(100 - field.width, startFieldX + dx));
        const newY = Math.max(0, Math.min(100 - field.height, startFieldY + dy));
        fieldEl.style.left = `${newX}%`;
        fieldEl.style.top = `${newY}%`;
      } else {
        const newW = Math.max(5, startWidth + dx);
        const newH = Math.max(2, startHeight + dy);
        fieldEl.style.width = `${newW}%`;
        fieldEl.style.height = `${newH}%`;
      }
    }

    function onMouseUp(ev: MouseEvent) {
      const overlay = overlayRef.current;
      if (overlay) {
        const rect = overlay.getBoundingClientRect();
        const dx = ((ev.clientX - startMouseX) / rect.width) * 100;
        const dy = ((ev.clientY - startMouseY) / rect.height) * 100;
        const moved = Math.abs(dx) > 0.3 || Math.abs(dy) > 0.3;

        if (moved) {
          justDraggedRef.current = true;
          if (mode === 'move') {
            const newX = Math.max(0, Math.min(100 - field.width, startFieldX + dx));
            const newY = Math.max(0, Math.min(100 - field.height, startFieldY + dy));
            onTemplateFieldMove?.(field.id, newX, newY);
          } else {
            const newW = Math.max(5, startWidth + dx);
            const newH = Math.max(2, startHeight + dy);
            onTemplateFieldResize?.(field.id, newW, newH);
          }
          setTimeout(() => { justDraggedRef.current = false; }, 50);
        }
      }
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    }

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  }

  function startSignatureFieldDrag(
    e: React.MouseEvent,
    field: SignatureFieldDto,
    mode: 'move' | 'resize',
  ) {
    e.stopPropagation();
    e.preventDefault();

    const fieldEl = (e.currentTarget as HTMLElement).closest(
      '[data-sfield]',
    ) as HTMLElement;
    if (!fieldEl) return;

    const startMouseX = e.clientX;
    const startMouseY = e.clientY;
    const startFieldX = field.x;
    const startFieldY = field.y;
    const startWidth = field.width;
    const startHeight = field.height;

    function onMouseMove(ev: MouseEvent) {
      const overlay = overlayRef.current;
      if (!overlay) return;
      const rect = overlay.getBoundingClientRect();
      const dx = ((ev.clientX - startMouseX) / rect.width) * 100;
      const dy = ((ev.clientY - startMouseY) / rect.height) * 100;

      if (mode === 'move') {
        const newX = Math.max(0, Math.min(100 - field.width, startFieldX + dx));
        const newY = Math.max(0, Math.min(100 - field.height, startFieldY + dy));
        fieldEl.style.left = `${newX}%`;
        fieldEl.style.top = `${newY}%`;
      } else {
        const newW = Math.max(5, Math.min(100 - startFieldX, startWidth + dx));
        const newH = Math.max(2, Math.min(100 - startFieldY, startHeight + dy));
        fieldEl.style.width = `${newW}%`;
        fieldEl.style.height = `${newH}%`;
      }
    }

    function onMouseUp(ev: MouseEvent) {
      const overlay = overlayRef.current;
      if (overlay) {
        const rect = overlay.getBoundingClientRect();
        const dx = ((ev.clientX - startMouseX) / rect.width) * 100;
        const dy = ((ev.clientY - startMouseY) / rect.height) * 100;
        const moved = Math.abs(dx) > 0.3 || Math.abs(dy) > 0.3;

        if (moved) {
          justDraggedRef.current = true;
          if (mode === 'move') {
            const newX = Math.max(0, Math.min(100 - field.width, startFieldX + dx));
            const newY = Math.max(0, Math.min(100 - field.height, startFieldY + dy));
            onFieldMove?.(field._id, pageNumber, newX, newY);
          } else {
            const newW = Math.max(5, Math.min(100 - startFieldX, startWidth + dx));
            const newH = Math.max(2, Math.min(100 - startFieldY, startHeight + dy));
            onFieldResize?.(field._id, newW, newH);
          }
          setTimeout(() => {
            justDraggedRef.current = false;
          }, 50);
        }
      }
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    }

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  }

  const signerTagEnabled =
    !!onSignerTag &&
    !placementMode &&
    !fieldPlacementMode &&
    !commentMode &&
    !fieldEditMode &&
    !templateEditMode;

  const overlayInteractive =
    templateEditMode ||
    placementMode ||
    fieldPlacementMode ||
    commentMode ||
    signerTagEnabled ||
    signatureFields.some(
      (f) =>
        !f.signed &&
        (!activeSignerId || f.signerId === activeSignerId),
    );

  return (
    <div
      ref={wrapperRef}
      data-page-number={pageNumber}
      dir="ltr"
      className="relative mx-auto mb-6 overflow-hidden rounded-lg border border-border bg-surface shadow-md"
      style={{
        width: dimensions?.width,
        minHeight: dimensions?.height,
        direction: 'ltr',
        unicodeBidi: 'isolate',
      }}
    >
      {!rendered && dimensions && (
        <Skeleton
          className="rounded-none"
          style={{ width: dimensions.width, height: dimensions.height }}
        />
      )}
      <canvas
        ref={canvasRef}
        className="block"
        dir="ltr"
        style={{
          display: rendered ? 'block' : 'none',
          direction: 'ltr',
          unicodeBidi: 'isolate',
        }}
      />
      {renderError && (
        <div className="p-3 text-xs text-red-600">{renderError}</div>
      )}
      {rendered && (
        <div
          ref={overlayRef}
          onClick={handleClick}
          className="absolute inset-0"
          style={{
            cursor: templateEditMode
              ? (onTemplateFieldAdd ? 'crosshair' : 'default')
              : placementMode || fieldPlacementMode || commentMode
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
                  background: value ? '#fff' : 'rgba(37, 99, 235, 0.04)',
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
          {comments
            .filter(
              (comment) =>
                comment.pageNumber === pageNumber &&
                comment.x !== null &&
                comment.y !== null,
            )
            .map((comment, index) => (
              <button
                key={comment._id}
                type="button"
                aria-label={`Comment: ${comment.content}`}
                title={comment.content}
                onClick={(e) => {
                  e.stopPropagation();
                  onCommentSelect?.(comment._id);
                }}
                style={{
                  position: 'absolute',
                  left: `${comment.x}%`,
                  top: `${comment.y}%`,
                  width: 22,
                  height: 22,
                  zIndex: 30,
                  transform: 'translate(-50%, -50%)',
                  borderRadius: 9999,
                  border: '2px solid #f59e0b',
                  background: comment.resolved ? '#fef3c7' : '#fbbf24',
                  color: '#111827',
                  fontSize: 11,
                  fontWeight: 700,
                  lineHeight: '18px',
                  textAlign: 'center',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.25)',
                  pointerEvents: 'auto',
                }}
              >
                {index + 1}
              </button>
            ))}
          {signatureFields.map((field) => {
            const isMine =
              !activeSignerId || field.signerId === activeSignerId;
            const canSignThisField = !field.signed && isMine && !!onFieldClick;
            const canTagSigner = signerTagEnabled && canTagField(field);
            const clickable = canSignThisField || canTagSigner;
            const draggable =
              fieldEditMode &&
              !field.signed &&
              !!(onFieldMove || onFieldResize);
            const label =
              field.label ||
              field.signerName ||
              field.signerEmail.split('@')[0];
            const tagHitTargetOnly =
              signatureTagHitTargetsOnly && field.signed && canTagSigner;
            const boxStyle: CSSProperties = tagHitTargetOnly
              ? {
                  position: 'absolute',
                  left: `${field.x}%`,
                  top: `${field.y}%`,
                  width: `${field.width}%`,
                  height: `${field.height}%`,
                  border: '2px solid transparent',
                  background: 'transparent',
                  borderRadius: 4,
                  boxSizing: 'border-box',
                  userSelect: 'none',
                }
              : {
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
                  boxSizing: 'border-box',
                  userSelect: 'none',
                };
            const labelEl = !field.signed && (
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
                  background: 'rgba(255,255,255,0.85)',
                  padding: '1px 3px',
                  borderRadius: 2,
                }}
              >
                {label}
              </span>
            );

            if (draggable) {
              return (
                <div
                  key={field._id}
                  data-sfield={field._id}
                  title={`${label} – ${field.signerEmail}`}
                  onMouseDown={(e) => startSignatureFieldDrag(e, field, 'move')}
                  style={{
                    ...boxStyle,
                    cursor: 'move',
                    pointerEvents: 'auto',
                  }}
                >
                  {labelEl}
                  {onFieldResize && (
                    <div
                      onMouseDown={(e) => {
                        e.stopPropagation();
                        startSignatureFieldDrag(e, field, 'resize');
                      }}
                      onClick={(e) => e.stopPropagation()}
                      style={{
                        position: 'absolute',
                        bottom: 0,
                        right: 0,
                        width: 10,
                        height: 10,
                        background: '#2563eb',
                        cursor: 'se-resize',
                        borderRadius: '2px 0 2px 0',
                      }}
                    />
                  )}
                </div>
              );
            }

            return (
              <button
                key={field._id}
                type="button"
                onClick={(e) => handleFieldClick(e, field)}
                disabled={!clickable}
                title={
                  field.signed
                    ? signerTagEnabled
                      ? `${label} – ${t('document.tagSignerInComment')}`
                      : `Signed – ${field.signerEmail}`
                    : canSignThisField
                      ? `${label} – ${field.signerEmail}`
                      : signerTagEnabled
                        ? `${label} – ${t('document.tagSignerInComment')}`
                        : `${label} – ${field.signerEmail}`
                }
                className={
                  tagHitTargetOnly
                    ? 'hover:outline hover:outline-2 hover:outline-blue-400/70'
                    : undefined
                }
                style={{
                  ...boxStyle,
                  cursor: clickable ? 'pointer' : 'default',
                  pointerEvents: clickable || fieldPlacementMode ? 'auto' : 'none',
                  padding: 0,
                  zIndex: tagHitTargetOnly ? 20 : undefined,
                }}
              >
                {labelEl}
              </button>
            );
          })}
          {signatures.map((s) =>
            signerTagEnabled ? (
              <button
                key={s._id}
                type="button"
                onClick={(e) => handleSignatureImageClick(e, s)}
                title={t('document.tagSignerInComment')}
                className={
                  signatureTagHitTargetsOnly
                    ? 'hover:outline hover:outline-2 hover:outline-blue-400/70'
                    : undefined
                }
                style={{
                  position: 'absolute',
                  left: `${s.x}%`,
                  top: `${s.y}%`,
                  width: `${s.width}%`,
                  height: `${s.height}%`,
                  padding: 0,
                  border: 'none',
                  background: 'transparent',
                  cursor: 'pointer',
                  pointerEvents: 'auto',
                  zIndex: 20,
                }}
              >
                {!signatureTagHitTargetsOnly && (
                  <img
                    src={s.imageUrl}
                    alt="signature"
                    draggable={false}
                    style={{
                      width: '100%',
                      height: '100%',
                      pointerEvents: 'none',
                    }}
                  />
                )}
              </button>
            ) : (
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
            ),
          )}
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
          {/* Template edit fields */}
          {templateEditMode && templateEditFields.map((field) => {
            const isSelected = selectedTemplateFieldId === field.id;
            return (
              <div
                key={field.id}
                data-tfield={field.id}
                onMouseDown={(e) => startTemplateDrag(e, field, 'move')}
                onClick={(e) => { e.stopPropagation(); onTemplateFieldSelect?.(field.id); }}
                style={{
                  position: 'absolute',
                  left: `${field.x}%`,
                  top: `${field.y}%`,
                  width: `${field.width}%`,
                  height: `${field.height}%`,
                  border: isSelected ? '2px solid #2563eb' : '2px dashed #6366f1',
                  background: isSelected
                    ? 'rgba(37, 99, 235, 0.12)'
                    : 'rgba(99, 102, 241, 0.08)',
                  borderRadius: 4,
                  cursor: 'move',
                  boxSizing: 'border-box',
                  userSelect: 'none',
                }}
              >
                <span
                  style={{
                    position: 'absolute',
                    top: -18,
                    left: 0,
                    fontSize: 10,
                    lineHeight: 1,
                    color: isSelected ? '#1d4ed8' : '#4f46e5',
                    whiteSpace: 'nowrap',
                    pointerEvents: 'none',
                    background: 'rgba(255,255,255,0.85)',
                    padding: '1px 3px',
                    borderRadius: 2,
                  }}
                >
                  {field.label || `Field`}
                </span>
                {/* Resize handle */}
                <div
                  onMouseDown={(e) => {
                    e.stopPropagation();
                    startTemplateDrag(e, field, 'resize');
                  }}
                  onClick={(e) => e.stopPropagation()}
                  style={{
                    position: 'absolute',
                    bottom: 0,
                    right: 0,
                    width: 10,
                    height: 10,
                    background: isSelected ? '#2563eb' : '#6366f1',
                    cursor: 'se-resize',
                    borderRadius: '2px 0 2px 0',
                  }}
                />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
