'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import type { DocumentDto, PdfTemplateDto } from '@docflow/shared';
import {
  HAKNASOT_FORM_TEMPLATE_ID,
  HAKNASOT_SAMPLE_FORM_VALUES,
  HEBREW_SAMPLE_DEFAULT_TITLE,
  resolveFormTemplateFields,
} from '@docflow/shared';

import { DocumentFormFillPanel } from '@/components/documents/DocumentFormFillPanel';
import {
  WorkflowStepEditor,
  stepTypeLabel,
  type SignerInput,
  type WorkflowStepInput,
} from '@/components/documents/WorkflowStepEditor';
import { PDFViewer } from '@/components/pdf/PDFViewer';
import { useUser } from '@clerk/nextjs';
import { useApiClient } from '@/lib/api-client';
import { useTranslation } from '@/lib/i18n/LocaleProvider';
import { downloadHaknasotPdf } from '@/lib/generate-haknasot-pdf';
import { getPdfPageCount } from '@/lib/pdf-page-count';
import { useTemplatePdfUrl } from '@/lib/use-template-pdf-url';

type Step = 'start' | 'form' | 'details' | 'workflow' | 'review';
type DocSource = 'template' | 'upload' | 'saved_pdf';

export function NewDocumentClient() {
  const router = useRouter();
  const api = useApiClient();
  const { t } = useTranslation();
  const { user: clerkUser } = useUser();
  const [step, setStep] = useState<Step>('start');
  const [documentId, setDocumentId] = useState<string | null>(null);
  const [title, setTitle] = useState(HEBREW_SAMPLE_DEFAULT_TITLE);
  const [description, setDescription] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [steps, setSteps] = useState<WorkflowStepInput[]>([]);
  const [summarizing, setSummarizing] = useState(false);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [formValues, setFormValues] = useState<Record<string, string>>({});
  const [formFields, setFormFields] = useState<ReturnType<typeof resolveFormTemplateFields>>([]);
  const [uploadPdfUrl, setUploadPdfUrl] = useState<string | null>(null);
  const [docSource, setDocSource] = useState<DocSource | null>(null);
  const [extractingSigners, setExtractingSigners] = useState(false);
  const [extractingFormFields, setExtractingFormFields] = useState(false);
  const [savedTemplates, setSavedTemplates] = useState<PdfTemplateDto[]>([]);
  const [currentUserEmail, setCurrentUserEmail] = useState(
    () => clerkUser?.primaryEmailAddress?.emailAddress ?? '',
  );
  const [currentUserName, setCurrentUserName] = useState(
    () => clerkUser?.fullName ?? '',
  );

  useEffect(() => {
    const clerkEmail = clerkUser?.primaryEmailAddress?.emailAddress;
    if (clerkEmail && !currentUserEmail) setCurrentUserEmail(clerkEmail);
    const clerkName = clerkUser?.fullName;
    if (clerkName && !currentUserName) setCurrentUserName(clerkName);
  }, [clerkUser]);

  useEffect(() => {
    api.get<{ email: string; name: string | null }>('/users/me').then((me) => {
      if (me.email) setCurrentUserEmail(me.email);
      if (me.name) setCurrentUserName(me.name);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    api
      .get<PdfTemplateDto[]>('/templates')
      .then((list) => setSavedTemplates(list.filter((t) => !!t.fileUrl)))
      .catch(() => {});
  }, []);

  async function requestSummarize(id: string) {
    setSummarizing(true);
    setSummaryError(null);
    try {
      const { summary } = await api.post<{ summary: string }>(
        `/documents/${id}/summarize`,
      );
      setDescription(summary);
    } catch (err) {
      setSummaryError(
        err instanceof Error ? err.message : t('newDocument.summarizeFailed'),
      );
    } finally {
      setSummarizing(false);
    }
  }

  function hasFilledFormValues(values: Record<string, string>) {
    return Object.values(values).some((value) => value.trim().length > 0);
  }

  async function startHaknasotDocument() {
    setError(null);
    setBusy(true);
    setSummaryError(null);
    setDescription('');
    if (steps.length === 0) {
      setSteps([
        {
          label: 'אישורים',
          stepType: 'approval',
          signers: [],
        },
      ]);
    }
    try {
      const doc = await api.post<DocumentDto>('/documents', {
        title: title || HEBREW_SAMPLE_DEFAULT_TITLE,
        formTemplateId: HAKNASOT_FORM_TEMPLATE_ID,
      });
      setDocumentId(doc._id);
      setTitle(doc.title);
      setDocSource('template');
      const fields = resolveFormTemplateFields(doc.formTemplateId);
      setFormFields(fields);
      setFormValues(doc.formValues ?? {});
      setStep('form');
    } catch (err) {
      setError(err instanceof Error ? err.message : t('newDocument.startFormFailed'));
    } finally {
      setBusy(false);
    }
  }

  function titleFromPdfFile(file: File): string {
    const base = file.name.replace(/\.pdf$/i, '').trim();
    return base || HEBREW_SAMPLE_DEFAULT_TITLE;
  }

  function isPdfFile(file: File): boolean {
    return (
      file.type === 'application/pdf' ||
      file.name.toLowerCase().endsWith('.pdf')
    );
  }

  async function startUploadedDocument(file: File) {
    if (!isPdfFile(file)) {
      setError(t('newDocument.pdfOnly'));
      return;
    }
    setError(null);
    setBusy(true);
    setSummaryError(null);
    setDescription('');
    setDocSource('upload');
    setFormFields([]);
    setFormValues({});
    setUploadPdfUrl(null);
    const docTitle = titleFromPdfFile(file);
    setTitle(docTitle);
    try {
      const { uploadUrl, documentId: newId } = await api.post<{
        uploadUrl: string;
        documentId: string;
      }>('/documents', { title: docTitle });

      const pageCount = await getPdfPageCount(file);
      const uploadRes = await fetch(uploadUrl, {
        method: 'PUT',
        body: file,
        headers: { 'Content-Type': 'application/pdf' },
      });
      if (!uploadRes.ok) {
        throw new Error(t('newDocument.uploadFailed'));
      }

      const confirmed = await api.post<DocumentDto>(`/documents/${newId}/confirm`, {
        fileSize: file.size,
        pageCount,
      });
      setDocumentId(confirmed._id);
      setTitle(confirmed.title);

      setExtractingSigners(true);
      setExtractingFormFields(true);
      let extractedFields: ReturnType<typeof resolveFormTemplateFields> = [];
      try {
        const [signersResult, formResult, docWithUrl] = await Promise.all([
          api.post<{ signers: string[] }>(`/documents/${newId}/extract-signers`),
          api
            .post<{ fields: ReturnType<typeof resolveFormTemplateFields> }>(
              `/documents/${newId}/extract-form-fields`,
            )
            .catch(() => ({ fields: [] as ReturnType<typeof resolveFormTemplateFields> })),
          api.get<DocumentDto>(`/documents/${newId}`),
        ]);
        const { signers } = signersResult;
        extractedFields = formResult.fields;
        if (docWithUrl.fileUrl) setUploadPdfUrl(docWithUrl.fileUrl);
        if (signers.length > 0) {
          setSteps([
            {
              label: t('newDocument.signaturesStepLabel'),
              stepType: 'approval',
              signers: signers.map((name) => ({ email: '', name })),
            },
          ]);
        } else {
          setSteps([
            {
              label: t('newDocument.stepLabel', { n: 1 }),
              stepType: 'signature',
              signers: [],
            },
          ]);
        }
      } catch {
        setSteps([
          {
            label: t('newDocument.stepLabel', { n: 1 }),
            stepType: 'signature',
            signers: [],
          },
        ]);
      } finally {
        setExtractingSigners(false);
        setExtractingFormFields(false);
      }

      if (extractedFields.length > 0) {
        setFormFields(extractedFields);
        setStep('form');
      } else {
        setStep('details');
        void requestSummarize(newId);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('newDocument.uploadFailed'));
      setDocSource(null);
    } finally {
      setBusy(false);
    }
  }

  function signerNamesFromTemplateFields(template: PdfTemplateDto): string[] {
    const seen = new Set<string>();
    const names: string[] = [];
    for (const field of template.fields) {
      const label = field.label.trim();
      if (!label) continue;
      const key = label.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      names.push(label);
    }
    return names;
  }

  async function startFromSavedTemplate(template: PdfTemplateDto) {
    if (!template.fileUrl) {
      setError(t('newDocument.templateNoPdf'));
      return;
    }
    setError(null);
    setBusy(true);
    setSummaryError(null);
    setDescription('');
    setDocSource('saved_pdf');
    setFormFields([]);
    setFormValues({});
    setUploadPdfUrl(template.fileUrl);
    setTitle(template.name);
    try {
      const doc = await api.post<DocumentDto>('/documents', {
        title: template.name,
        pdfTemplateId: template._id,
      });
      setDocumentId(doc._id);
      setTitle(doc.title);
      if (doc.fileUrl) setUploadPdfUrl(doc.fileUrl);

      let signers = signerNamesFromTemplateFields(template);
      if (signers.length === 0) {
        setExtractingSigners(true);
        try {
          const { signers: extracted } = await api.post<{ signers: string[] }>(
            `/documents/${doc._id}/extract-signers`,
          );
          signers = extracted;
        } catch {
          signers = [];
        } finally {
          setExtractingSigners(false);
        }
      }

      if (signers.length > 0) {
        setSteps([
          {
            label: t('newDocument.signaturesStepLabel'),
            stepType: 'approval',
            signers: signers.map((name) => ({ email: '', name })),
          },
        ]);
      } else {
        setSteps([
          {
            label: t('newDocument.stepLabel', { n: 1 }),
            stepType: 'signature',
            signers: [],
          },
        ]);
      }
      setStep('details');
      void requestSummarize(doc._id);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : t('newDocument.startTemplateFailed'),
      );
      setDocSource(null);
      setUploadPdfUrl(null);
    } finally {
      setBusy(false);
    }
  }

  async function handleFormSave(values: Record<string, string>) {
    if (!documentId) return;
    setBusy(true);
    setError(null);
    try {
      const fresh = await api.patch<DocumentDto>(`/documents/${documentId}/form-values`, {
        values,
      });
      setFormValues(fresh.formValues ?? values);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('document.saveFormFailed'));
      throw err;
    } finally {
      setBusy(false);
    }
  }

  async function handleFormNext(values: Record<string, string>) {
    await handleFormSave(values);
    setStep('details');
    if (documentId && hasFilledFormValues(values)) {
      void requestSummarize(documentId);
    }
  }

  async function handleDetailsNext() {
    if (!documentId) return;
    setBusy(true);
    setError(null);
    try {
      await api.patch(`/documents/${documentId}`, { title, description });
      setStep('workflow');
    } catch (err) {
      setError(err instanceof Error ? err.message : t('newDocument.saveDetailsFailed'));
    } finally {
      setBusy(false);
    }
  }

  function addStep() {
    setSteps((prev) => [
      ...prev,
      {
        label: t('newDocument.stepLabel', { n: prev.length + 1 }),
        stepType: 'signature',
        signers: [],
      },
    ]);
  }

  function updateStep(i: number, patch: Partial<WorkflowStepInput>) {
    setSteps((prev) =>
      prev.map((s, idx) => (idx === i ? { ...s, ...patch } : s)),
    );
  }

  function removeStep(i: number) {
    setSteps((prev) => prev.filter((_, idx) => idx !== i));
  }

  function addSigner(stepIndex: number, signer: SignerInput) {
    setSteps((prev) =>
      prev.map((s, idx) =>
        idx === stepIndex ? { ...s, signers: [...s.signers, signer] } : s,
      ),
    );
  }

  function removeSigner(stepIndex: number, signerIndex: number) {
    setSteps((prev) =>
      prev.map((s, idx) =>
        idx === stepIndex
          ? { ...s, signers: s.signers.filter((_, i) => i !== signerIndex) }
          : s,
      ),
    );
  }

  async function submitWorkflow() {
    if (!documentId) return;
    setBusy(true);
    setError(null);
    try {
      for (const s of steps) {
        if (s.signers.length === 0) {
          throw new Error(t('newDocument.stepNoSigners', { label: s.label }));
        }
        const missingEmail = s.signers.filter((sg) => !sg.email.trim());
        if (missingEmail.length > 0) {
          throw new Error(t('newDocument.stepMissingEmail', {
            label: s.label,
            names: missingEmail.map((sg) => sg.name ?? '?').join(', '),
          }));
        }
        const resolvedSigners = s.signers.map((sg) => ({
          ...sg,
          email: sg.email.trim().toLowerCase(),
        }));
        await api.post<DocumentDto>(`/documents/${documentId}/steps`, {
          label: s.label,
          stepType: s.stepType,
          executionMode: 'parallel',
          signers: resolvedSigners,
        });
      }
      router.push(`/documents/${documentId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('newDocument.submissionFailed'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">{t('newDocument.title')}</h1>
      <ProgressIndicator
        current={step}
        docSource={docSource}
        includeFormStep={
          docSource === 'template' ||
          ((docSource === 'upload' || docSource === 'saved_pdf') &&
            formFields.length > 0)
        }
      />
      {error && (
        <div className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {step === 'start' && (
        <StartStep
          savedTemplates={savedTemplates}
          onStart={startHaknasotDocument}
          onUploadPdf={startUploadedDocument}
          onSelectSavedTemplate={startFromSavedTemplate}
          busy={busy || extractingSigners || extractingFormFields}
        />
      )}

      {(extractingSigners || extractingFormFields) && step !== 'start' && (
        <p className="text-sm text-gray-500">
          {extractingFormFields
            ? t('newDocument.extractingFormFields')
            : t('newDocument.extractingSigners')}
        </p>
      )}

      {step === 'form' && docSource === 'template' && formFields.length > 0 && (
        <FormFillStep
          formTemplateId={HAKNASOT_FORM_TEMPLATE_ID}
          fields={formFields}
          values={formValues}
          busy={busy}
          onNext={handleFormNext}
          onSkip={() => setStep('details')}
        />
      )}

      {step === 'form' &&
        docSource === 'upload' &&
        formFields.length > 0 &&
        uploadPdfUrl && (
          <FormFillStep
            pdfUrl={uploadPdfUrl}
            fields={formFields}
            values={formValues}
            busy={busy}
            onNext={handleFormNext}
            onSkip={() => {
              setStep('details');
              if (documentId) void requestSummarize(documentId);
            }}
          />
        )}

      {step === 'details' && (
        <DetailsStep
          title={title}
          description={description}
          onTitle={setTitle}
          onDescription={setDescription}
          onNext={handleDetailsNext}
          onBack={() => {
            if (docSource === 'template' || formFields.length > 0) {
              setStep('form');
            } else {
              setStep('start');
            }
          }}
          summarizing={summarizing}
          summaryError={summaryError}
          busy={busy}
        />
      )}

      {step === 'workflow' && (
        <WorkflowStepEditor
          steps={steps}
          currentUserEmail={currentUserEmail}
          currentUserName={currentUserName}
          onAddStep={addStep}
          onUpdateStep={updateStep}
          onRemoveStep={removeStep}
          onAddSigner={addSigner}
          onRemoveSigner={removeSigner}
          onNext={() => setStep('review')}
          onBack={() => setStep('details')}
        />
      )}

      {step === 'review' && (
        <ReviewStep
          title={title}
          steps={steps}
          busy={busy}
          onBack={() => setStep('workflow')}
          onSubmit={submitWorkflow}
        />
      )}
    </div>
  );
}

function ProgressIndicator({
  current,
  docSource,
  includeFormStep,
}: {
  current: Step;
  docSource: DocSource | null;
  includeFormStep: boolean;
}) {
  const { t } = useTranslation();
  const order: Step[] = includeFormStep
    ? ['start', 'form', 'details', 'workflow', 'review']
    : ['start', 'details', 'workflow', 'review'];
  const stepLabels: Record<Step, string> = {
    start: t('newDocument.stepStart'),
    form: t('newDocument.stepForm'),
    details: t('newDocument.stepDetails'),
    workflow: t('newDocument.stepWorkflow'),
    review: t('newDocument.stepReview'),
  };
  return (
    <ol className="flex items-center gap-2 text-xs text-gray-500">
      {order.map((s, i) => (
        <li key={s} className="flex items-center gap-2">
          <span
            className={`h-6 w-6 rounded-full text-center leading-6 ${
              order.indexOf(current) >= i
                ? 'bg-black text-white'
                : 'bg-gray-200 text-gray-600'
            }`}
          >
            {i + 1}
          </span>
          <span>{stepLabels[s]}</span>
          {i < order.length - 1 && <span className="mx-2 rtl-flip">›</span>}
        </li>
      ))}
    </ol>
  );
}

function StartStep({
  savedTemplates,
  onStart,
  onUploadPdf,
  onSelectSavedTemplate,
  busy,
}: {
  savedTemplates: PdfTemplateDto[];
  onStart: () => void;
  onUploadPdf: (file: File) => void;
  onSelectSavedTemplate: (template: PdfTemplateDto) => void;
  busy: boolean;
}) {
  const { t } = useTranslation();
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [previewTemplate, setPreviewTemplate] = useState<PdfTemplateDto | null>(
    null,
  );

  useEffect(() => {
    if (savedTemplates.length === 0) {
      setPreviewTemplate(null);
      return;
    }
    setPreviewTemplate((prev) =>
      prev && savedTemplates.some((t) => t._id === prev._id)
        ? prev
        : savedTemplates[0],
    );
  }, [savedTemplates]);

  const { pdfUrl, loading: pdfLoading, error: pdfError } =
    useTemplatePdfUrl(HAKNASOT_FORM_TEMPLATE_ID);
  const previewPdfUrl = previewTemplate?.fileUrl ?? null;

  function handleFile(file: File | undefined) {
    if (!file || busy) return;
    onUploadPdf(file);
  }

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <h2 className="text-lg font-medium">{t('newDocument.uploadYourPdf')}</h2>
        <div
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') fileRef.current?.click();
          }}
          onClick={() => !busy && fileRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            handleFile(e.dataTransfer.files[0]);
          }}
          className={`flex min-h-[200px] cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed px-6 py-10 text-center transition-colors ${
            dragOver
              ? 'border-black bg-gray-50'
              : 'border-gray-300 bg-white hover:border-gray-400'
          } ${busy ? 'pointer-events-none opacity-50' : ''}`}
        >
          <p className="text-sm text-gray-600">{t('newDocument.dropPdf')}</p>
          <p className="mt-2 text-xs text-gray-400">
            {busy ? t('common.uploading') : 'PDF'}
          </p>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="application/pdf,.pdf"
          className="hidden"
          onChange={(e) => {
            handleFile(e.target.files?.[0]);
            e.target.value = '';
          }}
        />
      </section>

      {savedTemplates.length > 0 && (
        <section className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-medium">
              {t('newDocument.savedPdfTemplates')}
            </h2>
            <button
              type="button"
              onClick={() => router.push('/templates')}
              className="text-xs text-gray-500 underline hover:text-black"
            >
              {t('newDocument.manageTemplates')}
            </button>
          </div>
          <div className="grid gap-6 lg:grid-cols-[minmax(0,280px)_minmax(0,1fr)]">
            <ul className="max-h-[480px] space-y-2 overflow-y-auto">
              {savedTemplates.map((template) => {
                const selected = previewTemplate?._id === template._id;
                return (
                  <li key={template._id}>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => setPreviewTemplate(template)}
                      className={`w-full rounded-lg border px-3 py-3 text-left text-sm transition-colors ${
                        selected
                          ? 'border-violet-400 bg-violet-50'
                          : 'border-gray-200 bg-white hover:border-gray-300'
                      } disabled:opacity-50`}
                    >
                      <span className="font-medium text-gray-900">
                        {template.name}
                      </span>
                      {template.isDefault && (
                        <span className="ms-2 text-xs text-violet-600">
                          {t('newDocument.defaultTemplate')}
                        </span>
                      )}
                      <span className="mt-1 block text-xs text-gray-500">
                        {t('newDocument.templateFieldCount', {
                          count: template.fields.length,
                        })}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
            <div className="flex min-h-[320px] flex-col rounded border bg-gray-50">
              {previewTemplate ? (
                <>
                  <div className="flex flex-wrap items-center gap-2 border-b bg-white px-3 py-2">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => onSelectSavedTemplate(previewTemplate)}
                      className="rounded bg-violet-700 px-4 py-2 text-sm font-medium text-white hover:bg-violet-800 disabled:opacity-50"
                    >
                      {busy
                        ? t('common.saving')
                        : t('newDocument.useSavedTemplate')}
                    </button>
                  </div>
                  <div className="flex-1 overflow-auto p-3">
                    {previewPdfUrl ? (
                      <PDFViewer pdfUrl={previewPdfUrl} />
                    ) : (
                      <p className="py-16 text-center text-sm text-gray-400">
                        {t('newDocument.templateNoPdf')}
                      </p>
                    )}
                  </div>
                </>
              ) : (
                <p className="flex flex-1 items-center justify-center px-4 text-center text-sm text-gray-400">
                  {t('newDocument.selectTemplatePreview')}
                </p>
              )}
            </div>
          </div>
        </section>
      )}

      <div className="flex items-center gap-4 text-sm text-gray-400">
        <span className="h-px flex-1 bg-gray-200" />
        <span>{t('newDocument.orUseTemplate')}</span>
        <span className="h-px flex-1 bg-gray-200" />
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,360px)_minmax(0,1fr)]">
        <div className="rounded border border-blue-200 bg-blue-50 p-6 text-sm">
          <p className="mb-2 text-lg font-medium text-blue-900">
            {t('newDocument.hebrewSampleTitle')}
          </p>
          <p className="mb-4 text-blue-800">{t('newDocument.hebrewSampleBody')}</p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={onStart}
              disabled={busy}
              className="rounded bg-blue-700 px-4 py-2 text-sm text-white hover:bg-blue-800 disabled:opacity-50"
            >
              {busy ? t('common.saving') : t('newDocument.startForm')}
            </button>
            <button
              type="button"
              onClick={() => void downloadHaknasotPdf('haknasot.pdf')}
              className="rounded border border-blue-300 bg-white px-4 py-2 text-sm text-blue-800 hover:bg-blue-100"
            >
              {t('common.downloadPdf')}
            </button>
          </div>
        </div>

        <section className="h-[480px] overflow-auto rounded border bg-gray-50 p-3">
          {pdfError && (
            <div className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-700">
              {pdfError}
            </div>
          )}
          {pdfLoading && (
            <p className="py-16 text-center text-sm text-gray-500">
              {t('pdf.loading')}
            </p>
          )}
          {pdfUrl && <PDFViewer pdfUrl={pdfUrl} />}
        </section>
      </div>
    </div>
  );
}

function FormFillStep({
  formTemplateId,
  pdfUrl: pdfUrlProp,
  fields,
  values,
  busy,
  onNext,
  onSkip,
}: {
  formTemplateId?: string;
  pdfUrl?: string;
  fields: ReturnType<typeof resolveFormTemplateFields>;
  values: Record<string, string>;
  busy: boolean;
  onNext: (values: Record<string, string>) => Promise<void>;
  onSkip: () => void;
}) {
  const { t } = useTranslation();
  const templatePdf = useTemplatePdfUrl(formTemplateId ?? null);
  const pdfUrl = pdfUrlProp ?? templatePdf.pdfUrl;
  const pdfLoading = pdfUrlProp ? false : templatePdf.loading;
  const pdfError = pdfUrlProp ? null : templatePdf.error;
  const [draft, setDraft] = useState(values);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setDraft(values);
  }, [values]);

  async function handleNext() {
    setSaving(true);
    try {
      await onNext(draft);
    } finally {
      setSaving(false);
    }
  }

  function fillSampleData() {
    setDraft({ ...HAKNASOT_SAMPLE_FORM_VALUES });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-gray-600">{t('newDocument.formStepHint')}</p>
        <button
          type="button"
          onClick={fillSampleData}
          disabled={busy || saving}
          className="rounded border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          {t('newDocument.fillFormAutomatically')}
        </button>
      </div>
      {pdfError && (
        <div className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-700">
          {pdfError}
        </div>
      )}
      <div className="flex min-h-[520px] flex-col gap-4 lg:flex-row">
        <section className="min-h-[400px] flex-1 overflow-auto rounded border bg-gray-50 p-3">
          {pdfLoading && (
            <p className="py-16 text-center text-sm text-gray-500">
              {t('pdf.loading')}
            </p>
          )}
          {pdfUrl && (
            <PDFViewer
              pdfUrl={pdfUrl}
              formFields={fields}
              formValues={draft}
            />
          )}
        </section>
        <aside className="w-full shrink-0 overflow-auto rounded border bg-white p-4 lg:w-[360px]">
          <DocumentFormFillPanel
            fields={fields}
            values={draft}
            saving={saving || busy}
            hideSaveButton
            onChange={setDraft}
            onSave={async () => {}}
          />
        </aside>
      </div>
      <div className="flex justify-between pt-2">
        <button
          type="button"
          onClick={onSkip}
          disabled={busy || saving}
          className="text-sm text-gray-600 hover:underline disabled:opacity-50"
        >
          {t('newDocument.skipForm')}
        </button>
        <button
          type="button"
          onClick={() => void handleNext()}
          disabled={busy || saving}
          className="rounded bg-black px-4 py-2 text-sm text-white hover:bg-gray-800 disabled:opacity-50"
        >
          {saving || busy ? t('common.saving') : t('common.next')}
        </button>
      </div>
    </div>
  );
}

function DetailsStep({
  title,
  description,
  onTitle,
  onDescription,
  onNext,
  onBack,
  summarizing,
  summaryError,
  busy,
}: {
  title: string;
  description: string;
  onTitle: (v: string) => void;
  onDescription: (v: string) => void;
  onNext: () => void;
  onBack?: () => void;
  summarizing: boolean;
  summaryError: string | null;
  busy: boolean;
}) {
  const { t } = useTranslation();
  return (
    <div className="space-y-4">
      <label className="block">
        <span className="text-sm font-medium">{t('newDocument.titleLabel')}</span>
        <input
          className="mt-1 w-full rounded border border-gray-300 px-3 py-2"
          value={title}
          onChange={(e) => onTitle(e.target.value)}
        />
      </label>
      <label className="block">
        <span className="text-sm font-medium">{t('newDocument.descriptionLabel')}</span>
        {summarizing && (
          <p className="mt-1 text-xs text-gray-500">{t('newDocument.summarizing')}</p>
        )}
        {summaryError && (
          <p className="mt-1 text-xs text-amber-700">{summaryError}</p>
        )}
        {!summarizing && description && !summaryError && (
          <p className="mt-1 text-xs text-gray-500">{t('newDocument.summaryHint')}</p>
        )}
        <textarea
          className="mt-1 w-full rounded border border-gray-300 px-3 py-2"
          rows={5}
          value={description}
          placeholder={summarizing ? t('newDocument.summarizingPlaceholder') : undefined}
          disabled={summarizing}
          onChange={(e) => onDescription(e.target.value)}
        />
      </label>
      <div className="flex justify-between pt-2">
        {onBack ? (
          <button
            type="button"
            onClick={onBack}
            className="text-sm text-gray-600 hover:underline"
          >
            ← {t('common.back')}
          </button>
        ) : (
          <span />
        )}
        <button
          onClick={onNext}
          disabled={summarizing || busy}
          className="rounded bg-black px-4 py-2 text-sm text-white hover:bg-gray-800 disabled:opacity-50"
        >
          {busy ? t('common.saving') : t('common.next')}
        </button>
      </div>
    </div>
  );
}

function ReviewStep({
  title,
  steps,
  busy,
  onBack,
  onSubmit,
}: {
  title: string;
  steps: WorkflowStepInput[];
  busy: boolean;
  onBack: () => void;
  onSubmit: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="space-y-4">
      <div className="rounded border border-gray-200 p-4">
        <h2 className="mb-2 font-medium">{title}</h2>
        <ol className="list-decimal space-y-2 ps-5 text-sm">
          {steps.map((s, i) => (
            <li key={i}>
              <span className="font-medium">{s.label}</span>{' '}
              <span className="text-gray-500">
                ({stepTypeLabel(s.stepType, t)})
              </span>
              <ul className="ms-2 list-disc text-gray-600">
                {s.signers.map((sg, j) => (
                  <li key={j}>
                    {sg.name ?? sg.email}
                    {sg.name && sg.email && (
                      <span className="text-gray-400"> — {sg.email}</span>
                    )}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ol>
      </div>
      <div className="flex justify-between pt-4">
        <button onClick={onBack} className="text-sm text-gray-600 hover:underline">
          ← {t('common.back')}
        </button>
        <button
          onClick={onSubmit}
          disabled={busy}
          className="rounded bg-black px-4 py-2 text-sm text-white hover:bg-gray-800 disabled:opacity-50"
        >
          {busy ? t('common.saving') : t('newDocument.saveAndAssign')}
        </button>
      </div>
      <p className="text-xs text-gray-500">{t('newDocument.reviewHint')}</p>
    </div>
  );
}
