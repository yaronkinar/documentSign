'use client';

import { useAuth } from '@clerk/nextjs';
import { useRouter } from 'next/navigation';
import { Download, MessageSquarePlus, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type {
  CommentDto,
  DocumentDto,
  PdfFormFieldType,
  PdfTemplateDto,
  SavedSignatureDto,
  SignatureDto,
  SignatureFieldDto,
  SignerDto,
  SignatureFieldTemplate,
} from '@docflow/shared';
import { resolveDocumentFormFields } from '@docflow/shared';

import {
  CommentComposer,
  CommentContent,
  type CommentSignerOption,
  type SignerTagRequest,
} from '@/components/documents/CommentComposer';
import {
  DraftWorkflowSetup,
  draftWorkflowFallbackRoles,
} from '@/components/documents/DraftWorkflowSetup';
import {
  DocumentDraftStepper,
  type DraftSetupStep,
} from '@/components/documents/DocumentDraftStepper';
import { DocumentFormFieldsEditor } from '@/components/documents/DocumentFormFieldsEditor';
import { DocumentFormFillPanel } from '@/components/documents/DocumentFormFillPanel';
import { PdfLoadingSkeleton } from '@/components/pdf/PdfLoadingSkeleton';
import { PDFViewer } from '@/components/pdf/PDFViewer';
import { SignaturePad } from '@/components/pdf/SignaturePad';
import { StatusBadge } from '@/components/StatusBadge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useApiClient } from '@/lib/api-client';
import { useTranslation } from '@/lib/i18n/LocaleProvider';
import { useDocumentSocket } from '@/lib/socket';
import { useDocumentPdfUrl } from '@/lib/use-document-pdf-url';
import { useTemplatePdfUrl } from '@/lib/use-template-pdf-url';
import { clampPlacementToPageCount } from '@/lib/pdf-signature-placement';
import {
  createMissingTemplateFields,
  listSignatureSigners,
  signersMissingFields,
} from '@/lib/signature-field-mapping';
import { cn } from '@/lib/utils';

interface Props {
  doc: DocumentDto;
  initialSignatures: SignatureDto[];
  initialSignatureFields: SignatureFieldDto[];
  initialComments: CommentDto[];
  myClerkId: string;
  myEmail: string;
}

interface SigTarget {
  page: number;
  x: number;
  y: number;
  w?: number;
  h?: number;
  fieldId?: string;
}

interface CommentTarget {
  page: number;
  x: number;
  y: number;
}

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';
const CLIENT_BYPASS_TOKEN =
  process.env.NEXT_PUBLIC_BYPASS_AUTH === 'true'
    ? (process.env.NEXT_PUBLIC_BYPASS_TOKEN ?? null)
    : null;

type DocumentSidebarTab = 'workflow' | 'form-setup' | 'form-fill' | 'comments';

function hasFilledFormValues(values: Record<string, string>): boolean {
  return Object.values(values).some((value) => value.trim().length > 0);
}

function safePdfFileName(title: string): string {
  const cleaned = title
    .trim()
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '-')
    .replace(/\s+/g, ' ')
    .slice(0, 80);
  return cleaned || 'document';
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
  const { getToken } = useAuth();
  const router = useRouter();
  const { t } = useTranslation();
  const [doc, setDoc] = useState<DocumentDto>(initialDoc);
  const [signatures, setSignatures] = useState<SignatureDto[]>(initialSignatures);
  const [signatureFields, setSignatureFields] = useState<SignatureFieldDto[]>(
    initialSignatureFields,
  );
  const [comments, setComments] = useState<CommentDto[]>(initialComments);
  const [sidebarTab, setSidebarTab] =
    useState<DocumentSidebarTab>('workflow');
  const [formFillDraft, setFormFillDraft] = useState<Record<string, string>>(
    () => initialDoc.formValues ?? {},
  );

  useEffect(() => {
    if (initialDoc.status === 'draft' && initialDoc.workflowSteps.length === 0) {
      setSidebarTab('workflow');
    }
  }, [initialDoc.status, initialDoc.workflowSteps.length]);
  const [placementMode, setPlacementMode] = useState(false);
  const [fieldPlacementMode, setFieldPlacementMode] = useState(false);
  const [commentMode, setCommentMode] = useState(false);
  const [pendingCommentTarget, setPendingCommentTarget] =
    useState<CommentTarget | null>(null);
  const [signerTagRequest, setSignerTagRequest] = useState<SignerTagRequest | null>(
    null,
  );
  const [selectedCommentId, setSelectedCommentId] = useState<string | null>(null);
  const [selectedSignerKey, setSelectedSignerKey] = useState('');
  const [showSigPad, setShowSigPad] = useState(false);
  const [pendingSigTargets, setPendingSigTargets] = useState<SigTarget[] | null>(null);
  const [savedSignatures, setSavedSignatures] = useState<SavedSignatureDto[]>([]);
  const [profileSignatureId, setProfileSignatureId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [resendBusy, setResendBusy] = useState<string | null>(null);
  const [submitBusy, setSubmitBusy] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [autoMapBusy, setAutoMapBusy] = useState(false);
  const [summaryBusy, setSummaryBusy] = useState(false);
  const [formSaveBusy, setFormSaveBusy] = useState(false);
  const [attachFormBusy, setAttachFormBusy] = useState(false);
  const [formFieldPlacementMode, setFormFieldPlacementMode] = useState(false);
  const [activeFormFieldId, setActiveFormFieldId] = useState<string | null>(null);
  const [saveTemplateBusy, setSaveTemplateBusy] = useState(false);
  const [downloadBusy, setDownloadBusy] = useState(false);
  const autoMapOnLoadRef = useRef(false);
  const formStepPromptRef = useRef(false);
  const [draftFallbackRoles, setDraftFallbackRoles] = useState<string[]>([]);

  const formFields = resolveDocumentFormFields(doc);
  const hasForm = formFields.length > 0;
  const formFilled = hasFilledFormValues(doc.formValues ?? {});

  useEffect(() => {
    setFormFillDraft(doc.formValues ?? {});
  }, [doc.formValues]);
  const isTemplateDoc = !!doc.formTemplateId;
  const hasUploadedPdf = doc.hasPdfFile ?? !!doc.fileUrl;
  // Haknasot (and other form templates) use the static template PDF with
  // form-field and signature overlays in the viewer. Uploaded PDFs are fetched
  // via source.pdf (auth proxy) so pdf.js avoids storage CORS issues.
  const {
    pdfUrl: uploadedPdfUrl,
    loading: uploadedPdfLoading,
    error: uploadedPdfError,
  } = useDocumentPdfUrl(hasUploadedPdf ? doc._id : null);
  const { pdfUrl: templatePdfUrl, loading: templatePdfLoading } =
    useTemplatePdfUrl(
      doc.formTemplateId && !hasUploadedPdf ? doc.formTemplateId : null,
    );
  const viewerPdfUrl = uploadedPdfUrl ?? templatePdfUrl;
  const viewerLoading = hasUploadedPdf ? uploadedPdfLoading : templatePdfLoading;

  const pageCount = doc.pageCount ?? 1;
  const displaySignatures = clampPlacementToPageCount(signatures, pageCount);
  const displaySignatureFields = clampPlacementToPageCount(signatureFields, pageCount);

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
  const hasWorkflowSteps = doc.workflowSteps.length > 0;
  const canSubmitDraft =
    hasWorkflowSteps && doc.workflowSteps.every((s) => s.signers.length > 0);
  const canSaveAsTemplate = isOwner && signatureFields.length > 0 && !!doc.fileUrl;
  const fieldsAssigned = isTemplateDoc || allSignersMapped;
  const canManageFormFields = isOwner && isDraft && hasUploadedPdf;
  const readyForFormStep =
    canManageFormFields &&
    fieldsAssigned &&
    !fieldPlacementMode &&
    !formFieldPlacementMode;
  const showDraftStepper =
    isOwner && isDraft && hasUploadedPdf && !isTemplateDoc;
  const editableFormFieldIds = (doc.formFields ?? []).map((f) => f.id);
  const formSetupTabVisible = canManageFormFields && !isTemplateDoc;
  const formFillTabVisible = hasForm;
  const draftSetupStep: DraftSetupStep = (() => {
    if (!hasWorkflowSteps) return 'workflow';
    if (!isTemplateDoc && !allSignersMapped) return 'map';
    if (formSetupTabVisible && !hasForm) return 'form-setup';
    if (formFillTabVisible && !formFilled) return 'form-fill';
    return 'send';
  })();
  const viewerFormValues =
    sidebarTab === 'form-fill' ? formFillDraft : (doc.formValues ?? {});

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
  const commentSignerOptions: CommentSignerOption[] = (() => {
    const byKey = new Map<string, CommentSignerOption>();
    for (const step of doc.workflowSteps) {
      for (const signer of step.signers) {
        const email = signer.email.trim().toLowerCase();
        const name = signer.name?.trim() ?? '';
        if (!email && !name) continue;
        const key = email || `name:${name.toLowerCase()}`;
        if (byKey.has(key)) continue;
        byKey.set(key, {
          email: signer.email,
          name: signer.name,
          stepLabel: step.label,
        });
      }
    }
    return [...byKey.values()];
  })();

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
    setFormFieldPlacementMode(false);
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

  async function updateFieldPosition(
    fieldId: string,
    patch: { pageNumber?: number; x?: number; y?: number; width?: number; height?: number },
  ) {
    try {
      const updated = await api.patch<SignatureFieldDto>(
        `/documents/${doc._id}/signature-fields/${fieldId}`,
        patch,
      );
      setSignatureFields((prev) =>
        prev.map((f) => (f._id === fieldId ? updated : f)),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : t('document.moveFieldFailed'));
    }
  }

  function onFieldMove(fieldId: string, page: number, x: number, y: number) {
    if (!isOwner || !isDraft) return;
    const rounded = {
      x: Number(x.toFixed(2)),
      y: Number(y.toFixed(2)),
    };
    setSignatureFields((prev) =>
      prev.map((f) =>
        f._id === fieldId ? { ...f, pageNumber: page, ...rounded } : f,
      ),
    );
    void updateFieldPosition(fieldId, { pageNumber: page, ...rounded });
  }

  function onFieldResize(fieldId: string, width: number, height: number) {
    if (!isOwner || !isDraft) return;
    const rounded = {
      width: Number(width.toFixed(2)),
      height: Number(height.toFixed(2)),
    };
    setSignatureFields((prev) =>
      prev.map((f) => (f._id === fieldId ? { ...f, ...rounded } : f)),
    );
    void updateFieldPosition(fieldId, rounded);
  }

  function mapPdfTemplateFields(
    template: PdfTemplateDto,
  ): SignatureFieldTemplate[] {
    return template.fields.map((f) => ({
      pageNumber: f.pageNumber,
      x: f.x,
      y: f.y,
      width: f.width,
      height: f.height,
      label: f.label,
    }));
  }

  async function loadPdfTemplateLayout(): Promise<SignatureFieldTemplate[] | undefined> {
    if (isTemplateDoc) return undefined;
    try {
      if (doc.pdfTemplateId) {
        const linked = await api.get<PdfTemplateDto>(
          `/templates/${doc.pdfTemplateId}`,
        );
        if (linked.fields.length > 0) return mapPdfTemplateFields(linked);
      }
      const templates = await api.get<PdfTemplateDto[]>('/templates');
      const pick =
        templates.find((t) => t.isDefault && t.fields.length > 0) ??
        templates.find((t) => t.fields.length > 0);
      if (!pick) return undefined;
      return pick.fields.map((f) => ({
        pageNumber: f.pageNumber,
        x: f.x,
        y: f.y,
        width: f.width,
        height: f.height,
        label: f.label,
      }));
    } catch {
      return undefined;
    }
  }

  async function autoMapSignersFromTemplate() {
    if (!isOwner || !isDraft) return;
    setAutoMapBusy(true);
    setError(null);
    try {
      const pdfTemplate = await loadPdfTemplateLayout();
      const created = await createMissingTemplateFields(
        doc,
        signatureFields,
        (mapping) =>
          api.post<SignatureFieldDto>(
            `/documents/${doc._id}/signature-fields`,
            mapping,
          ),
        pdfTemplate,
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
    api.get<SavedSignatureDto[]>('/users/me/signatures')
      .then(setSavedSignatures)
      .catch(() => {});
    api.get<{ signerProfileId: string } | null>(`/documents/${doc._id}/my-signer-profile`)
      .then((r) => { if (r) setProfileSignatureId(r.signerProfileId); })
      .catch(() => {});
  }, [doc._id]);

  useEffect(() => {
    if (!isDraft || hasWorkflowSteps) return;
    const templateId = doc.pdfTemplateId ?? doc.formTemplateId;
    if (doc.formTemplateId) {
      setDraftFallbackRoles(
        draftWorkflowFallbackRoles(doc.formTemplateId, []),
      );
      return;
    }
    if (doc.pdfTemplateId) {
      api
        .get<PdfTemplateDto>(`/templates/${doc.pdfTemplateId}`)
        .then((template) => {
          const labels = template.fields
            .map((f) => f.label.trim())
            .filter(Boolean);
          setDraftFallbackRoles(draftWorkflowFallbackRoles(null, labels));
        })
        .catch(() => setDraftFallbackRoles([]));
      return;
    }
    if (!templateId) {
      api
        .post<{ signers: string[] }>(`/documents/${doc._id}/extract-signers`)
        .then(({ signers }) => setDraftFallbackRoles(signers))
        .catch(() => setDraftFallbackRoles([]));
    }
  }, [
    doc._id,
    doc.formTemplateId,
    doc.pdfTemplateId,
    isDraft,
    hasWorkflowSteps,
  ]);

  useEffect(() => {
    if (autoMapOnLoadRef.current || isTemplateDoc) return;
    if (!isOwner || !isDraft) return;
    if (signersMissingFields(doc, signatureFields).length === 0) return;
    autoMapOnLoadRef.current = true;
    void autoMapSignersFromTemplate();
  }, [doc._id, isTemplateDoc]);

  useEffect(() => {
    if (!readyForFormStep || !formFillTabVisible) return;
    if (formStepPromptRef.current) return;
    formStepPromptRef.current = true;
    setSidebarTab('form-fill');
  }, [readyForFormStep, formFillTabVisible]);

  function goToFormSetup() {
    setFormFieldPlacementMode(false);
    setSidebarTab('form-setup');
  }

  function goToFormFill() {
    setFormFieldPlacementMode(false);
    setFormFillDraft(doc.formValues ?? {});
    setSidebarTab('form-fill');
  }

  function handleSidebarTabChange(tab: DocumentSidebarTab) {
    if (tab !== 'form-setup') setFormFieldPlacementMode(false);
    setSidebarTab(tab);
  }

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

  async function attachFormTemplate(formTemplateId: string) {
    setAttachFormBusy(true);
    setError(null);
    try {
      const fresh = await api.patch<DocumentDto>(`/documents/${doc._id}/form-template`, {
        formTemplateId,
      });
      setDoc(fresh);
      goToFormSetup();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('document.saveFormFailed'));
    } finally {
      setAttachFormBusy(false);
    }
  }

  async function extractFormFieldsFromPdf() {
    setAttachFormBusy(true);
    setError(null);
    try {
      await api.post(`/documents/${doc._id}/extract-form-fields`);
      const fresh = await api.get<DocumentDto>(`/documents/${doc._id}`);
      setDoc(fresh);
      goToFormSetup();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('document.saveFormFailed'));
    } finally {
      setAttachFormBusy(false);
    }
  }

  function startFormFieldPlacement() {
    if (!isOwner || !isDraft || !hasUploadedPdf) return;
    setError(null);
    setFieldPlacementMode(false);
    setPlacementMode(false);
    setCommentMode(false);
    setFormFieldPlacementMode(true);
    setSidebarTab('form-setup');
  }

  async function onFormFieldPlace(page: number, x: number, y: number) {
    if (!formFieldPlacementMode) return;
    const label = `${t('document.formFieldLabel')} ${(doc.formFields?.length ?? 0) + 1}`;
    setError(null);
    try {
      const fresh = await api.post<DocumentDto>(`/documents/${doc._id}/form-fields`, {
        label,
        pageNumber: page,
        x: Number(x.toFixed(2)),
        y: Number(y.toFixed(2)),
      });
      setDoc(fresh);
      setActiveFormFieldId(fresh.formFields?.at(-1)?.id ?? null);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : t('document.formFieldAddFailed'),
      );
    }
  }

  async function onFormFieldMove(fieldId: string, page: number, x: number, y: number) {
    try {
      const fresh = await api.patch<DocumentDto>(
        `/documents/${doc._id}/form-fields/${fieldId}`,
        {
          pageNumber: page,
          x: Number(x.toFixed(2)),
          y: Number(y.toFixed(2)),
        },
      );
      setDoc(fresh);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : t('document.formFieldUpdateFailed'),
      );
    }
  }

  async function onFormFieldResize(fieldId: string, width: number, height: number) {
    try {
      const fresh = await api.patch<DocumentDto>(
        `/documents/${doc._id}/form-fields/${fieldId}`,
        {
          width: Number(width.toFixed(2)),
          height: Number(height.toFixed(2)),
        },
      );
      setDoc(fresh);
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
    setError(null);
    try {
      const fresh = await api.patch<DocumentDto>(
        `/documents/${doc._id}/form-fields/${fieldId}`,
        patch,
      );
      setDoc(fresh);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : t('document.formFieldUpdateFailed'),
      );
    }
  }

  async function deleteFormField(fieldId: string) {
    setError(null);
    try {
      const fresh = await api.delete<DocumentDto>(
        `/documents/${doc._id}/form-fields/${fieldId}`,
      );
      setDoc(fresh);
      if (activeFormFieldId === fieldId) setActiveFormFieldId(null);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : t('document.formFieldDeleteFailed'),
      );
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

  async function downloadCurrentPdf() {
    setDownloadBusy(true);
    setError(null);
    try {
      const token = CLIENT_BYPASS_TOKEN ?? (await getToken());
      if (!token) throw new Error('Not authenticated');
      const res = await fetch(`${API_URL}/documents/${doc._id}/download.pdf`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
      });
      if (!res.ok) throw new Error(`Download failed (${res.status})`);
      const blob = await res.blob();
      if (blob.size === 0) throw new Error('Downloaded PDF is empty');

      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = objectUrl;
      anchor.download = `${safePdfFileName(doc.title)}.pdf`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('document.downloadFailed'));
    } finally {
      setDownloadBusy(false);
    }
  }

  async function saveAsTemplate() {
    const defaultName = `${doc.title} template`;
    const name = window.prompt(t('document.saveAsTemplatePrompt'), defaultName);
    if (!name?.trim()) return;
    setSaveTemplateBusy(true);
    setError(null);
    try {
      const template = await api.post<PdfTemplateDto>(
        `/documents/${doc._id}/save-as-template`,
        { name: name.trim() },
      );
      router.push(`/templates/${template._id}`);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : t('document.saveAsTemplateFailed'),
      );
    } finally {
      setSaveTemplateBusy(false);
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

  /** Open the signature pad for the given placement targets (or assigned fields if omitted). */
  function startSign(fields?: SigTarget[]) {
    if (!activeStep || !mySignerInActiveStep) return;
    // Priority 1: pre-uploaded signer-profile signature
    if (profileSignatureId) {
      void signWithImage('', undefined, fields, profileSignatureId);
      return;
    }
    // Priority 2: user's own default saved signature
    const defaultSig = savedSignatures.find((s) => s.isDefault) ?? null;
    if (defaultSig) {
      void signWithImage('', defaultSig._id, fields);
      return;
    }
    setPendingSigTargets(fields ?? null);
    setShowSigPad(true);
  }

  /** Called after the user picks/draws their signature in the pad. */
  async function signWithImage(imageKey: string, savedSignatureId?: string, overrideTargets?: SigTarget[], signerProfileId?: string) {
    if (!activeStep || !mySignerInActiveStep) return;
    setError(null);
    try {
      const targets = overrideTargets ?? pendingSigTargets ?? myAssignedFields.map((f) => ({
        page: f.pageNumber,
        x: f.x,
        y: f.y,
        w: f.width,
        h: f.height,
        fieldId: f._id,
      }));
      for (const tgt of targets) {
        const newSig = await api.post<SignatureDto>(`/documents/${doc._id}/sign`, {
          documentId: doc._id,
          stepId: activeStep._id,
          pageNumber: tgt.page,
          x: tgt.x,
          y: tgt.y,
          width: tgt.w ?? 15,
          height: tgt.h ?? 6,
          ...(imageKey && { imageKey }),
          signatureFieldId: tgt.fieldId,
          ...(savedSignatureId && { savedSignatureId }),
          ...(signerProfileId && { signerProfileId }),
        });
        setSignatures((prev) => [...prev, newSig]);
      }
      setPlacementMode(false);
      setPendingSigTargets(null);
      await refreshDoc();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('document.recordSignatureFailed'));
    }
  }

  function onPlace(page: number, x: number, y: number) {
    if (!placementMode) return;
    setPlacementMode(false);
    startSign([{ page, x, y }]);
  }

  function onFieldClick(field: SignatureFieldDto) {
    if (!canSign || !mySignerInActiveStep) return;
    if (field.signerId !== mySignerInActiveStep._id) return;
    startSign([{
      page: field.pageNumber,
      x: field.x,
      y: field.y,
      w: field.width,
      h: field.height,
      fieldId: field._id,
    }]);
  }

  function resolveSignerForCommentTag(payload: {
    signerId: string;
    email: string;
    name: string | null;
  }): { email: string; name: string | null } | null {
    for (const step of doc.workflowSteps) {
      for (const signer of step.signers) {
        if (signer._id === payload.signerId) {
          return {
            email: signer.email || payload.email,
            name: signer.name ?? payload.name,
          };
        }
      }
    }
    const email = payload.email.trim();
    if (email.includes('@')) {
      return { email, name: payload.name };
    }
    if (payload.name?.trim()) {
      return { email, name: payload.name };
    }
    return null;
  }

  function tagSignerInComment(payload: {
    signerId: string;
    email: string;
    name: string | null;
    pageNumber: number;
    x: number;
    y: number;
  }) {
    const signer = resolveSignerForCommentTag(payload);
    if (!signer) return;
    setSidebarTab('comments');
    setCommentMode(false);
    setPlacementMode(false);
    setPendingCommentTarget({
      page: payload.pageNumber,
      x: payload.x,
      y: payload.y,
    });
    setSignerTagRequest({
      key: Date.now(),
      email: signer.email,
      name: signer.name,
    });
  }

  async function onAddComment(
    content: string,
    mentionedEmails: string[],
    page?: number,
    x?: number,
    y?: number,
  ) {
    try {
      const c = await api.post<CommentDto>(`/documents/${doc._id}/comments`, {
        content,
        mentionedEmails,
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
      <header className="flex items-center justify-between border-b border-border bg-surface px-6 py-3">
        <div>
          <h1 className="text-lg font-semibold text-fg">{doc.title}</h1>
          <div className="mt-0.5 flex items-center gap-2 text-xs">
            <StatusBadge status={doc.status} />
            {activeStep && (
              <span className="text-fg-muted">
                {t('document.currentStep', { label: activeStep.label })}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {canSaveAsTemplate && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => void saveAsTemplate()}
              disabled={saveTemplateBusy}
              className="border-violet-300 text-violet-900 hover:bg-violet-50"
            >
              {saveTemplateBusy ? t('common.saving') : t('document.saveAsTemplate')}
            </Button>
          )}
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={downloadCurrentPdf}
            disabled={!viewerPdfUrl || viewerLoading || downloadBusy}
          >
            <Download className="me-1.5 h-3.5 w-3.5" />
            {downloadBusy ? t('common.downloading') : t('common.downloadPdf')}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={deleteDocument}
            disabled={deleteBusy}
            className="border-danger/30 text-danger hover:bg-danger/5 hover:text-danger"
          >
            <Trash2 className="me-1.5 h-3.5 w-3.5" />
            {deleteBusy ? t('common.deleting') : t('document.deleteDocument')}
          </Button>
        </div>
      </header>

      {error && (
        <div className="border-b border-danger/30 bg-danger/5 px-6 py-2 text-sm text-danger">
          {error}
        </div>
      )}

      {doc.description ? (
        <div className="border-b border-border bg-surface-muted px-6 py-3 text-sm text-fg">
          <p className="text-xs font-medium uppercase tracking-wide text-fg-muted">
            {t('document.summary')}
          </p>
          <p className="mt-1 whitespace-pre-wrap leading-relaxed">{doc.description}</p>
        </div>
      ) : isOwner ? (
        <div className="border-b border-border bg-surface-muted px-6 py-3 text-sm">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={generateSummary}
            disabled={summaryBusy}
          >
            {summaryBusy ? t('newDocument.summarizing') : t('document.generateSummary')}
          </Button>
        </div>
      ) : null}

      {isOwner && isDraft && !isTemplateDoc && (
        <div className="border-b border-info/30 bg-info/5 px-6 py-3 text-sm text-fg">
          <strong>{t('document.mapBeforeSendTitle')}</strong>{' '}
          {t('document.mapBeforeSendBody')}
        </div>
      )}

      {isOwner && isDraft && isTemplateDoc && (
        <div className="border-b border-success/30 bg-success/5 px-6 py-3 text-sm text-fg">
          {t('document.templateSignersReady')}
        </div>
      )}

      {readyForFormStep && formFillTabVisible && sidebarTab !== 'form-fill' && (
        <div className="border-b border-info/30 bg-info/5 px-6 py-3 text-sm text-fg">
          {t('document.fillFormBeforeSend')}{' '}
          <button
            type="button"
            onClick={goToFormFill}
            className="font-medium text-info underline hover:no-underline"
          >
            {t('document.formFillTab')}
          </button>
        </div>
      )}

      {formSetupTabVisible && !hasForm && sidebarTab !== 'form-setup' && (
        <div className="border-b border-info/30 bg-info/5 px-6 py-3 text-sm text-fg">
          {t('document.setupFormBeforeSend')}{' '}
          <button
            type="button"
            onClick={goToFormSetup}
            className="font-medium text-info underline hover:no-underline"
          >
            {t('document.formSetupTab')}
          </button>
        </div>
      )}

      {hasForm &&
        !formFilled &&
        formSetupTabVisible &&
        sidebarTab === 'form-setup' && (
          <div className="border-b border-info/30 bg-info/5 px-6 py-3 text-sm text-fg">
            {t('document.formFieldsReadyToFill')}{' '}
            <button
              type="button"
              onClick={goToFormFill}
              className="font-medium text-info underline hover:no-underline"
            >
              {t('document.formFillTab')}
            </button>
          </div>
        )}

      {showDraftStepper && (
        <DocumentDraftStepper
          current={draftSetupStep}
          hasWorkflow={hasWorkflowSteps}
          signersMapped={isTemplateDoc || allSignersMapped}
          hasFormFields={hasForm}
          formFilled={formFilled}
        />
      )}

      <div className="flex flex-1 overflow-hidden">
        <section className="flex-1 overflow-auto bg-bg p-4 md:p-6">
          {viewerLoading && !viewerPdfUrl && <PdfLoadingSkeleton />}
          {uploadedPdfError && hasUploadedPdf && (
            <div className="mx-auto max-w-3xl rounded-lg border border-danger/30 bg-danger/5 p-4 text-sm text-danger">
              {t('document.pdfLoadFailed')}: {uploadedPdfError}
            </div>
          )}
          {viewerPdfUrl && (
            <PDFViewer
              pdfUrl={viewerPdfUrl}
              signatures={displaySignatures}
              signatureFields={displaySignatureFields}
              comments={comments}
              formFields={formFields}
              formValues={viewerFormValues}
              placementMode={placementMode}
              fieldPlacementMode={fieldPlacementMode}
              fieldEditMode={
                isOwner &&
                isDraft &&
                !formFieldPlacementMode &&
                !fieldPlacementMode &&
                sidebarTab !== 'form-setup' &&
                sidebarTab !== 'form-fill'
              }
              commentMode={commentMode}
              activeSignerId={canSign ? mySignerInActiveStep?._id : null}
              onSignaturePlace={onPlace}
              onFieldPlace={onFieldPlace}
              onFieldMove={onFieldMove}
              onFieldResize={onFieldResize}
              onFieldClick={onFieldClick}
              onSignerTag={tagSignerInComment}
              onCommentPin={(page, x, y) => {
                setPendingCommentTarget({ page, x, y });
                setSidebarTab('comments');
                setCommentMode(false);
              }}
              onCommentSelect={(commentId) => {
                setSidebarTab('comments');
                setSelectedCommentId(commentId);
              }}
              activeFormFieldId={activeFormFieldId}
              formFieldPlacementMode={formFieldPlacementMode}
              formFieldEditMode={
                isOwner &&
                isDraft &&
                hasUploadedPdf &&
                !formFieldPlacementMode &&
                !fieldPlacementMode &&
                sidebarTab === 'form-setup'
              }
              editableFormFieldIds={editableFormFieldIds}
              onFormFieldPlace={onFormFieldPlace}
              onFormFieldMove={onFormFieldMove}
              onFormFieldResize={onFormFieldResize}
              onFormFieldSelect={setActiveFormFieldId}
            />
          )}
          {!isTemplateDoc && (fieldPlacementMode || isDraft) && (
            <div className="mx-auto mt-4 max-w-3xl rounded-lg border border-border bg-surface p-4 text-sm shadow-sm">
              <div className="mb-2 font-medium text-fg">{t('document.signerMapping')}</div>
              {isDraft && isOwner && signatureFields.length > 0 && (
                <p className="mb-2 text-xs text-fg-muted">
                  {t('document.dragToMoveField')}
                </p>
              )}
              {canSaveAsTemplate && (
                <div className="mb-3">
                  <p className="mb-2 text-xs text-fg-muted">
                    {t('document.saveAsTemplateHint')}
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => void saveAsTemplate()}
                    disabled={saveTemplateBusy}
                    className="w-full border-violet-300 text-violet-900 hover:bg-violet-50"
                  >
                    {saveTemplateBusy
                      ? t('common.saving')
                      : t('document.saveAsTemplate')}
                  </Button>
                </div>
              )}
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
                      className="flex items-center justify-between rounded-md bg-surface-muted px-2 py-1 text-xs"
                    >
                      <span>
                        {mapped ? '✓' : '○'}{' '}
                        {signer.name ?? signer.email}{' '}
                        <span className="text-fg-muted">({signer.stepLabel})</span>
                      </span>
                      <span className={mapped ? 'text-success' : 'text-warning'}>
                        {mapped ? t('document.mapped') : t('document.notMapped')}
                      </span>
                    </li>
                  );
                })}
              </ul>
              {signatureFields.length > 0 && (
                <>
                  <div className="mb-2 font-medium text-fg">{t('document.placedFields')}</div>
                  <ul className="space-y-1">
                    {signatureFields.map((field) => (
                      <li
                        key={field._id}
                        className="flex items-center justify-between rounded-md bg-surface-muted px-2 py-1 text-xs"
                      >
                        <span>
                          {t('document.page', { n: field.pageNumber })}:{' '}
                          {field.signerName ?? field.signerEmail}
                          {field.signed && (
                            <span className="ms-2 text-success">
                              {t('document.signed')}
                            </span>
                          )}
                        </span>
                        {isDraft && isOwner && !field.signed && (
                          <Button
                            type="button"
                            variant="link"
                            size="sm"
                            onClick={() => removeField(field._id)}
                            className="h-auto px-0 text-xs text-danger"
                          >
                            {t('common.remove')}
                          </Button>
                        )}
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          )}
          <div className="sticky bottom-4 mx-auto mt-4 flex max-w-4xl flex-wrap justify-center gap-2 rounded-lg border border-border bg-surface/95 p-2 shadow-sm backdrop-blur">
            {isOwner && isDraft && !fieldPlacementMode && (
              <>
                {!isTemplateDoc && (
                  <>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={autoMapSignersFromTemplate}
                      disabled={autoMapBusy || allSignersMapped}
                      className="border-success/40 text-success hover:bg-success/5"
                    >
                      {autoMapBusy ? t('common.mapping') : t('document.autoMapSigners')}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={startFieldAssignment}
                      className="border-info/40 text-info hover:bg-info/5"
                    >
                      {t('document.assignManually')}
                    </Button>
                  </>
                )}
                <Button
                  type="button"
                  onClick={submitDocument}
                  disabled={
                    submitBusy ||
                    !canSubmitDraft ||
                    (!isTemplateDoc && !allSignersMapped)
                  }
                  title={
                    !canSubmitDraft ? t('document.setupWorkflowHint') : undefined
                  }
                >
                  {submitBusy ? t('common.sending') : t('document.sendToSigners')}
                </Button>
              </>
            )}
            {!isTemplateDoc && fieldPlacementMode && (
              <div className="flex flex-wrap items-center justify-center gap-2 rounded-md border border-border bg-surface px-3 py-2">
                <label className="text-sm text-fg-muted">
                  {t('document.assignTo')}
                  <select
                    className="ms-2 rounded-md border border-input bg-background px-2 py-1 text-sm text-fg"
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
                <span className="text-xs text-fg-muted">
                  {t('document.clickToPlaceField')} · {t('document.dragToMoveField')}
                </span>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={() => setFieldPlacementMode(false)}
                >
                  {t('common.done')}
                </Button>
              </div>
            )}
            {canSign && usesAssignedFields && (
              <Button type="button" onClick={() => startSign()}>
                ✍ {t('document.signDocument')}
              </Button>
            )}
            {canSign && !usesAssignedFields && !placementMode && (
              <Button type="button" onClick={() => setPlacementMode(true)}>
                ✍ {t('document.signDocument')}
              </Button>
            )}
            {!usesAssignedFields && placementMode && (
              <div className="flex items-center gap-2 rounded-md border border-info/30 bg-info/5 px-3 py-2 text-sm text-fg">
                <span>{t('document.clickToPlaceSignature')}</span>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={() => setPlacementMode(false)}
                >
                  {t('document.cancelPlacement')}
                </Button>
              </div>
            )}
            <Button
              type="button"
              variant="outline"
              onClick={downloadCurrentPdf}
              disabled={!viewerPdfUrl || viewerLoading || downloadBusy}
            >
              <Download className="me-1.5 h-3.5 w-3.5" />
              {downloadBusy ? t('common.downloading') : t('common.downloadPdf')}
            </Button>
            <Button
              type="button"
              variant={commentMode ? 'default' : 'outline'}
              onClick={() => {
                setCommentMode((v) => !v);
                setSidebarTab('comments');
                setPendingCommentTarget(null);
                setPlacementMode(false);
                setFieldPlacementMode(false);
                setFormFieldPlacementMode(false);
              }}
              className={cn(commentMode && 'bg-warning text-accent-fg hover:bg-warning/90')}
            >
              <MessageSquarePlus className="me-1.5 h-3.5 w-3.5" />
              {commentMode ? t('document.cancelComment') : t('document.addComment')}
            </Button>
          </div>
        </section>

        <aside className="flex w-[360px] shrink-0 flex-col overflow-hidden border-l border-border bg-surface">
          <Tabs
            value={sidebarTab}
            onValueChange={(v) => handleSidebarTabChange(v as DocumentSidebarTab)}
            className="flex min-h-0 flex-1 flex-col"
          >
            <TabsList className="h-auto w-full shrink-0 flex-wrap rounded-none border-b border-border bg-surface-muted p-1">
              <TabsTrigger value="workflow" className="flex-1">
                {t('document.workflow')}
              </TabsTrigger>
              {formSetupTabVisible && (
                <TabsTrigger value="form-setup" className="flex-1">
                  {t('document.formSetupTab')}
                </TabsTrigger>
              )}
              {formFillTabVisible && (
                <TabsTrigger value="form-fill" className="flex-1">
                  {t('document.formFillTab')}
                </TabsTrigger>
              )}
              <TabsTrigger value="comments" className="flex-1">
                {t('document.comments')}
              </TabsTrigger>
            </TabsList>
            <div className="min-h-0 flex-1 overflow-auto">
          {sidebarTab === 'form-setup' && formSetupTabVisible && (
            <div className="space-y-4 p-4">
              <DocumentFormFieldsEditor
                doc={doc}
                fields={formFields}
                busy={attachFormBusy}
                formFieldPlacementMode={formFieldPlacementMode}
                onStartAddField={startFormFieldPlacement}
                onCancelAddField={() => setFormFieldPlacementMode(false)}
                onSelectTemplate={(id) => void attachFormTemplate(id)}
                onExtractFromPdf={() => void extractFormFieldsFromPdf()}
                onUpdateField={(fieldId, patch) =>
                  void updateFormFieldMeta(fieldId, patch)
                }
                onDeleteField={(fieldId) => void deleteFormField(fieldId)}
                onSelectField={setActiveFormFieldId}
                activeFieldId={activeFormFieldId}
                onContinueToFill={hasForm ? goToFormFill : undefined}
              />
            </div>
          )}
          {sidebarTab === 'form-fill' && formFillTabVisible && (
            <div className="space-y-4 p-4">
              <p className="text-xs text-fg-muted">{t('document.formFillStepHint')}</p>
              <DocumentFormFillPanel
                fields={formFields}
                values={formFillDraft}
                readOnly={!isOwner || !isDraft}
                saving={formSaveBusy}
                onChange={setFormFillDraft}
                onSave={saveFormValues}
              />
            </div>
          )}
          {sidebarTab === 'workflow' && isDraft && isOwner && !hasWorkflowSteps && (
            <DraftWorkflowSetup
              documentId={doc._id}
              templateId={doc.pdfTemplateId ?? doc.formTemplateId ?? null}
              fallbackRoleNames={draftFallbackRoles}
              currentUserEmail={myEmail}
              currentUserName=""
              onSaved={(fresh) => setDoc(fresh)}
            />
          )}
          {sidebarTab === 'workflow' && (hasWorkflowSteps || !isDraft || !isOwner) && (
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
          <CommentsSidebar
            className={sidebarTab === 'comments' ? 'flex h-full flex-col' : 'hidden'}
            comments={comments}
            signers={commentSignerOptions}
            myEmail={myEmail}
            pendingTarget={pendingCommentTarget}
            tagSignerRequest={signerTagRequest}
            onTagSignerConsumed={() => setSignerTagRequest(null)}
            selectedCommentId={selectedCommentId}
            onAdd={async (content, mentionedEmails, target) => {
              await onAddComment(
                content,
                mentionedEmails,
                target?.page,
                target?.x,
                target?.y,
              );
              setPendingCommentTarget(null);
            }}
            onCancelTarget={() => setPendingCommentTarget(null)}
            onResolve={async (id) => {
              await api.patch(`/comments/${id}/resolve`);
              await refreshComments();
            }}
          />
            </div>
          </Tabs>
        </aside>
      </div>

      {showSigPad && (
        <SignaturePad
          mode="registered"
          savedSignatures={savedSignatures}
          defaultTab={savedSignatures.length > 0 ? 'library' : 'draw'}
          uploadBlob={uploadSignatureBlob}
          onClose={() => {
            setShowSigPad(false);
            setPendingSigTargets(null);
          }}
          onComplete={(imageKey, savedSignatureId) => {
            setShowSigPad(false);
            void signWithImage(imageKey, savedSignatureId);
          }}
        />
      )}
    </main>
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
    <ol className="space-y-4 overflow-auto p-4">
      {doc.workflowSteps.map((step) => (
        <li key={step._id} className="rounded-lg border border-border bg-surface p-3 shadow-sm">
          <div className="mb-2 flex items-center justify-between text-sm font-medium text-fg">
            <span>{step.label}</span>
            <span className="text-xs text-fg-muted">
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
    <li className="flex items-center justify-between rounded-md bg-surface-muted px-2 py-1">
      <span title={t(`signerStatus.${signer.status}`)}>
        <span className="me-1">{icon}</span>
        {signer.email}
      </span>
      {showOwnerControls && (
        <span className="flex gap-1">
          <Button
            type="button"
            variant="link"
            size="sm"
            onClick={onResend}
            disabled={resendLoading}
            className="h-auto px-1 text-xs text-info"
          >
            {resendLoading ? t('common.sending') : t('common.resend')}
          </Button>
          <Button
            type="button"
            variant="link"
            size="sm"
            onClick={onSkip}
            className="h-auto px-1 text-xs text-fg-muted"
          >
            {t('common.skip')}
          </Button>
        </span>
      )}
    </li>
  );
}

function CommentsSidebar({
  className,
  comments,
  signers,
  myEmail,
  pendingTarget,
  tagSignerRequest,
  onTagSignerConsumed,
  selectedCommentId,
  onAdd,
  onCancelTarget,
  onResolve,
}: {
  className?: string;
  comments: CommentDto[];
  signers: CommentSignerOption[];
  myEmail: string;
  pendingTarget: CommentTarget | null;
  tagSignerRequest: SignerTagRequest | null;
  onTagSignerConsumed: () => void;
  selectedCommentId: string | null;
  onAdd: (
    content: string,
    mentionedEmails: string[],
    target?: CommentTarget | null,
  ) => void | Promise<void>;
  onCancelTarget: () => void;
  onResolve: (id: string) => void;
}) {
  const { t } = useTranslation();

  const tree = buildCommentTree(comments);

  return (
    <div className={className ?? 'flex h-full flex-col'}>
      <ul className="flex-1 space-y-3 overflow-auto p-4 text-sm">
        {tree.map((c) => (
          <CommentNode
            key={c._id}
            comment={c}
            signers={signers}
            selectedCommentId={selectedCommentId}
            onResolve={onResolve}
          />
        ))}
      </ul>
      <div className="border-t border-border p-3">
        {pendingTarget && (
          <div className="mb-2 rounded-md border border-warning/30 bg-pill-bg px-2 py-1.5 text-xs text-pill-fg">
            {t('document.commentOnPage', { n: String(pendingTarget.page) })}
            <Button
              type="button"
              variant="link"
              size="sm"
              onClick={onCancelTarget}
              className="ms-2 h-auto px-0 text-xs text-pill-fg underline"
            >
              {t('common.cancel')}
            </Button>
          </div>
        )}
        <CommentComposer
          signers={signers}
          myEmail={myEmail}
          placeholder={t('document.addCommentPlaceholder')}
          mentionHint={t('document.mentionSignersHint')}
          postLabel={t('common.post')}
          tagSignerRequest={tagSignerRequest}
          onTagSignerConsumed={onTagSignerConsumed}
          onPost={async (content, mentionedEmails) => {
            await onAdd(content, mentionedEmails, pendingTarget);
          }}
        />
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
  signers,
  selectedCommentId,
  onResolve,
}: {
  comment: CommentNode;
  signers: CommentSignerOption[];
  selectedCommentId: string | null;
  onResolve: (id: string) => void;
}) {
  const { t } = useTranslation();
  const itemRef = useRef<HTMLLIElement>(null);
  const selected = comment._id === selectedCommentId;

  useEffect(() => {
    if (!selected) return;
    itemRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [selected]);

  const authorLabel =
    comment.authorName?.trim() ||
    comment.authorEmail.split('@')[0] ||
    comment.authorEmail;

  return (
    <li
      ref={itemRef}
      className={cn(
        'rounded-lg border p-2',
        selected
          ? 'border-warning/50 bg-pill-bg'
          : 'border-border bg-surface',
      )}
    >
      <div className="text-xs text-fg-muted">
        <span className="font-medium text-fg">{authorLabel}</span>
        {comment.authorName?.trim() && (
          <span className="ms-1 text-fg-subtle">{comment.authorEmail}</span>
        )}
        {comment.resolved && (
          <span className="ms-2 text-success">{t('document.resolved')}</span>
        )}
      </div>
      <div className="mt-1">
        <CommentContent content={comment.content} signers={signers} />
      </div>
      {!comment.resolved && (
        <Button
          type="button"
          variant="link"
          size="sm"
          onClick={() => onResolve(comment._id)}
          className="mt-1 h-auto px-0 text-xs text-fg-muted"
        >
          {t('common.resolve')}
        </Button>
      )}
      {comment.children.length > 0 && (
        <ul className="ms-3 mt-2 space-y-2 border-s ps-3">
          {comment.children.map((child) => (
            <CommentNode
              key={child._id}
              comment={child}
              signers={signers}
              selectedCommentId={selectedCommentId}
              onResolve={onResolve}
            />
          ))}
        </ul>
      )}
    </li>
  );
}
