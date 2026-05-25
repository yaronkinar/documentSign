'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import type { DocumentDto } from '@docflow/shared';
import {
  HAKNASOT_FORM_TEMPLATE_ID,
  HAKNASOT_SAMPLE_FORM_VALUES,
  HEBREW_SAMPLE_DEFAULT_TITLE,
  MUNICIPAL_APPROVAL_SIGNER_TITLES,
  resolveFormTemplateFields,
} from '@docflow/shared';

import { DocumentFormFillPanel } from '@/components/documents/DocumentFormFillPanel';
import { PDFViewer } from '@/components/pdf/PDFViewer';
import { useUser } from '@clerk/nextjs';
import { useApiClient } from '@/lib/api-client';
import { useTranslation } from '@/lib/i18n/LocaleProvider';
import { downloadHaknasotPdf } from '@/lib/generate-haknasot-pdf';
import { useTemplatePdfUrl } from '@/lib/use-template-pdf-url';

type Step = 'start' | 'form' | 'details' | 'workflow' | 'review';

interface SignerInput {
  email: string;
  name?: string;
}

interface WorkflowStepInput {
  label: string;
  stepType: 'review' | 'signature' | 'approval';
  signers: SignerInput[];
}

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

  async function resolveCurrentUserEmail(): Promise<string> {
    if (currentUserEmail) return currentUserEmail;
    try {
      const me = await api.get<{ email: string; name: string | null }>('/users/me');
      if (me.email) {
        setCurrentUserEmail(me.email);
        setCurrentUserName(me.name ?? '');
        return me.email;
      }
    } catch {
      // fall through to Clerk
    }
    return clerkUser?.primaryEmailAddress?.emailAddress ?? '';
  }

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
      const fields = resolveFormTemplateFields(doc.formTemplateId);
      setFormFields(fields);
      setFormValues(doc.formValues ?? {});
      setStep('form');
      void requestSummarize(doc._id);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('newDocument.startFormFailed'));
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
    const userEmail = await resolveCurrentUserEmail();
    try {
      for (const s of steps) {
        if (s.signers.length === 0) {
          throw new Error(t('newDocument.stepNoSigners', { label: s.label }));
        }
        const anyMissingEmail = s.signers.some((sg) => !sg.email);
        if (anyMissingEmail && !userEmail) {
          throw new Error(t('newDocument.stepMissingEmail', {
            label: s.label,
            names: s.signers.filter((sg) => !sg.email).map((sg) => sg.name ?? '?').join(', '),
          }));
        }
        const resolvedSigners = s.signers.map((sg) =>
          sg.email ? sg : { ...sg, email: userEmail },
        );
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
      <ProgressIndicator current={step} />
      {error && (
        <div className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {step === 'start' && (
        <StartStep onStart={startHaknasotDocument} busy={busy} />
      )}

      {step === 'form' && formFields.length > 0 && (
        <FormFillStep
          formTemplateId={HAKNASOT_FORM_TEMPLATE_ID}
          fields={formFields}
          values={formValues}
          busy={busy}
          onNext={handleFormNext}
          onSkip={() => setStep('details')}
        />
      )}

      {step === 'details' && (
        <DetailsStep
          title={title}
          description={description}
          onTitle={setTitle}
          onDescription={setDescription}
          onNext={handleDetailsNext}
          onBack={() => setStep('form')}
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

function ProgressIndicator({ current }: { current: Step }) {
  const { t } = useTranslation();
  const order: Step[] = ['start', 'form', 'details', 'workflow', 'review'];
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
  onStart,
  busy,
}: {
  onStart: () => void;
  busy: boolean;
}) {
  const { t } = useTranslation();
  return (
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
  );
}

function FormFillStep({
  formTemplateId,
  fields,
  values,
  busy,
  onNext,
  onSkip,
}: {
  formTemplateId: string;
  fields: ReturnType<typeof resolveFormTemplateFields>;
  values: Record<string, string>;
  busy: boolean;
  onNext: (values: Record<string, string>) => Promise<void>;
  onSkip: () => void;
}) {
  const { t } = useTranslation();
  const { pdfUrl, loading: pdfLoading, error: pdfError } =
    useTemplatePdfUrl(formTemplateId);
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

function WorkflowStepEditor({
  steps,
  currentUserEmail,
  currentUserName,
  onAddStep,
  onUpdateStep,
  onRemoveStep,
  onAddSigner,
  onRemoveSigner,
  onNext,
  onBack,
}: {
  steps: WorkflowStepInput[];
  currentUserEmail: string;
  currentUserName: string;
  onAddStep: () => void;
  onUpdateStep: (i: number, patch: Partial<WorkflowStepInput>) => void;
  onRemoveStep: (i: number) => void;
  onAddSigner: (i: number, s: SignerInput) => void;
  onRemoveSigner: (i: number, j: number) => void;
  onNext: () => void;
  onBack: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="space-y-4">
      {steps.length > 0 && steps[0].signers.some((s) => s.name && !s.email) && (
        <div className="rounded border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {t('newDocument.extractedSignersHint')}
        </div>
      )}
      {steps.map((s, i) => (
        <StepCard
          key={i}
          step={s}
          index={i}
          currentUserEmail={currentUserEmail}
          currentUserName={currentUserName}
          onUpdate={(patch) => onUpdateStep(i, patch)}
          onRemove={() => onRemoveStep(i)}
          onAddSigner={(signer) => onAddSigner(i, signer)}
          onRemoveSigner={(j) => onRemoveSigner(i, j)}
        />
      ))}
      <button
        onClick={onAddStep}
        className="rounded border border-dashed border-gray-300 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50"
      >
        {t('newDocument.addStep')}
      </button>
      <div className="flex justify-between pt-4">
        <button onClick={onBack} className="text-sm text-gray-600 hover:underline">
          ← {t('common.back')}
        </button>
        <button
          onClick={onNext}
          disabled={steps.length === 0}
          className="rounded bg-black px-4 py-2 text-sm text-white hover:bg-gray-800 disabled:opacity-50"
        >
          {t('common.next')}
        </button>
      </div>
    </div>
  );
}

function StepCard({
  step,
  currentUserEmail,
  currentUserName,
  onUpdate,
  onRemove,
  onAddSigner,
  onRemoveSigner,
}: {
  step: WorkflowStepInput;
  index: number;
  currentUserEmail: string;
  currentUserName: string;
  onUpdate: (patch: Partial<WorkflowStepInput>) => void;
  onRemove: () => void;
  onAddSigner: (s: SignerInput) => void;
  onRemoveSigner: (j: number) => void;
}) {
  const { t } = useTranslation();
  const [selectedTitle, setSelectedTitle] = useState('');
  const [customName, setCustomName] = useState('');

  const usedTitles = new Set(
    step.signers.map((s) => s.name).filter((name): name is string => !!name),
  );
  const resolvedName =
    selectedTitle === '__custom__'
      ? customName.trim()
      : selectedTitle;

  function addSigner() {
    if (!resolvedName && !currentUserEmail) return;
    onAddSigner({ email: currentUserEmail, name: resolvedName || undefined });
    setSelectedTitle('');
    setCustomName('');
  }

  function addAllApprovalRoles() {
    const toAdd = MUNICIPAL_APPROVAL_SIGNER_TITLES.filter(
      (title) => !usedTitles.has(title),
    ).map((name) => ({ email: currentUserEmail, name }));
    if (toAdd.length === 0) return;
    onUpdate({ signers: [...step.signers, ...toAdd] });
  }

  const hasExtractedSigners = step.signers.some((s) => s.name && !s.email);
  const pendingApprovalRoles = MUNICIPAL_APPROVAL_SIGNER_TITLES.filter(
    (title) => !usedTitles.has(title),
  );

  return (
    <div className={`rounded border p-4 ${hasExtractedSigners ? 'border-blue-200 bg-blue-50/30' : 'border-gray-200'}`}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <input
          className="flex-1 rounded border border-gray-300 px-2 py-1 text-sm"
          value={step.label}
          onChange={(e) => onUpdate({ label: e.target.value })}
        />
        <select
          className="rounded border border-gray-300 px-2 py-1 text-sm"
          value={step.stepType}
          onChange={(e) =>
            onUpdate({ stepType: e.target.value as WorkflowStepInput['stepType'] })
          }
        >
          <option value="signature">{t('newDocument.stepTypeSignature')}</option>
          <option value="review">{t('newDocument.stepTypeReview')}</option>
          <option value="approval">{t('newDocument.stepTypeApproval')}</option>
        </select>
        <button
          onClick={onRemove}
          className="text-xs text-red-600 hover:underline"
        >
          {t('common.remove')}
        </button>
      </div>
      <ul className="mb-3 space-y-2 text-sm">
        {step.signers.map((s, j) => {
          const isExtracted = s.name && !s.email;
          return (
            <li
              key={j}
              className={`rounded px-2 py-1.5 ${isExtracted ? 'border border-amber-200 bg-amber-50' : 'bg-gray-50'}`}
            >
              {isExtracted ? (
                <div className="flex items-center gap-2">
                  <select
                    className="w-56 shrink-0 rounded border border-gray-300 bg-white px-2 py-0.5 text-sm"
                    value={
                      s.name &&
                      MUNICIPAL_APPROVAL_SIGNER_TITLES.includes(
                        s.name as (typeof MUNICIPAL_APPROVAL_SIGNER_TITLES)[number],
                      )
                        ? s.name
                        : '__custom__'
                    }
                    onChange={(e) => {
                      const value = e.target.value;
                      const updated = step.signers.map((sig, idx) =>
                        idx === j
                          ? {
                              ...sig,
                              name:
                                value === '__custom__'
                                  ? sig.name ?? ''
                                  : value,
                            }
                          : sig,
                      );
                      onUpdate({ signers: updated });
                    }}
                  >
                    <option value="">{t('newDocument.selectRolePlaceholder')}</option>
                    {MUNICIPAL_APPROVAL_SIGNER_TITLES.map((title) => (
                      <option key={title} value={title}>
                        {title}
                      </option>
                    ))}
                    <option value="__custom__">{t('newDocument.customRole')}</option>
                  </select>
                  {(!s.name ||
                    !MUNICIPAL_APPROVAL_SIGNER_TITLES.includes(
                      s.name as (typeof MUNICIPAL_APPROVAL_SIGNER_TITLES)[number],
                    )) && (
                    <input
                      type="text"
                      placeholder={t('newDocument.namePlaceholder')}
                      className="w-40 shrink-0 rounded border border-gray-300 bg-white px-2 py-0.5 text-sm"
                      value={s.name ?? ''}
                      onChange={(e) => {
                        const updated = step.signers.map((sig, idx) =>
                          idx === j ? { ...sig, name: e.target.value } : sig,
                        );
                        onUpdate({ signers: updated });
                      }}
                    />
                  )}
                  <button
                    onClick={() => onRemoveSigner(j)}
                    className="text-xs text-gray-400 hover:text-red-600"
                  >
                    {t('common.remove')}
                  </button>
                </div>
              ) : (
                <div className="flex items-center justify-between">
                  <span>
                    {s.email}
                    {s.name && <span className="ms-1 text-gray-500">({s.name})</span>}
                  </span>
                  <button
                    onClick={() => onRemoveSigner(j)}
                    className="text-xs text-gray-500 hover:text-red-600"
                  >
                    {t('common.remove')}
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
      <div className="space-y-2">
        <div className="flex flex-wrap gap-2">
          <select
            className="min-w-56 flex-1 rounded border border-gray-300 px-2 py-1 text-sm"
            value={selectedTitle}
            onChange={(e) => setSelectedTitle(e.target.value)}
          >
            <option value="">{t('newDocument.selectRolePlaceholder')}</option>
            {MUNICIPAL_APPROVAL_SIGNER_TITLES.map((title) => (
              <option key={title} value={title} disabled={usedTitles.has(title)}>
                {title}
              </option>
            ))}
            <option value="__custom__">{t('newDocument.customRole')}</option>
          </select>
          {selectedTitle === '__custom__' && (
            <input
              type="text"
              placeholder={t('newDocument.namePlaceholder')}
              className="w-48 rounded border border-gray-300 px-2 py-1 text-sm"
              value={customName}
              onChange={(e) => setCustomName(e.target.value)}
            />
          )}
          <button
            onClick={addSigner}
            disabled={!resolvedName && !currentUserEmail}
            className="rounded bg-gray-100 px-3 py-1 text-sm hover:bg-gray-200 disabled:opacity-50"
          >
            {t('common.add')}
          </button>
        </div>
        {pendingApprovalRoles.length > 0 && (
          <button
            type="button"
            onClick={addAllApprovalRoles}
            className="text-xs text-blue-700 hover:underline"
          >
            {t('newDocument.addAllApprovals')} ({pendingApprovalRoles.length})
          </button>
        )}
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

/**
 * Maps workflow step type values to localized labels.
 */
function stepTypeLabel(
  stepType: string,
  t: (key: string) => string,
): string {
  switch (stepType) {
    case 'signature':
      return t('newDocument.stepTypeSignature');
    case 'review':
      return t('newDocument.stepTypeReview');
    case 'approval':
      return t('newDocument.stepTypeApproval');
    default:
      return stepType;
  }
}
