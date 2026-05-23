'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import type {
  CommentDto,
  DocumentDto,
  SignatureDto,
  SignatureFieldDto,
  SignerDto,
} from '@docflow/shared';
import { resolveFormTemplateFields } from '@docflow/shared';

import { DocumentFormFillPanel } from '@/components/documents/DocumentFormFillPanel';
import { PDFViewer } from '@/components/pdf/PDFViewer';
import { StatusBadge } from '@/components/StatusBadge';
import { useApiClient } from '@/lib/api-client';
import { useTranslation } from '@/lib/i18n/LocaleProvider';
import { useDocumentSocket } from '@/lib/socket';
import { useTemplatePdfUrl } from '@/lib/use-template-pdf-url';
import {
  createMissingTemplateFields,
  listSignatureSigners,
  signersMissingFields,
} from '@/lib/signature-field-mapping';

interface Props {
  doc: DocumentDto;
  initialSignatures: SignatureDto[];
  initialSignatureFields: SignatureFieldDto[];
  initialComments: CommentDto[];
  myClerkId: string;
  myEmail: string;
}

interface PendingPlacement {
  page: number;
  x: number;
  y: number;
  signatureFieldId?: string;
  width?: number;
  height?: number;
}

export function DocumentViewerClient({
  doc: initialDoc,
  initialSignatures,
  initialSignatureFields,
  initialComments,
  myClerkId,
  myEmail,
}: Props) {
  const api = useApiClient();
  const router = useRouter();
  const { t } = useTranslation();
  const [doc, setDoc] = useState<DocumentDto>(initialDoc);
  const [signatures, setSignatures] = useState<SignatureDto[]>(initialSignatures);
  const [signatureFields, setSignatureFields] = useState<SignatureFieldDto[]>(
    initialSignatureFields,
  );
  const [comments, setComments] = useState<CommentDto[]>(initialComments);
  const [sidebarTab, setSidebarTab] = useState<'workflow' | 'comments' | 'form'>('workflow');
  const [placementMode, setPlacementMode] = useState(false);
  const [fieldPlacementMode, setFieldPlacementMode] = useState(false);
  const [commentMode, setCommentMode] = useState(false);
  const [selectedSignerKey, setSelectedSignerKey] = useState('');
  const [pendingPlacement, setPendingPlacement] = useState<PendingPlacement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [resendBusy, setResendBusy] = useState<string | null>(null);
  const [submitBusy, setSubmitBusy] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [autoMapBusy, setAutoMapBusy] = useState(false);
  const [summaryBusy, setSummaryBusy] = useState(false);
  const [formSaveBusy, setFormSaveBusy] = useState(false);
  const autoMapOnLoadRef = useRef(false);

  const formFields = resolveFormTemplateFields(doc.formTemplateId);
  const hasForm = formFields.length > 0;
  const isTemplateDoc = !!doc.formTemplateId;
  const { pdfUrl: templatePdfUrl, loading: templatePdfLoading } =
    useTemplatePdfUrl(doc.formTemplateId && !doc.fileUrl ? doc.formTemplateId : null);
  const viewerPdfUrl = doc.fileUrl ?? templatePdfUrl;

  const signatureSigners = listSignatureSigners(doc);
  const unmappedSigners = signersMissingFields(doc, signatureFields);
  const allSignersMapped =
    signatureSigners.length > 0 && unmappedSigners.length === 0;

  useDocumentSocket(doc._id, {
    'signer:signed': () => refreshDoc(),
    'signer:rejected': () => refreshDoc(),
    'step:completed': () => refreshDoc(),
    'document:status_changed': () => refreshDoc(),
    'comment:added': () => refreshComments(),
    'comment:resolved': () => refreshComments(),
  });

  async function refreshDoc() {
    try {
      const fresh = await api.get<DocumentDto>(`/documents/${doc._id}`);
      setDoc(fresh);
      const sigs = await api.get<SignatureDto[]>(`/documents/${doc._id}/signatures`);
      setSignatures(sigs);
      const fields = await api.get<SignatureFieldDto[]>(
        `/documents/${doc._id}/signature-fields`,
      );
      setSignatureFields(fields);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(err);
    }
  }

  async function refreshComments() {
    try {
      const cs = await api.get<CommentDto[]>(`/documents/${doc._id}/comments`);
      setComments(cs);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(err);
    }
  }

  async function generateSummary() {
    setSummaryBusy(true);
    setError(null);
    try {
      const { summary } = await api.post<{ summary: string }>(
        `/documents/${doc._id}/summarize`,
      );
      setDoc((prev) => ({ ...prev, description: summary }));
    } catch (err) {
      setError(err instanceof Error ? err.message : t('document.summarizeFailed'));
    } finally {
      setSummaryBusy(false);
    }
  }

  const activeStep = doc.workflowSteps.find(
    (s) => s.stepNumber === doc.currentStep,
  );
  const mySignerInActiveStep = activeStep?.signers.find(
    (s) =>
      s.status === 'pending' &&
      (s.clerkId === myClerkId || s.email === myEmail),
  );
  const canSign = !!mySignerInActiveStep && doc.status === 'pending_signature';
  const isOwner = doc.ownerId === myClerkId;
  const isDraft = doc.status === 'draft';

  const myAssignedFields =
    mySignerInActiveStep && activeStep
      ? signatureFields.filter(
          (f) =>
            f.stepId === activeStep._id &&
            f.signerId === mySignerInActiveStep._id &&
            !f.signed,
        )
      : [];
  const usesAssignedFields = myAssignedFields.length > 0;

  const signerOptions = doc.workflowSteps.flatMap((step) =>
    step.signers.map((signer) => ({
      key: `${step._id}:${signer._id}`,
      stepId: step._id,
      signerId: signer._id,
      label: `${signer.name ?? signer.email} (${step.label})`,
    })),
  );

  async function uploadSignatureBlob(blob: Blob): Promise<string> {
    const { uploadUrl, imageKey } = await api.post<{
      uploadUrl: string;
      imageKey: string;
    }>(`/documents/${doc._id}/signatures/upload-url`);
    const res = await fetch(uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': 'image/png' },
      body: blob,
    });
    if (!res.ok) throw new Error(t('document.storageUploadFailed', { status: res.status }));
    return imageKey;
  }


  async function startFieldAssignment() {
    if (!isOwner || !isDraft) return;
    setError(null);
    setCommentMode(false);
    setPlacementMode(false);
    if (!selectedSignerKey && signerOptions.length > 0) {
      setSelectedSignerKey(signerOptions[0].key);
    }
    setFieldPlacementMode(true);
  }

  async function onFieldPlace(page: number, x: number, y: number) {
    if (!fieldPlacementMode || !selectedSignerKey) return;
    const selected = signerOptions.find((o) => o.key === selectedSignerKey);
    if (!selected) return;
    setError(null);
    try {
      const field = await api.post<SignatureFieldDto>(
        `/documents/${doc._id}/signature-fields`,
        {
          stepId: selected.stepId,
          signerId: selected.signerId,
          pageNumber: page,
          x,
          y,
        },
      );
      setSignatureFields((prev) => [...prev, field]);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('document.addFieldFailed'));
    }
  }

  async function removeField(fieldId: string) {
    setError(null);
    try {
      await api.delete(`/documents/${doc._id}/signature-fields/${fieldId}`);
      setSignatureFields((prev) => prev.filter((f) => f._id !== fieldId));
    } catch (err) {
      setError(err instanceof Error ? err.message : t('document.removeFieldFailed'));
    }
  }

  async function autoMapSignersFromTemplate() {
    if (!isOwner || !isDraft) return;
    setAutoMapBusy(true);
    setError(null);
    try {
      const created = await createMissingTemplateFields(
        doc,
        signatureFields,
        (mapping) =>
          api.post<SignatureFieldDto>(
            `/documents/${doc._id}/signature-fields`,
            mapping,
          ),
      );
      if (created.length > 0) {
        setSignatureFields((prev) => [...prev, ...created]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('document.mapSignersFailed'));
    } finally {
      setAutoMapBusy(false);
    }
  }

  useEffect(() => {
    if (autoMapOnLoadRef.current || isTemplateDoc) return;
    if (!isOwner || !isDraft) return;
    if (signersMissingFields(doc, signatureFields).length === 0) return;
    autoMapOnLoadRef.current = true;
    void autoMapSignersFromTemplate();
  }, [doc._id, isTemplateDoc]);

  async function saveFormValues(values: Record<string, string>) {
    setFormSaveBusy(true);
    setError(null);
    try {
      const fresh = await api.patch<DocumentDto>(`/documents/${doc._id}/form-values`, {
        values,
      });
      setDoc(fresh);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('document.saveFormFailed'));
      throw err;
    } finally {
      setFormSaveBusy(false);
    }
  }

  async function deleteDocument() {
    if (!window.confirm(t('document.deleteConfirm', { title: doc.title }))) return;
    setDeleteBusy(true);
    setError(null);
    try {
      await api.delete(`/documents/${doc._id}`);
      router.push('/dashboard');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('document.deleteFailed'));
    } finally {
      setDeleteBusy(false);
    }
  }

  async function submitDocument() {
    if (!isTemplateDoc && unmappedSigners.length > 0) {
      const names = unmappedSigners
        .map((s) => s.name ?? s.email)
        .join(', ');
      setError(t('document.mapAllSigners', { names }));
      return;
    }
    setSubmitBusy(true);
    setError(null);
    try {
      const fresh = await api.patch<DocumentDto>(`/documents/${doc._id}/submit`);
      setDoc(fresh);
      setFieldPlacementMode(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('document.submitFailed'));
    } finally {
      setSubmitBusy(false);
    }
  }

  /** Renders the signer's name + current date onto a canvas and returns a PNG blob. */
  function buildAutoSignatureBlob(name: string): Promise<Blob> {
    return new Promise((resolve, reject) => {
      const W = 400;
      const H = 120;
      const canvas = document.createElement('canvas');
      canvas.width = W;
      canvas.height = H;
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#111';
      ctx.font = 'italic 46px "Dancing Script", Georgia, cursive';
      ctx.textBaseline = 'middle';
      ctx.fillText(name, 14, H * 0.44);
      ctx.font = '13px system-ui, sans-serif';
      ctx.fillStyle = '#555';
      const dateStr = new Date().toLocaleDateString();
      ctx.fillText(dateStr, 14, H * 0.82);
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('canvas toBlob failed'))), 'image/png');
    });
  }

  /**
   * One-click sign: generates a name+date image and places it on every
   * assigned field for this signer (or at the given free-placement spot).
   */
  async function autoSign(
    fields?: Array<{ page: number; x: number; y: number; w?: number; h?: number; fieldId?: string }>,
  ) {
    if (!activeStep || !mySignerInActiveStep) return;
    const signerName = mySignerInActiveStep.name ?? myEmail;
    setError(null);
    try {
      const blob = await buildAutoSignatureBlob(signerName);
      const imageKey = await uploadSignatureBlob(blob);
      const targets = fields ?? myAssignedFields.map((f) => ({
        page: f.pageNumber,
        x: f.x,
        y: f.y,
        w: f.width,
        h: f.height,
        fieldId: f._id,
      }));
      for (const t of targets) {
        const newSig = await api.post<SignatureDto>(`/documents/${doc._id}/sign`, {
          documentId: doc._id,
          stepId: activeStep._id,
          pageNumber: t.page,
          x: t.x,
          y: t.y,
          width: t.w ?? 15,
          height: t.h ?? 6,
          imageKey,
          signatureFieldId: t.fieldId,
        });
        setSignatures((prev) => [...prev, newSig]);
      }
      setPlacementMode(false);
      setPendingPlacement(null);
      await refreshDoc();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('document.recordSignatureFailed'));
    }
  }

  function onPlace(page: number, x: number, y: number) {
    if (!placementMode) return;
    // Auto-sign immediately at the clicked location — no pad needed
    void autoSign([{ page, x, y }]);
    setPlacementMode(false);
  }

  function onFieldClick(field: SignatureFieldDto) {
    if (!canSign || !mySignerInActiveStep) return;
    if (field.signerId !== mySignerInActiveStep._id) return;
    void autoSign([{
      page: field.pageNumber,
      x: field.x,
      y: field.y,
      w: field.width,
      h: field.height,
      fieldId: field._id,
    }]);
  }

  async function onAddComment(content: string, page?: number, x?: number, y?: number) {
    try {
      const c = await api.post<CommentDto>(`/documents/${doc._id}/comments`, {
        content,
        type: page !== undefined ? 'annotation' : 'general',
        pageNumber: page,
        x,
        y,
      });
      setComments((prev) => [...prev, c]);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('document.addCommentFailed'));
    }
  }

  return (
    <main className="flex min-h-0 flex-1 flex-col">
      <header className="flex items-center justify-between border-b px-6 py-3">
        <div>
          <h1 className="text-lg font-semibold">{doc.title}</h1>
          <div className="mt-0.5 flex items-center gap-2 text-xs">
            <StatusBadge status={doc.status} />
            {activeStep && (
              <span className="text-gray-500">
                {t('document.currentStep', { label: activeStep.label })}
              </span>
            )}
          </div>
        </div>
        {isOwner && (
          <button
            type="button"
            onClick={deleteDocument}
            disabled={deleteBusy}
            className="rounded border border-red-300 px-3 py-1.5 text-sm text-red-700 hover:bg-red-50 disabled:opacity-50"
          >
            {deleteBusy ? t('common.deleting') : t('document.deleteDocument')}
          </button>
        )}
      </header>

      {error && (
        <div className="border-b border-red-300 bg-red-50 px-6 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      {doc.description ? (
        <div className="border-b bg-gray-50 px-6 py-3 text-sm text-gray-700">
          <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
            {t('document.summary')}
          </p>
          <p className="mt-1 whitespace-pre-wrap leading-relaxed">{doc.description}</p>
        </div>
      ) : isOwner ? (
        <div className="border-b bg-gray-50 px-6 py-3 text-sm">
          <button
            type="button"
            onClick={generateSummary}
            disabled={summaryBusy}
            className="rounded border border-gray-300 bg-white px-3 py-1.5 text-sm hover:bg-gray-100 disabled:opacity-50"
          >
            {summaryBusy ? t('newDocument.summarizing') : t('document.generateSummary')}
          </button>
        </div>
      ) : null}

      {isOwner && isDraft && !isTemplateDoc && (
        <div className="border-b border-blue-200 bg-blue-50 px-6 py-3 text-sm text-blue-900">
          <strong>{t('document.mapBeforeSendTitle')}</strong>{' '}
          {t('document.mapBeforeSendBody')}
        </div>
      )}

      {isOwner && isDraft && isTemplateDoc && (
        <div className="border-b border-emerald-200 bg-emerald-50 px-6 py-3 text-sm text-emerald-900">
          {t('document.templateSignersReady')}
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">
        <section className="flex-1 overflow-auto bg-gray-50 p-4">
          {templatePdfLoading && !viewerPdfUrl && (
            <p className="py-16 text-center text-sm text-gray-500">
              {t('pdf.loading')}
            </p>
          )}
          {viewerPdfUrl && (
            <PDFViewer
              pdfUrl={viewerPdfUrl}
              signatures={signatures}
              signatureFields={signatureFields}
              comments={comments}
              formFields={formFields}
              formValues={doc.formValues}
              placementMode={placementMode}
              fieldPlacementMode={fieldPlacementMode}
              commentMode={commentMode}
              activeSignerId={canSign ? mySignerInActiveStep?._id : null}
              onSignaturePlace={onPlace}
              onFieldPlace={onFieldPlace}
              onFieldClick={onFieldClick}
              onCommentPin={async (page, x, y) => {
                const content = window.prompt(t('document.commentPrompt'));
                if (content) await onAddComment(content, page, x, y);
                setCommentMode(false);
              }}
            />
          )}
          {!isTemplateDoc && (fieldPlacementMode || isDraft) && (
            <div className="mx-auto mt-4 max-w-3xl rounded border border-gray-200 bg-white p-3 text-sm">
              <div className="mb-2 font-medium">{t('document.signerMapping')}</div>
              <ul className="mb-3 space-y-1">
                {signatureSigners.map((signer) => {
                  const mapped = signatureFields.some(
                    (field) =>
                      field.stepId === signer.stepId &&
                      field.signerId === signer.signerId,
                  );
                  return (
                    <li
                      key={`${signer.stepId}:${signer.signerId}`}
                      className="flex items-center justify-between rounded bg-gray-50 px-2 py-1 text-xs"
                    >
                      <span>
                        {mapped ? '✓' : '○'}{' '}
                        {signer.name ?? signer.email}{' '}
                        <span className="text-gray-500">({signer.stepLabel})</span>
                      </span>
                      <span className={mapped ? 'text-green-600' : 'text-amber-600'}>
                        {mapped ? t('document.mapped') : t('document.notMapped')}
                      </span>
                    </li>
                  );
                })}
              </ul>
              {signatureFields.length > 0 && (
                <>
                  <div className="mb-2 font-medium">{t('document.placedFields')}</div>
                  <ul className="space-y-1">
                    {signatureFields.map((field) => (
                      <li
                        key={field._id}
                        className="flex items-center justify-between rounded bg-gray-50 px-2 py-1 text-xs"
                      >
                        <span>
                          {t('document.page', { n: field.pageNumber })}:{' '}
                          {field.signerName ?? field.signerEmail}
                          {field.signed && (
                            <span className="ms-2 text-green-600">
                              {t('document.signed')}
                            </span>
                          )}
                        </span>
                        {isDraft && isOwner && !field.signed && (
                          <button
                            type="button"
                            onClick={() => removeField(field._id)}
                            className="text-red-600 hover:underline"
                          >
                            {t('common.remove')}
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          )}
          <div className="sticky bottom-4 mt-4 flex flex-wrap justify-center gap-2">
            {isOwner && isDraft && !fieldPlacementMode && (
              <>
                {!isTemplateDoc && (
                  <>
                    <button
                      onClick={autoMapSignersFromTemplate}
                      disabled={autoMapBusy || allSignersMapped}
                      className="rounded border border-emerald-600 bg-emerald-50 px-5 py-2 text-sm font-medium text-emerald-800 shadow disabled:opacity-50"
                    >
                      {autoMapBusy ? t('common.mapping') : t('document.autoMapSigners')}
                    </button>
                    <button
                      onClick={startFieldAssignment}
                      className="rounded border border-blue-600 bg-white px-5 py-2 text-sm font-medium text-blue-700 shadow"
                    >
                      {t('document.assignManually')}
                    </button>
                  </>
                )}
                <button
                  onClick={submitDocument}
                  disabled={submitBusy || (!isTemplateDoc && !allSignersMapped)}
                  className="rounded bg-black px-5 py-2 text-sm font-medium text-white shadow disabled:opacity-50"
                >
                  {submitBusy ? t('common.sending') : t('document.sendToSigners')}
                </button>
              </>
            )}
            {!isTemplateDoc && fieldPlacementMode && (
              <div className="flex flex-wrap items-center justify-center gap-2 rounded bg-white px-4 py-2 shadow">
                <label className="text-sm text-gray-600">
                  {t('document.assignTo')}
                  <select
                    className="ml-2 rounded border border-gray-300 px-2 py-1 text-sm"
                    value={selectedSignerKey}
                    onChange={(e) => setSelectedSignerKey(e.target.value)}
                  >
                    {signerOptions.map((option) => (
                      <option key={option.key} value={option.key}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <span className="text-xs text-gray-500">
                  {t('document.clickToPlaceField')}
                </span>
                <button
                  onClick={() => setFieldPlacementMode(false)}
                  className="rounded bg-gray-200 px-4 py-1 text-sm"
                >
                  {t('common.done')}
                </button>
              </div>
            )}
            {canSign && usesAssignedFields && (
              <button
                onClick={() => void autoSign()}
                className="rounded bg-black px-6 py-2 text-sm font-medium text-white shadow hover:bg-gray-800"
              >
                ✍ {t('document.signDocument')}
              </button>
            )}
            {canSign && !usesAssignedFields && !placementMode && (
              <button
                onClick={() => setPlacementMode(true)}
                className="rounded bg-black px-6 py-2 text-sm font-medium text-white shadow hover:bg-gray-800"
              >
                ✍ {t('document.signDocument')}
              </button>
            )}
            {!usesAssignedFields && placementMode && (
              <div className="flex items-center gap-2 rounded bg-blue-50 px-4 py-2 text-sm text-blue-800 shadow">
                <span>{t('document.clickToPlaceSignature')}</span>
                <button
                  onClick={() => setPlacementMode(false)}
                  className="rounded bg-gray-200 px-3 py-1 text-xs text-gray-700"
                >
                  {t('document.cancelPlacement')}
                </button>
              </div>
            )}
            <button
              onClick={() => {
                setCommentMode((v) => !v);
                setPlacementMode(false);
                setFieldPlacementMode(false);
              }}
              className={`rounded px-5 py-2 text-sm shadow ${
                commentMode ? 'bg-amber-500 text-white' : 'bg-white border'
              }`}
            >
              {commentMode ? t('document.cancelComment') : t('document.addComment')}
            </button>
          </div>
        </section>

        <aside className="w-[360px] overflow-auto border-l bg-white">
          <div className="flex border-b text-sm">
            <TabButton
              active={sidebarTab === 'workflow'}
              onClick={() => setSidebarTab('workflow')}
            >
              {t('document.workflow')}
            </TabButton>
            {hasForm && (
              <TabButton
                active={sidebarTab === 'form'}
                onClick={() => setSidebarTab('form')}
              >
                {t('document.formTab')}
              </TabButton>
            )}
            <TabButton
              active={sidebarTab === 'comments'}
              onClick={() => setSidebarTab('comments')}
            >
              {t('document.comments')}
            </TabButton>
          </div>
          {sidebarTab === 'form' && hasForm && (
            <div className="p-4">
              <DocumentFormFillPanel
                fields={formFields}
                values={doc.formValues ?? {}}
                readOnly={!isOwner || !isDraft}
                saving={formSaveBusy}
                onSave={saveFormValues}
              />
            </div>
          )}
          {sidebarTab === 'workflow' && (
            <WorkflowSidebar
              doc={doc}
              isOwner={isOwner}
              onSkip={async (stepId, signerId, email) => {
                setError(null);
                await api.patch(
                  `/documents/${doc._id}/steps/${stepId}/signers/${signerId}/skip`,
                  undefined,
                  { email },
                );
                await refreshDoc();
              }}
              onResend={async (stepId, signerId, email) => {
                setError(null);
                setResendBusy(signerId);
                try {
                  await api.post(
                    `/documents/${doc._id}/steps/${stepId}/signers/${signerId}/resend`,
                    undefined,
                    { email },
                  );
                  await refreshDoc();
                } catch (err) {
                  setError(
                    err instanceof Error ? err.message : t('document.resendFailed'),
                  );
                } finally {
                  setResendBusy(null);
                }
              }}
              resendBusy={resendBusy}
            />
          )}
          {sidebarTab === 'comments' && (
            <CommentsSidebar
              comments={comments}
              onAdd={(content) => onAddComment(content)}
              onResolve={async (id) => {
                await api.patch(`/comments/${id}/resolve`);
                await refreshComments();
              }}
            />
          )}
        </aside>
      </div>

    </main>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 px-4 py-2 ${
        active ? 'border-b-2 border-black font-medium' : 'text-gray-500'
      }`}
    >
      {children}
    </button>
  );
}

function WorkflowSidebar({
  doc,
  isOwner,
  onSkip,
  onResend,
  resendBusy,
}: {
  doc: DocumentDto;
  isOwner: boolean;
  onSkip: (stepId: string, signerId: string, email: string) => void;
  onResend: (stepId: string, signerId: string, email: string) => void;
  resendBusy: string | null;
}) {
  const { t } = useTranslation();

  return (
    <ol className="space-y-4 p-4">
      {doc.workflowSteps.map((step) => (
        <li key={step._id} className="rounded border border-gray-200 p-3">
          <div className="mb-2 flex items-center justify-between text-sm font-medium">
            <span>{step.label}</span>
            <span className="text-xs text-gray-500">
              {t(`workflowStepStatus.${step.status}`)}
            </span>
          </div>
          <ul className="space-y-1 text-xs">
            {step.signers.map((s) => (
              <SignerRow
                key={s._id}
                signer={s}
                showOwnerControls={isOwner && step.status === 'in_progress' && s.status === 'pending'}
                resendLoading={resendBusy === s._id}
                onSkip={() => onSkip(step._id, s._id, s.email)}
                onResend={() => onResend(step._id, s._id, s.email)}
              />
            ))}
          </ul>
        </li>
      ))}
    </ol>
  );
}

function SignerRow({
  signer,
  showOwnerControls,
  resendLoading,
  onSkip,
  onResend,
}: {
  signer: SignerDto;
  showOwnerControls: boolean;
  resendLoading: boolean;
  onSkip: () => void;
  onResend: () => void;
}) {
  const { t } = useTranslation();
  const icon = (() => {
    switch (signer.status) {
      case 'signed':
        return '✓';
      case 'rejected':
        return '✗';
      case 'skipped':
        return '—';
      default:
        return '⏳';
    }
  })();
  return (
    <li className="flex items-center justify-between rounded bg-gray-50 px-2 py-1">
      <span title={t(`signerStatus.${signer.status}`)}>
        <span className="mr-1">{icon}</span>
        {signer.email}
      </span>
      {showOwnerControls && (
        <span className="flex gap-1">
          <button
            type="button"
            onClick={onResend}
            disabled={resendLoading}
            className="text-blue-600 hover:underline disabled:opacity-50"
          >
            {resendLoading ? t('common.sending') : t('common.resend')}
          </button>
          <button
            type="button"
            onClick={onSkip}
            className="text-gray-600 hover:underline"
          >
            {t('common.skip')}
          </button>
        </span>
      )}
    </li>
  );
}

function CommentsSidebar({
  comments,
  onAdd,
  onResolve,
}: {
  comments: CommentDto[];
  onAdd: (content: string) => void;
  onResolve: (id: string) => void;
}) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState('');

  const tree = buildCommentTree(comments);

  return (
    <div className="flex h-full flex-col">
      <ul className="flex-1 space-y-3 overflow-auto p-4 text-sm">
        {tree.map((c) => (
          <CommentNode key={c._id} comment={c} onResolve={onResolve} />
        ))}
      </ul>
      <div className="border-t p-3">
        <textarea
          rows={2}
          placeholder={t('document.addCommentPlaceholder')}
          className="w-full rounded border border-gray-300 px-2 py-1 text-sm"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
        />
        <button
          onClick={() => {
            if (draft.trim()) {
              onAdd(draft.trim());
              setDraft('');
            }
          }}
          className="mt-1 rounded bg-black px-3 py-1 text-xs text-white"
        >
          {t('common.post')}
        </button>
      </div>
    </div>
  );
}

interface CommentNode extends CommentDto {
  children: CommentNode[];
}

function buildCommentTree(flat: CommentDto[]): CommentNode[] {
  const byId = new Map<string, CommentNode>();
  for (const c of flat) byId.set(c._id, { ...c, children: [] });
  const roots: CommentNode[] = [];
  for (const c of byId.values()) {
    if (c.parentId && byId.has(c.parentId)) {
      byId.get(c.parentId)!.children.push(c);
    } else {
      roots.push(c);
    }
  }
  return roots;
}

function CommentNode({
  comment,
  onResolve,
}: {
  comment: CommentNode;
  onResolve: (id: string) => void;
}) {
  const { t } = useTranslation();
  return (
    <li className="rounded border border-gray-200 p-2">
      <div className="text-xs text-gray-500">
        {comment.authorEmail}
        {comment.resolved && (
          <span className="ms-2 text-green-600">{t('document.resolved')}</span>
        )}
      </div>
      <div className="mt-1 whitespace-pre-wrap">{comment.content}</div>
      {!comment.resolved && (
        <button
          onClick={() => onResolve(comment._id)}
          className="mt-1 text-xs text-gray-600 hover:underline"
        >
          {t('common.resolve')}
        </button>
      )}
      {comment.children.length > 0 && (
        <ul className="ms-3 mt-2 space-y-2 border-s ps-3">
          {comment.children.map((child) => (
            <CommentNode key={child._id} comment={child} onResolve={onResolve} />
          ))}
        </ul>
      )}
    </li>
  );
}
