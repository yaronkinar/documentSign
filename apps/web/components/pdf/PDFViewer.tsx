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
  /** When set, only this signature field can be dragged in field edit mode. */
  movableSignatureFieldId?: string | null;
  onSignatureFieldSelect?: (fieldId: string) => void;
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
  formFieldPlacementMode?: boolean;
  formFieldEditMode?: boolean;
  editableFormFieldIds?: string[];
  onFormFieldPlace?: (page: number, xPct: number, yPct: number) => void;
  onFormFieldMove?: (
    fieldId: string,
    page: number,
    x: number,
    y: number,
  ) => void;
  onFormFieldResize?: (fieldId: string, width: number, height: number) => void;
  onFormFieldSelect?: (fieldId: string) => void;
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

const ZOOM_STEP = 0.25;
const ZOOM_MIN = 0.5;
const ZOOM_MAX = 4;

interface PageDropTarget {
  pageNumber: number;
  x: number;
  y: number;
}

interface PageOverlayHit {
  pageNumber: number;
  overlay: HTMLElement;
}

/** Find the PDF page overlay under a viewport point (ignores UI below the canvas). */
function findPageOverlayAtPoint(
  x: number,
  y: number,
): PageOverlayHit | null {
  const pages = document.querySelectorAll('[data-page-number]');
  for (const pageEl of pages) {
    const overlay = pageEl.querySelector(
      '[data-pdf-page-overlay]',
    ) as HTMLElement | null;
    if (!overlay) continue;
    const rect = overlay.getBoundingClientRect();
    if (
      x >= rect.left &&
      x <= rect.right &&
      y >= rect.top &&
      y <= rect.bottom
    ) {
      const pageNumber = Number(pageEl.getAttribute('data-page-number'));
      if (!Number.isFinite(pageNumber) || pageNumber < 1) continue;
      return { pageNumber, overlay };
    }
  }
  return null;
}

function coordsInOverlay(
  overlay: HTMLElement,
  topLeftX: number,
  topLeftY: number,
  fieldWidth: number,
  fieldHeight: number,
): { x: number; y: number } {
  const rect = overlay.getBoundingClientRect();
  const x = Math.max(
    0,
    Math.min(100 - fieldWidth, ((topLeftX - rect.left) / rect.width) * 100),
  );
  const y = Math.max(
    0,
    Math.min(100 - fieldHeight, ((topLeftY - rect.top) / rect.height) * 100),
  );
  return { x, y };
}

/** Resolve which PDF page and % coords a point should drop onto. */
function resolvePageDropTarget(
  topLeftX: number,
  topLeftY: number,
  fieldWidth: number,
  fieldHeight: number,
  pageHintX = topLeftX,
  pageHintY = topLeftY,
): PageDropTarget | null {
  const hit =
    findPageOverlayAtPoint(pageHintX, pageHintY) ??
    findPageOverlayAtPoint(topLeftX, topLeftY);
  if (hit) {
    const { x, y } = coordsInOverlay(
      hit.overlay,
      topLeftX,
      topLeftY,
      fieldWidth,
      fieldHeight,
    );
    return { pageNumber: hit.pageNumber, x, y };
  }

  const el = document.elementFromPoint(pageHintX, pageHintY);
  const pageEl = el?.closest('[data-page-number]') as HTMLElement | null;
  if (!pageEl) return null;

  const pageNumber = Number(pageEl.getAttribute('data-page-number'));
  if (!Number.isFinite(pageNumber) || pageNumber < 1) return null;

  const overlay = pageEl.querySelector(
    '[data-pdf-page-overlay]',
  ) as HTMLElement | null;
  if (!overlay) return null;

  const rect = overlay.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return null;

  const { x, y } = coordsInOverlay(
    overlay,
    topLeftX,
    topLeftY,
    fieldWidth,
    fieldHeight,
  );
  return { pageNumber, x, y };
}

function lockDragSurface() {
  const prev = {
    userSelect: document.body.style.userSelect,
    overflow: document.body.style.overflow,
  };
  document.body.style.userSelect = 'none';
  document.body.style.overflow = 'hidden';
  let unlocked = false;
  return () => {
    if (unlocked) return;
    unlocked = true;
    document.body.style.userSelect = prev.userSelect;
    document.body.style.overflow = prev.overflow;
  };
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
  const [zoom, setZoom] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const effectiveScale = scale * zoom;

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
      {pdf && (
        <div
          dir="ltr"
          className="sticky top-2 z-40 mb-2 flex w-fit items-center gap-1 rounded-md border border-border bg-surface/95 px-1.5 py-1 shadow-sm backdrop-blur"
        >
          <button
            type="button"
            aria-label={t('pdf.zoomOut')}
            onClick={() => setZoom((z) => Math.max(ZOOM_MIN, +(z - ZOOM_STEP).toFixed(2)))}
            disabled={zoom <= ZOOM_MIN}
            className="flex h-7 w-7 items-center justify-center rounded text-base text-fg hover:bg-surface-muted disabled:opacity-40"
          >
            −
          </button>
          <button
            type="button"
            aria-label={t('pdf.zoomReset')}
            onClick={() => setZoom(1)}
            className="min-w-[3rem] rounded px-1 text-center text-xs tabular-nums text-fg hover:bg-surface-muted"
          >
            {Math.round(zoom * 100)}%
          </button>
          <button
            type="button"
            aria-label={t('pdf.zoomIn')}
            onClick={() => setZoom((z) => Math.min(ZOOM_MAX, +(z + ZOOM_STEP).toFixed(2)))}
            disabled={zoom >= ZOOM_MAX}
            className="flex h-7 w-7 items-center justify-center rounded text-base text-fg hover:bg-surface-muted disabled:opacity-40"
          >
            +
          </button>
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
              scale={effectiveScale}
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
              movableSignatureFieldId={props.movableSignatureFieldId}
              onSignatureFieldSelect={props.onSignatureFieldSelect}
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
              formFieldPlacementMode={!!props.formFieldPlacementMode}
              formFieldEditMode={!!props.formFieldEditMode}
              editableFormFieldIds={props.editableFormFieldIds}
              onFormFieldPlace={props.onFormFieldPlace}
              onFormFieldMove={props.onFormFieldMove}
              onFormFieldResize={props.onFormFieldResize}
              onFormFieldSelect={props.onFormFieldSelect}
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
  movableSignatureFieldId,
  onSignatureFieldSelect,
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
  formFieldPlacementMode,
  formFieldEditMode,
  editableFormFieldIds,
  onFormFieldPlace,
  onFormFieldMove,
  onFormFieldResize,
  onFormFieldSelect,
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
  movableSignatureFieldId?: string | null;
  onSignatureFieldSelect?: (fieldId: string) => void;
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
  formFieldPlacementMode: boolean;
  formFieldEditMode: boolean;
  editableFormFieldIds?: string[];
  onFormFieldPlace?: (page: number, xPct: number, yPct: number) => void;
  onFormFieldMove?: (
    fieldId: string,
    page: number,
    x: number,
    y: number,
  ) => void;
  onFormFieldResize?: (fieldId: string, width: number, height: number) => void;
  onFormFieldSelect?: (fieldId: string) => void;
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

  const editableFormFieldSet = new Set(editableFormFieldIds ?? []);

  function handleClick(e: React.MouseEvent<HTMLDivElement>) {
    if (templateEditMode || fieldPlacementMode || formFieldPlacementMode) {
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
    if (
      !placementMode &&
      !fieldPlacementMode &&
      !formFieldPlacementMode &&
      !commentMode
    ) {
      return;
    }
    const rect = e.currentTarget.getBoundingClientRect();
    const xPct = ((e.clientX - rect.left) / rect.width) * 100;
    const yPct = ((e.clientY - rect.top) / rect.height) * 100;
    if (formFieldPlacementMode && onFormFieldPlace) {
      onFormFieldPlace(pageNumber, xPct, yPct);
    } else if (fieldPlacementMode && onFieldPlace) {
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
    if (fieldEditMode && !field.signed && onSignatureFieldSelect) {
      onSignatureFieldSelect(field._id);
      return;
    }
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

    onSignatureFieldSelect?.(field._id);

    if (mode === 'move') {
      const startOverlay = overlayRef.current;
      if (!startOverlay) return;
      const unlockDragSurface = lockDragSurface();
      let currentX = startFieldX;
      let currentY = startFieldY;

      function onMouseMove(ev: MouseEvent) {
        ev.preventDefault();
        const overlay = overlayRef.current;
        if (!overlay) return;
        const rect = overlay.getBoundingClientRect();
        const dx = ((ev.clientX - startMouseX) / rect.width) * 100;
        const dy = ((ev.clientY - startMouseY) / rect.height) * 100;
        currentX = Math.max(
          0,
          Math.min(100 - field.width, startFieldX + dx),
        );
        currentY = Math.max(
          0,
          Math.min(100 - field.height, startFieldY + dy),
        );
        fieldEl.style.left = `${currentX}%`;
        fieldEl.style.top = `${currentY}%`;
      }

      function onMouseUp(ev: MouseEvent) {
        unlockDragSurface();
        const moved =
          Math.abs(ev.clientX - startMouseX) > 3 ||
          Math.abs(ev.clientY - startMouseY) > 3;

        const fieldRect = fieldEl.getBoundingClientRect();
        fieldEl.style.left = '';
        fieldEl.style.top = '';

        if (moved) {
          const drop =
            resolvePageDropTarget(
              fieldRect.left,
              fieldRect.top,
              field.width,
              field.height,
              fieldRect.left + fieldRect.width / 2,
              fieldRect.top + fieldRect.height / 2,
            ) ?? { pageNumber, x: currentX, y: currentY };
          justDraggedRef.current = true;
          onFieldMove?.(field._id, drop.pageNumber, drop.x, drop.y);
          setTimeout(() => {
            justDraggedRef.current = false;
          }, 50);
        }

        window.removeEventListener('mousemove', onMouseMove);
        window.removeEventListener('mouseup', onMouseUp);
      }

      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', onMouseUp);
      return;
    }

    const unlockDragSurface = lockDragSurface();
    let currentWidth = startWidth;
    let currentHeight = startHeight;

    function onMouseMove(ev: MouseEvent) {
      ev.preventDefault();
      const overlay = overlayRef.current;
      if (!overlay) return;
      const rect = overlay.getBoundingClientRect();
      const dx = ((ev.clientX - startMouseX) / rect.width) * 100;
      const dy = ((ev.clientY - startMouseY) / rect.height) * 100;

      currentWidth = Math.max(5, Math.min(100 - startFieldX, startWidth + dx));
      currentHeight = Math.max(2, Math.min(100 - startFieldY, startHeight + dy));
      fieldEl.style.width = `${currentWidth}%`;
      fieldEl.style.height = `${currentHeight}%`;
    }

    function onMouseUp(ev: MouseEvent) {
      unlockDragSurface();
      const overlay = overlayRef.current;
      const rect = overlay?.getBoundingClientRect();
      const dx = rect ? ((ev.clientX - startMouseX) / rect.width) * 100 : 0;
      const dy = rect ? ((ev.clientY - startMouseY) / rect.height) * 100 : 0;
      const moved = Math.abs(dx) > 0.3 || Math.abs(dy) > 0.3;

      fieldEl.style.width = '';
      fieldEl.style.height = '';

      if (moved) {
        justDraggedRef.current = true;
        onFieldResize?.(field._id, currentWidth, currentHeight);
        setTimeout(() => {
          justDraggedRef.current = false;
        }, 50);
      }
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    }

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  }

  function startFormFieldDrag(
    e: React.MouseEvent,
    field: PdfFormFieldTemplate,
    mode: 'move' | 'resize',
  ) {
    e.stopPropagation();
    e.preventDefault();

    const fieldEl = (e.currentTarget as HTMLElement).closest(
      '[data-ffield]',
    ) as HTMLElement;
    if (!fieldEl) return;

    const startMouseX = e.clientX;
    const startMouseY = e.clientY;
    const startFieldX = field.x;
    const startFieldY = field.y;
    const startWidth = field.width;
    const startHeight = field.height;

    if (mode === 'move') {
      const startOverlay = overlayRef.current;
      if (!startOverlay) return;
      const unlockDragSurface = lockDragSurface();
      let currentX = startFieldX;
      let currentY = startFieldY;

      function onMouseMove(ev: MouseEvent) {
        ev.preventDefault();
        const overlay = overlayRef.current;
        if (!overlay) return;
        const rect = overlay.getBoundingClientRect();
        const dx = ((ev.clientX - startMouseX) / rect.width) * 100;
        const dy = ((ev.clientY - startMouseY) / rect.height) * 100;
        currentX = Math.max(
          0,
          Math.min(100 - field.width, startFieldX + dx),
        );
        currentY = Math.max(
          0,
          Math.min(100 - field.height, startFieldY + dy),
        );
        fieldEl.style.left = `${currentX}%`;
        fieldEl.style.top = `${currentY}%`;
      }

      function onMouseUp(ev: MouseEvent) {
        unlockDragSurface();
        const moved =
          Math.abs(ev.clientX - startMouseX) > 3 ||
          Math.abs(ev.clientY - startMouseY) > 3;

        const fieldRect = fieldEl.getBoundingClientRect();
        fieldEl.style.left = '';
        fieldEl.style.top = '';

        if (moved) {
          const drop =
            resolvePageDropTarget(
              fieldRect.left,
              fieldRect.top,
              field.width,
              field.height,
              fieldRect.left + fieldRect.width / 2,
              fieldRect.top + fieldRect.height / 2,
            ) ?? { pageNumber, x: currentX, y: currentY };
          justDraggedRef.current = true;
          onFormFieldMove?.(field.id, drop.pageNumber, drop.x, drop.y);
          setTimeout(() => {
            justDraggedRef.current = false;
          }, 50);
        }

        window.removeEventListener('mousemove', onMouseMove);
        window.removeEventListener('mouseup', onMouseUp);
      }

      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', onMouseUp);
      return;
    }

    const unlockDragSurface = lockDragSurface();
    let currentWidth = startWidth;
    let currentHeight = startHeight;

    function onMouseMove(ev: MouseEvent) {
      ev.preventDefault();
      const overlay = overlayRef.current;
      if (!overlay) return;
      const rect = overlay.getBoundingClientRect();
      const dx = ((ev.clientX - startMouseX) / rect.width) * 100;
      const dy = ((ev.clientY - startMouseY) / rect.height) * 100;

      currentWidth = Math.max(5, Math.min(100 - startFieldX, startWidth + dx));
      currentHeight = Math.max(2, Math.min(100 - startFieldY, startHeight + dy));
      fieldEl.style.width = `${currentWidth}%`;
      fieldEl.style.height = `${currentHeight}%`;
    }

    function onMouseUp(ev: MouseEvent) {
      unlockDragSurface();
      const overlay = overlayRef.current;
      const rect = overlay?.getBoundingClientRect();
      const dx = rect ? ((ev.clientX - startMouseX) / rect.width) * 100 : 0;
      const dy = rect ? ((ev.clientY - startMouseY) / rect.height) * 100 : 0;
      const moved = Math.abs(dx) > 0.3 || Math.abs(dy) > 0.3;

      fieldEl.style.width = '';
      fieldEl.style.height = '';

      if (moved) {
        justDraggedRef.current = true;
        onFormFieldResize?.(field.id, currentWidth, currentHeight);
        setTimeout(() => {
          justDraggedRef.current = false;
        }, 50);
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
    !formFieldPlacementMode &&
    !commentMode &&
    !fieldEditMode &&
    !formFieldEditMode &&
    !templateEditMode;

  const overlayInteractive =
    templateEditMode ||
    placementMode ||
    fieldPlacementMode ||
    formFieldPlacementMode ||
    formFieldEditMode ||
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
          data-pdf-page-overlay
          onClick={handleClick}
          className="absolute inset-0"
          style={{
            cursor: templateEditMode
              ? (onTemplateFieldAdd ? 'crosshair' : 'default')
              : placementMode ||
                  fieldPlacementMode ||
                  formFieldPlacementMode ||
                  commentMode
                ? 'crosshair'
                : 'default',
            pointerEvents: overlayInteractive ? 'auto' : 'none',
          }}
        >
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
            const selectableForEdit = fieldEditMode && !field.signed;
            const selectedForEdit = movableSignatureFieldId === field._id;
            const draggable =
              selectableForEdit && !!(onFieldMove || onFieldResize);
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
                    : selectedForEdit
                      ? '2px solid #2563eb'
                      : isMine
                        ? '2px dashed #2563eb'
                        : '2px dashed #9ca3af',
                  background: field.signed
                    ? 'rgba(16, 185, 129, 0.12)'
                    : selectedForEdit
                      ? 'rgba(37, 99, 235, 0.14)'
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
                  onClick={(e) => e.stopPropagation()}
                  style={{
                    ...boxStyle,
                    cursor: 'move',
                    pointerEvents: 'auto',
                    zIndex: 15,
                  }}
                >
                  {labelEl}
                  {onFieldResize && (
                    <div
                      title={t('document.dragToMoveField')}
                      onMouseDown={(e) => {
                        e.stopPropagation();
                        startSignatureFieldDrag(e, field, 'resize');
                      }}
                      onClick={(e) => e.stopPropagation()}
                      style={{
                        position: 'absolute',
                        bottom: -1,
                        right: -1,
                        width: 8,
                        height: 8,
                        background: '#2563eb',
                        cursor: 'se-resize',
                        borderRadius: '2px 0 2px 0',
                        zIndex: 2,
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
                  cursor:
                    selectableForEdit || clickable ? 'pointer' : 'default',
                  pointerEvents:
                    clickable || fieldPlacementMode || selectableForEdit
                      ? 'auto'
                      : 'none',
                  padding: 0,
                  zIndex: tagHitTargetOnly ? 20 : undefined,
                }}
              >
                {labelEl}
              </button>
            );
          })}
          {formFields?.map((field) => {
            const value = formValues?.[field.id]?.trim();
            const highlighted = activeFormFieldId === field.id;
            const editable =
              formFieldEditMode && editableFormFieldSet.has(field.id);
            const selected = activeFormFieldId === field.id;
            const draggable =
              editable && !!(onFormFieldMove || onFormFieldResize);
            return (
              <div
                key={field.id}
                data-ffield={field.id}
                title={
                  draggable
                    ? `${field.label} – ${t('document.dragToMoveField')}`
                    : editable
                      ? `${field.label} – ${t('document.clickFieldToSelect')}`
                      : field.label
                }
                onMouseDown={
                  draggable
                    ? (e) => {
                        onFormFieldSelect?.(field.id);
                        startFormFieldDrag(e, field, 'move');
                      }
                    : undefined
                }
                onClick={
                  editable
                    ? (e) => {
                        e.stopPropagation();
                        if (!draggable) onFormFieldSelect?.(field.id);
                      }
                    : undefined
                }
                style={{
                  position: 'absolute',
                  left: `${field.x}%`,
                  top: `${field.y}%`,
                  width: `${field.width}%`,
                  minHeight: `${field.height}%`,
                  border: highlighted
                    ? '2px solid #2563eb'
                    : draggable
                      ? '2px dashed #2563eb'
                      : value
                        ? '1px solid transparent'
                        : '1px dashed rgba(37, 99, 235, 0.35)',
                  background: value
                    ? 'transparent'
                    : draggable
                      ? 'rgba(37, 99, 235, 0.08)'
                      : 'rgba(37, 99, 235, 0.04)',
                  borderRadius: 4,
                  boxSizing: 'border-box',
                  pointerEvents: editable ? 'auto' : 'none',
                  overflow: 'visible',
                  display: 'flex',
                  alignItems: 'center',
                  padding: '0 2px',
                  cursor: draggable ? 'move' : editable ? 'pointer' : undefined,
                  userSelect: 'none',
                  zIndex: editable ? 25 : 5,
                }}
              >
                {editable && (
                  <span
                    style={{
                      position: 'absolute',
                      top: -18,
                      left: 0,
                      fontSize: 10,
                      lineHeight: 1,
                      color: '#1d4ed8',
                      whiteSpace: 'nowrap',
                      pointerEvents: 'none',
                      background: 'rgba(255,255,255,0.9)',
                      padding: '1px 3px',
                      borderRadius: 2,
                    }}
                  >
                    {field.label}
                  </span>
                )}
                {field.type === 'checkbox' ? (
                  <span
                    style={{
                      width: '100%',
                      textAlign: 'center',
                      fontSize: 12,
                      lineHeight: 1,
                      color: '#15803d',
                      fontWeight: 700,
                      pointerEvents: 'none',
                    }}
                  >
                    {value && value !== 'false' ? '✓' : ''}
                  </span>
                ) : value ? (
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
                      pointerEvents: 'none',
                    }}
                  >
                    {value}
                  </span>
                ) : null}
                {draggable && onFormFieldResize && (
                  <div
                    role="presentation"
                    onMouseDown={(e) => {
                      e.stopPropagation();
                      startFormFieldDrag(e, field, 'resize');
                    }}
                    onClick={(e) => e.stopPropagation()}
                    style={{
                      position: 'absolute',
                      right: 0,
                      bottom: 0,
                      width: 10,
                      height: 10,
                      cursor: 'se-resize',
                      background: '#2563eb',
                      borderRadius: '2px 0 2px 0',
                    }}
                  />
                )}
              </div>
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
