'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { DocumentDto, PdfFormFieldType, PdfTemplateDto } from '@docflow/shared';
import {
  HAKNASOT_FORM_TEMPLATE_ID,
  HAKNASOT_SAMPLE_FORM_VALUES,
  HEBREW_SAMPLE_DEFAULT_TITLE,
  MUNICIPAL_APPROVAL_SIGNER_TITLES,
  resolveDocumentFormFields,
  resolveFormTemplateFields,
} from '@docflow/shared';

import { DocumentFormFieldsEditor } from '@/components/documents/DocumentFormFieldsEditor';
import { DocumentFormFillPanel } from '@/components/documents/DocumentFormFillPanel';
import {
  WorkflowStepEditor,
  stepTypeLabel,
  type SignerInput,
  type SignerRolesSource,
  type WorkflowStepInput,
} from '@/components/documents/WorkflowStepEditor';
import { PDFViewer } from '@/components/pdf/PDFViewer';
import { PdfLoadingSkeleton } from '@/components/pdf/PdfLoadingSkeleton';
import { useUser } from '@clerk/nextjs';
import { useApiClient } from '@/lib/api-client';
import {
  convertWordToPdf,
  pdfFileFromBlob,
} from '@/lib/convert-word-to-pdf';
import {
  DOCUMENT_UPLOAD_ACCEPT,
  isSupportedDocumentUpload,
  isWordFile,
  titleFromUploadFile,
} from '@/lib/document-upload';
import { useTranslation } from '@/lib/i18n/LocaleProvider';
import { downloadHaknasotPdf } from '@/lib/generate-haknasot-pdf';
import { getPdfPageCount } from '@/lib/pdf-page-count';
import { hydrateWorkflowStepsFromProfiles } from '@/lib/signer-profile-workflow';
import { useDocumentPdfUrl } from '@/lib/use-document-pdf-url';
import { useTemplatePdfUrl } from '@/lib/use-template-pdf-url';

type Step =
  | 'start'
  | 'attach-contract'
  | 'form'
  | 'form-setup'
  | 'form-fill'
  | 'details'
  | 'workflow'
  | 'review';
type DocSource = 'template' | 'upload' | 'saved_pdf';
type UploadPhase = 'idle' | 'converting' | 'uploading' | 'processing';

export function NewDocumentClient() {
  const router = useRouter();
  const api = useApiClient();
  const { t } = useTranslation();
  const { user: clerkUser } = useUser();
  const [step, setStep] = useState<Step>('start');
  const [documentId, setDocumentId] = useState<string | null>(null);
  const [doc, setDoc] = useState<DocumentDto | null>(null);
  const [title, setTitle] = useState(HEBREW_SAMPLE_DEFAULT_TITLE);
  const [description, setDescription] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [uploadPhase, setUploadPhase] = useState<UploadPhase>('idle');
  const [steps, setSteps] = useState<WorkflowStepInput[]>([]);
  const [summarizing, setSummarizing] = useState(false);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [formValues, setFormValues] = useState<Record<string, string>>({});
  const [formFields, setFormFields] = useState<ReturnType<typeof resolveFormTemplateFields>>([]);
  const [uploadPdfUrl, setUploadPdfUrl] = useState<string | null>(null);
  const [docSource, setDocSource] = useState<DocSource | null>(null);
  const [extractingSigners, setExtractingSigners] = useState(false);
  const [extractingFormFields, setExtractingFormFields] = useState(false);
  const [signerRolesSource, setSignerRolesSource] =
    useState<SignerRolesSource>('manual');
  const [templateRoleNames, setTemplateRoleNames] = useState<string[]>([]);
  const [savedTemplates, setSavedTemplates] = useState<PdfTemplateDto[]>([]);
  const [activeTemplateId, setActiveTemplateId] = useState<string | null>(null);
  const [currentUserEmail, setCurrentUserEmail] = useState(
    () => clerkUser?.primaryEmailAddress?.emailAddress ?? '',
  );
  const [currentUserName, setCurrentUserName] = useState(
    () => clerkUser?.fullName ?? '',
  );
  const [formFieldPlacementMode, setFormFieldPlacementMode] = useState(false);
  const [activeFormFieldId, setActiveFormFieldId] = useState<string | null>(null);
  const [attachFormBusy, setAttachFormBusy] = useState(false);

  const uploadDocPdf = useDocumentPdfUrl(docSource === 'upload' ? documentId : null);

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
      setSignerRolesSource('template');
      setTemplateRoleNames([...MUNICIPAL_APPROVAL_SIGNER_TITLES]);
      setActiveTemplateId(HAKNASOT_FORM_TEMPLATE_ID);
      const fields = resolveFormTemplateFields(doc.formTemplateId);
      setFormFields(fields);
      setFormValues(doc.formValues ?? {});
      setStep('attach-contract');
    } catch (err) {
      setError(err instanceof Error ? err.message : t('newDocument.startFormFailed'));
    } finally {
      setBusy(false);
    }
  }

  async function startUploadedDocument(file: File) {
    if (!isSupportedDocumentUpload(file)) {
      setError(t('newDocument.unsupportedFile'));
      return;
    }
    setError(null);
    setBusy(true);
    setUploadPhase(isWordFile(file) ? 'converting' : 'uploading');
    setSummaryError(null);
    setDescription('');
    setDocSource('upload');
    setActiveTemplateId(null);
    setSignerRolesSource('manual');
    setTemplateRoleNames([]);
    setFormFields([]);
    setFormValues({});
    setUploadPdfUrl(null);
    const docTitle = titleFromUploadFile(file, HEBREW_SAMPLE_DEFAULT_TITLE);
    setTitle(docTitle);
    try {
      let pdfFile = file;
      if (isWordFile(file)) {
        const pdfBlob = await convertWordToPdf(file, api.postFormData);
        pdfFile = pdfFileFromBlob(pdfBlob, file.name);
        setUploadPhase('uploading');
      }

      const { uploadUrl, documentId: newId } = await api.post<{
        uploadUrl: string;
        documentId: string;
      }>('/documents', { title: docTitle });

      const pageCount = await getPdfPageCount(pdfFile);
      const uploadRes = await fetch(uploadUrl, {
        method: 'PUT',
        body: pdfFile,
        headers: { 'Content-Type': 'application/pdf' },
      });
      if (!uploadRes.ok) {
        throw new Error(t('newDocument.uploadFailed'));
      }

      setUploadPhase('processing');
      const confirmed = await api.post<DocumentDto>(`/documents/${newId}/confirm`, {
        fileSize: pdfFile.size,
        pageCount,
      });
      setDocumentId(confirmed._id);
      setTitle(confirmed.title);

      setExtractingSigners(true);
      setExtractingFormFields(true);
      let latestDoc = confirmed;
      let detectedFields: ReturnType<typeof resolveFormTemplateFields> = [];
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
        detectedFields = formResult.fields;
        latestDoc = docWithUrl;
        if (docWithUrl.fileUrl) setUploadPdfUrl(docWithUrl.fileUrl);
        if (signers.length > 0) {
          setSignerRolesSource('file');
          setTemplateRoleNames(signers);
          setSteps([
            {
              label: t('newDocument.signaturesStepLabel'),
              stepType: 'approval',
              signers: signers.map((name) => ({ email: '', name })),
            },
          ]);
        } else {
          setSignerRolesSource('manual');
          setTemplateRoleNames([]);
          setSteps([
            {
              label: t('newDocument.stepLabel', { n: 1 }),
              stepType: 'signature',
              signers: [],
            },
          ]);
        }
      } catch {
        setSignerRolesSource('manual');
        setTemplateRoleNames([]);
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

      if (detectedFields.length > 0) {
        try {
          await api.post(`/documents/${newId}/extract-form-values`);
          latestDoc = await api.get<DocumentDto>(`/documents/${newId}`);
        } catch {
          // Leave form values blank — same as today when there's no AI data.
        }
      }

      setDoc(latestDoc);
      setFormValues(latestDoc.formValues ?? {});
      const resolvedFields = resolveDocumentFormFields(latestDoc);
      if (resolvedFields.length > 0) {
        setFormFields(resolvedFields);
      }
      setStep('form-setup');
    } catch (err) {
      setError(err instanceof Error ? err.message : t('newDocument.uploadFailed'));
      setDocSource(null);
    } finally {
      setBusy(false);
      setUploadPhase('idle');
    }
  }

  async function attachSourceContract(file: File) {
    if (!documentId) return;
    if (!isSupportedDocumentUpload(file)) {
      setError(t('newDocument.unsupportedFile'));
      return;
    }
    setError(null);
    setBusy(true);
    setUploadPhase(isWordFile(file) ? 'converting' : 'uploading');
    try {
      let pdfFile = file;
      if (isWordFile(file)) {
        const pdfBlob = await convertWordToPdf(file, api.postFormData);
        pdfFile = pdfFileFromBlob(pdfBlob, file.name);
        setUploadPhase('uploading');
      }

      const { uploadUrl } = await api.post<{ uploadUrl: string; fileKey: string }>(
        `/documents/${documentId}/source-contract`,
      );
      const uploadRes = await fetch(uploadUrl, {
        method: 'PUT',
        body: pdfFile,
        headers: { 'Content-Type': 'application/pdf' },
      });
      if (!uploadRes.ok) {
        throw new Error(t('newDocument.uploadFailed'));
      }

      setUploadPhase('processing');
      await api.post(`/documents/${documentId}/source-contract/confirm`);

      try {
        await api.post(`/documents/${documentId}/summarize`);
      } catch {
        // Description stays blank — same fallback behavior as the upload flow.
      }
      try {
        await api.post(`/documents/${documentId}/extract-form-values`);
      } catch {
        // Leave form values blank — same fallback behavior as the upload flow.
      }

      const latestDoc = await api.get<DocumentDto>(`/documents/${documentId}`);
      setDoc(latestDoc);
      setDescription(latestDoc.description ?? '');
      setFormValues(latestDoc.formValues ?? {});
      setStep(docSource === 'template' ? 'form' : 'details');
    } catch (err) {
      setError(err instanceof Error ? err.message : t('newDocument.uploadFailed'));
    } finally {
      setBusy(false);
      setUploadPhase('idle');
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
    setSignerRolesSource('template');
    setTemplateRoleNames(signerNamesFromTemplateFields(template));
    setActiveTemplateId(template._id);
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
      if (signers.length > 0) {
        setSignerRolesSource('template');
        setTemplateRoleNames(signers);
      } else {
        setExtractingSigners(true);
        try {
          const { signers: extracted } = await api.post<{ signers: string[] }>(
            `/documents/${doc._id}/extract-signers`,
          );
          signers = extracted;
          if (extracted.length > 0) {
            setSignerRolesSource('file');
            setTemplateRoleNames(extracted);
          } else {
            setSignerRolesSource('manual');
            setTemplateRoleNames([]);
          }
        } catch {
          signers = [];
          setSignerRolesSource('manual');
          setTemplateRoleNames([]);
        } finally {
          setExtractingSigners(false);
        }
      }

      const hydrated = await hydrateWorkflowStepsFromProfiles(
        api,
        template._id,
        signers.length > 0
          ? [
              {
                label: t('newDocument.signaturesStepLabel'),
                stepType: 'approval' as const,
                signers: signers.map((name) => ({ email: '', name })),
              },
            ]
          : [
              {
                label: t('newDocument.stepLabel', { n: 1 }),
                stepType: 'signature' as const,
                signers: [],
              },
            ],
        signers,
      );
      setSteps(hydrated);
      setStep('attach-contract');
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
    goToDetails();
  }

  function syncDoc(fresh: DocumentDto) {
    setDoc(fresh);
    setFormFields(resolveDocumentFormFields(fresh));
    setFormValues(fresh.formValues ?? {});
  }

  function goToDetails() {
    setFormFieldPlacementMode(false);
    setStep('details');
    if (documentId) void requestSummarize(documentId);
  }

  function advanceFromFormSetup() {
    setFormFieldPlacementMode(false);
    const fields = doc ? resolveDocumentFormFields(doc) : [];
    if (fields.length > 0) {
      setFormFields(fields);
      setStep('form-fill');
    } else {
      goToDetails();
    }
  }

  async function handleUploadFormNext(values: Record<string, string>) {
    if (!documentId) return;
    setBusy(true);
    setError(null);
    try {
      const fresh = await api.patch<DocumentDto>(`/documents/${documentId}/form-values`, {
        values,
      });
      syncDoc(fresh);
      goToDetails();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('document.saveFormFailed'));
      throw err;
    } finally {
      setBusy(false);
    }
  }

  async function extractFormFieldsFromPdf() {
    if (!documentId) return;
    setAttachFormBusy(true);
    setError(null);
    try {
      await api.post(`/documents/${documentId}/extract-form-fields`);
      const fresh = await api.get<DocumentDto>(`/documents/${documentId}`);
      syncDoc(fresh);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('document.saveFormFailed'));
    } finally {
      setAttachFormBusy(false);
    }
  }

  async function attachFormTemplate(formTemplateId: string) {
    if (!documentId) return;
    setAttachFormBusy(true);
    setError(null);
    try {
      const fresh = await api.patch<DocumentDto>(`/documents/${documentId}/form-template`, {
        formTemplateId,
      });
      syncDoc(fresh);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('document.saveFormFailed'));
    } finally {
      setAttachFormBusy(false);
    }
  }

  function startFormFieldPlacement() {
    setFormFieldPlacementMode(true);
  }

  async function onFormFieldPlace(page: number, x: number, y: number) {
    if (!documentId || !formFieldPlacementMode) return;
    const label = `${t('document.formFieldLabel')} ${(doc?.formFields?.length ?? 0) + 1}`;
    setError(null);
    try {
      const fresh = await api.post<DocumentDto>(`/documents/${documentId}/form-fields`, {
        label,
        pageNumber: page,
        x: Number(x.toFixed(2)),
        y: Number(y.toFixed(2)),
      });
      syncDoc(fresh);
      setActiveFormFieldId(fresh.formFields?.at(-1)?.id ?? null);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : t('document.formFieldAddFailed'),
      );
    }
  }

  async function onFormFieldMove(fieldId: string, page: number, x: number, y: number) {
    if (!documentId) return;
    try {
      const fresh = await api.patch<DocumentDto>(
        `/documents/${documentId}/form-fields/${fieldId}`,
        {
          pageNumber: page,
          x: Number(x.toFixed(2)),
          y: Number(y.toFixed(2)),
        },
      );
      syncDoc(fresh);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : t('document.formFieldUpdateFailed'),
      );
    }
  }

  async function onFormFieldResize(fieldId: string, width: number, height: number) {
    if (!documentId) return;
    try {
      const fresh = await api.patch<DocumentDto>(
        `/documents/${documentId}/form-fields/${fieldId}`,
        {
          width: Number(width.toFixed(2)),
          height: Number(height.toFixed(2)),
        },
      );
      syncDoc(fresh);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : t('document.formFieldUpdateFailed'),
      );
    }
  }

  async function updateFormFieldMeta(
    fieldId: string,
    patch: { label?: string; type?: PdfFormFieldType },
  ) {
    if (!documentId) return;
    setError(null);
    try {
      const fresh = await api.patch<DocumentDto>(
        `/documents/${documentId}/form-fields/${fieldId}`,
        patch,
      );
      syncDoc(fresh);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : t('document.formFieldUpdateFailed'),
      );
    }
  }

  async function deleteFormField(fieldId: string) {
    if (!documentId) return;
    setError(null);
    try {
      const fresh = await api.delete<DocumentDto>(
        `/documents/${documentId}/form-fields/${fieldId}`,
      );
      syncDoc(fresh);
      if (activeFormFieldId === fieldId) setActiveFormFieldId(null);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : t('document.formFieldDeleteFailed'),
      );
    }
  }

  async function handleDetailsNext() {
    if (!documentId) return;
    setBusy(true);
    setError(null);
    try {
      await api.patch(`/documents/${documentId}`, { title, description });
      if (activeTemplateId) {
        const fallbackRoles =
          activeTemplateId === HAKNASOT_FORM_TEMPLATE_ID
            ? [...MUNICIPAL_APPROVAL_SIGNER_TITLES]
            : templateRoleNames;
        const hydrated = await hydrateWorkflowStepsFromProfiles(
          api,
          activeTemplateId,
          steps,
          fallbackRoles,
        );
        setSteps(hydrated);
        const rolesFromStep = hydrated.flatMap((step) =>
          step.signers
            .map((signer) => signer.name?.trim())
            .filter((name): name is string => !!name),
        );
        if (rolesFromStep.length > 0) {
          setTemplateRoleNames(rolesFromStep);
        } else if (fallbackRoles.length > 0) {
          setTemplateRoleNames(fallbackRoles);
        }
        if (signerRolesSource !== 'file') {
          setSignerRolesSource('template');
        }
      }
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
      <ProgressIndicator current={step} docSource={docSource} />
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
          uploadPhase={uploadPhase}
        />
      )}

      {step === 'attach-contract' && (
        <AttachContractStep
          busy={busy}
          uploadPhase={uploadPhase}
          onAttach={attachSourceContract}
          onBack={() => setStep('start')}
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
          onSkip={goToDetails}
          onBack={() => setStep('attach-contract')}
        />
      )}

      {step === 'form-setup' && docSource === 'upload' && doc && (
        <FormSetupStep
          doc={doc}
          fields={resolveDocumentFormFields(doc)}
          pdfUrl={uploadDocPdf.pdfUrl}
          pdfLoading={uploadDocPdf.loading}
          pdfError={uploadDocPdf.error}
          busy={busy}
          attachFormBusy={attachFormBusy}
          formFieldPlacementMode={formFieldPlacementMode}
          activeFieldId={activeFormFieldId}
          onStartAddField={startFormFieldPlacement}
          onCancelAddField={() => setFormFieldPlacementMode(false)}
          onSelectTemplate={(id) => void attachFormTemplate(id)}
          onExtractFromPdf={() => void extractFormFieldsFromPdf()}
          onUpdateField={(fieldId, patch) => void updateFormFieldMeta(fieldId, patch)}
          onDeleteField={(fieldId) => void deleteFormField(fieldId)}
          onSelectField={setActiveFormFieldId}
          onFormFieldPlace={onFormFieldPlace}
          onFormFieldMove={onFormFieldMove}
          onFormFieldResize={onFormFieldResize}
          onNext={advanceFromFormSetup}
          onSkip={goToDetails}
          onBack={() => setStep('start')}
        />
      )}

      {step === 'form-fill' && docSource === 'upload' && doc && (
        <FormFillStep
          pdfUrl={uploadDocPdf.pdfUrl ?? undefined}
          fields={resolveDocumentFormFields(doc)}
          values={formValues}
          busy={busy}
          onNext={handleUploadFormNext}
          onSkip={goToDetails}
          onBack={() => setStep('form-setup')}
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
            if (docSource === 'template') {
              setStep('form');
            } else if (docSource === 'upload') {
              const fields = doc ? resolveDocumentFormFields(doc) : [];
              setStep(fields.length > 0 ? 'form-fill' : 'form-setup');
            } else if (docSource === 'saved_pdf') {
              setStep('attach-contract');
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
          signerRolesSource={signerRolesSource}
          templateRoleNames={templateRoleNames}
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

function progressOrder(docSource: DocSource | null): Step[] {
  if (docSource === 'template') {
    return ['start', 'attach-contract', 'form', 'details', 'workflow', 'review'];
  }
  if (docSource === 'upload') {
    return ['start', 'form-setup', 'form-fill', 'details', 'workflow', 'review'];
  }
  if (docSource === 'saved_pdf') {
    return ['start', 'attach-contract', 'details', 'workflow', 'review'];
  }
  return ['start', 'details', 'workflow', 'review'];
}

function ProgressIndicator({
  current,
  docSource,
}: {
  current: Step;
  docSource: DocSource | null;
}) {
  const { t } = useTranslation();
  const order = progressOrder(docSource);
  const stepLabels: Record<Step, string> = {
    start: t('newDocument.stepStart'),
    'attach-contract': t('newDocument.stepAttachContract'),
    form: t('newDocument.stepForm'),
    'form-setup': t('newDocument.stepFormSetup'),
    'form-fill': t('newDocument.stepFormFill'),
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
  uploadPhase,
}: {
  savedTemplates: PdfTemplateDto[];
  onStart: () => void;
  onUploadPdf: (file: File) => void;
  onSelectSavedTemplate: (template: PdfTemplateDto) => void;
  busy: boolean;
  uploadPhase: UploadPhase;
}) {
  const { t } = useTranslation();
  const router = useRouter();
  const fileInputEl = useRef<HTMLInputElement | null>(null);
  const onUploadPdfRef = useRef(onUploadPdf);
  const busyRef = useRef(busy);
  const fileListenerRef = useRef<((this: HTMLInputElement, ev: Event) => void) | null>(
    null,
  );
  onUploadPdfRef.current = onUploadPdf;
  busyRef.current = busy;

  const bindFileInput = useCallback((node: HTMLInputElement | null) => {
    const prev = fileInputEl.current;
    if (prev && fileListenerRef.current) {
      prev.removeEventListener('change', fileListenerRef.current);
    }
    fileInputEl.current = node;
    fileListenerRef.current = null;
    if (!node) return;

    const onPick = () => {
      const file = node.files?.[0];
      if (!file || busyRef.current) return;
      onUploadPdfRef.current(file);
      node.value = '';
    };
    fileListenerRef.current = onPick;
    node.addEventListener('change', onPick);
  }, []);
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

  const uploadStatusMessage =
    uploadPhase === 'converting'
      ? t('newDocument.convertingToPdf')
      : uploadPhase === 'uploading'
        ? t('newDocument.uploadingDocument')
        : uploadPhase === 'processing'
          ? t('newDocument.processingDocument')
          : null;

  const showUploadSkeleton = uploadPhase !== 'idle';

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <h2 className="text-lg font-medium">{t('newDocument.uploadYourPdf')}</h2>
        {showUploadSkeleton ? (
          <div
            className="rounded-lg border border-gray-200 bg-gray-50 px-6 py-8"
            aria-busy="true"
            aria-live="polite"
          >
            <PdfLoadingSkeleton />
            {uploadStatusMessage && (
              <p className="mt-4 text-center text-sm text-gray-600">
                {uploadStatusMessage}
              </p>
            )}
          </div>
        ) : (
          <div
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') fileInputEl.current?.click();
            }}
            onClick={() => !busy && fileInputEl.current?.click()}
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
              {t('newDocument.supportedFormats')}
            </p>
          </div>
        )}
        <input
          ref={bindFileInput}
          type="file"
          accept={DOCUMENT_UPLOAD_ACCEPT}
          className="sr-only"
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

function AttachContractStep({
  busy,
  uploadPhase,
  onAttach,
  onBack,
}: {
  busy: boolean;
  uploadPhase: UploadPhase;
  onAttach: (file: File) => void;
  onBack: () => void;
}) {
  const { t } = useTranslation();
  const fileInputEl = useRef<HTMLInputElement | null>(null);
  const [dragOver, setDragOver] = useState(false);

  function handleFile(file: File | undefined) {
    if (!file || busy) return;
    onAttach(file);
  }

  const uploadStatusMessage =
    uploadPhase === 'converting'
      ? t('newDocument.convertingToPdf')
      : uploadPhase === 'uploading'
        ? t('newDocument.uploadingDocument')
        : uploadPhase === 'processing'
          ? t('newDocument.processingDocument')
          : null;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-medium">{t('newDocument.attachContractTitle')}</h2>
        <p className="mt-1 text-sm text-gray-600">{t('newDocument.attachContractBody')}</p>
      </div>
      {uploadPhase !== 'idle' ? (
        <div
          className="rounded-lg border border-gray-200 bg-gray-50 px-6 py-8"
          aria-busy="true"
          aria-live="polite"
        >
          <PdfLoadingSkeleton />
          {uploadStatusMessage && (
            <p className="mt-4 text-center text-sm text-gray-600">{uploadStatusMessage}</p>
          )}
        </div>
      ) : (
        <div
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') fileInputEl.current?.click();
          }}
          onClick={() => !busy && fileInputEl.current?.click()}
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
          <p className="mt-2 text-xs text-gray-400">{t('newDocument.supportedFormats')}</p>
        </div>
      )}
      <input
        ref={fileInputEl}
        type="file"
        accept={DOCUMENT_UPLOAD_ACCEPT}
        className="sr-only"
        onChange={(e) => {
          const file = e.target.files?.[0];
          handleFile(file);
          e.target.value = '';
        }}
      />
      <div className="flex justify-start">
        <button
          type="button"
          onClick={onBack}
          disabled={busy}
          className="rounded border border-gray-300 bg-white px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          {t('common.back')}
        </button>
      </div>
    </div>
  );
}

function FormSetupStep({
  doc,
  fields,
  pdfUrl,
  pdfLoading,
  pdfError,
  busy,
  attachFormBusy,
  formFieldPlacementMode,
  activeFieldId,
  onStartAddField,
  onCancelAddField,
  onSelectTemplate,
  onExtractFromPdf,
  onUpdateField,
  onDeleteField,
  onSelectField,
  onFormFieldPlace,
  onFormFieldMove,
  onFormFieldResize,
  onNext,
  onSkip,
  onBack,
}: {
  doc: DocumentDto;
  fields: ReturnType<typeof resolveDocumentFormFields>;
  pdfUrl: string | null;
  pdfLoading: boolean;
  pdfError: string | null;
  busy: boolean;
  attachFormBusy: boolean;
  formFieldPlacementMode: boolean;
  activeFieldId: string | null;
  onStartAddField: () => void;
  onCancelAddField: () => void;
  onSelectTemplate: (formTemplateId: string) => void;
  onExtractFromPdf: () => void;
  onUpdateField: (
    fieldId: string,
    patch: { label?: string; type?: PdfFormFieldType },
  ) => void;
  onDeleteField: (fieldId: string) => void;
  onSelectField: (fieldId: string | null) => void;
  onFormFieldPlace: (page: number, x: number, y: number) => void;
  onFormFieldMove: (fieldId: string, page: number, x: number, y: number) => void;
  onFormFieldResize: (fieldId: string, width: number, height: number) => void;
  onNext: () => void;
  onSkip: () => void;
  onBack: () => void;
}) {
  const { t } = useTranslation();
  const editableFormFieldIds = (doc.formFields ?? []).map((f) => f.id);

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-600">{t('newDocument.formSetupStepHint')}</p>
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
              formValues={doc.formValues ?? {}}
              formFieldPlacementMode={formFieldPlacementMode}
              formFieldEditMode={!formFieldPlacementMode}
              editableFormFieldIds={editableFormFieldIds}
              activeFormFieldId={activeFieldId}
              onFormFieldPlace={onFormFieldPlace}
              onFormFieldMove={onFormFieldMove}
              onFormFieldResize={onFormFieldResize}
              onFormFieldSelect={onSelectField}
            />
          )}
        </section>
        <aside className="w-full shrink-0 overflow-auto rounded border bg-white p-4 lg:w-[360px]">
          <DocumentFormFieldsEditor
            doc={doc}
            fields={fields}
            busy={attachFormBusy}
            formFieldPlacementMode={formFieldPlacementMode}
            onStartAddField={onStartAddField}
            onCancelAddField={onCancelAddField}
            onSelectTemplate={onSelectTemplate}
            onExtractFromPdf={onExtractFromPdf}
            onUpdateField={onUpdateField}
            onDeleteField={onDeleteField}
            onSelectField={onSelectField}
            activeFieldId={activeFieldId}
            onContinueToFill={fields.length > 0 ? onNext : undefined}
            onSkipToSigners={onSkip}
          />
        </aside>
      </div>
      <div className="flex justify-between pt-2">
        <button
          type="button"
          onClick={onBack}
          disabled={busy || attachFormBusy}
          className="text-sm text-gray-600 hover:underline disabled:opacity-50"
        >
          ← {t('common.back')}
        </button>
        <button
          type="button"
          onClick={onNext}
          disabled={busy || attachFormBusy || formFieldPlacementMode}
          className="rounded bg-black px-4 py-2 text-sm text-white hover:bg-gray-800 disabled:opacity-50"
        >
          {t('common.next')}
        </button>
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
  onBack,
}: {
  formTemplateId?: string;
  pdfUrl?: string;
  fields: ReturnType<typeof resolveFormTemplateFields>;
  values: Record<string, string>;
  busy: boolean;
  onNext: (values: Record<string, string>) => Promise<void>;
  onSkip: () => void;
  onBack?: () => void;
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
        {onBack ? (
          <button
            type="button"
            onClick={onBack}
            disabled={busy || saving}
            className="text-sm text-gray-600 hover:underline disabled:opacity-50"
          >
            ← {t('common.back')}
          </button>
        ) : (
          <button
            type="button"
            onClick={onSkip}
            disabled={busy || saving}
            className="text-sm text-gray-600 hover:underline disabled:opacity-50"
          >
            {t('newDocument.skipForm')}
          </button>
        )}
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
      <label className="block" htmlFor="new-document-title">
        <span className="text-sm font-medium">{t('newDocument.titleLabel')}</span>
        <input
          id="new-document-title"
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
