// ============================================================================
// DocFlow Shared Types
// Consumed by apps/api (NestJS) and apps/web (Next.js).
// ============================================================================

// ---------------------------------------------------------------------------
// Domain enums
// ---------------------------------------------------------------------------

export type DocumentStatus =
  | 'draft'
  | 'pending_review'
  | 'pending_signature'
  | 'approved'
  | 'rejected'
  | 'completed';

export type WorkflowStepStatus =
  | 'pending'
  | 'in_progress'
  | 'completed'
  | 'skipped';

export type WorkflowStepType =
  | 'review'
  | 'signature'
  | 'approval'
  | 'notification';

export type SignerStatus =
  | 'pending'
  | 'signed'
  | 'rejected'
  | 'skipped';

export type SignatureType = 'drawn' | 'typed' | 'uploaded';

export type CommentType =
  | 'general'
  | 'annotation'
  | 'rejection_reason'
  | 'approval_note';

export type UserRole = 'admin' | 'member' | 'guest';

export type OnboardingStatus = 'pending' | 'completed' | 'skipped';

export interface UserMeDto {
  _id: string;
  clerkId: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
  role: UserRole;
  onboardingStatus: OnboardingStatus;
}

export type ExecutionMode = 'sequential' | 'parallel';

export { getActiveSequentialSigner } from './signer-order.js';

// ---------------------------------------------------------------------------
// Audit event types
// ---------------------------------------------------------------------------

export enum AuditEventType {
  DocumentCreated = 'document_created',
  DocumentUploaded = 'document_uploaded',
  DocumentViewed = 'document_viewed',
  DocumentDeleted = 'document_deleted',
  StatusChanged = 'status_changed',
  StepStarted = 'step_started',
  StepCompleted = 'step_completed',
  StepSkipped = 'step_skipped',
  SignerAdded = 'signer_added',
  SignerInvited = 'signer_invited',
  SignerSkipped = 'signer_skipped',
  Signed = 'signed',
  Rejected = 'rejected',
  Commented = 'commented',
  CommentResolved = 'comment_resolved',
}

// ---------------------------------------------------------------------------
// Socket.io event contract
// Room name convention: `doc:${documentId}`
// ---------------------------------------------------------------------------

export interface SocketEventPayloadBase {
  documentId: string;
}

export interface DocumentStatusChangedPayload extends SocketEventPayloadBase {
  newStatus: DocumentStatus;
  previousStatus: DocumentStatus;
}

export interface StepCompletedPayload extends SocketEventPayloadBase {
  stepId: string;
  stepNumber: number;
}

export interface SignerSignedPayload extends SocketEventPayloadBase {
  stepId: string;
  signerEmail: string;
  signedAt: string;
}

export interface SignerRejectedPayload extends SocketEventPayloadBase {
  stepId: string;
  signerEmail: string;
  reason: string;
}

export interface CommentAddedPayload extends SocketEventPayloadBase {
  commentId: string;
  authorEmail: string;
  content: string;
  parentId: string | null;
}

export interface CommentResolvedPayload extends SocketEventPayloadBase {
  commentId: string;
  resolvedBy: string;
}

export interface NotificationNewPayload {
  notification: UserNotificationDto;
}

export interface SocketEvents {
  'document:status_changed': DocumentStatusChangedPayload;
  'step:completed': StepCompletedPayload;
  'signer:signed': SignerSignedPayload;
  'signer:rejected': SignerRejectedPayload;
  'comment:added': CommentAddedPayload;
  'comment:resolved': CommentResolvedPayload;
}

export interface UserSocketEvents {
  'notification:new': NotificationNewPayload;
}

export type SocketEventName = keyof SocketEvents;

// ---------------------------------------------------------------------------
// API DTO shapes (response types used by both client and server)
// ---------------------------------------------------------------------------

export interface SignerDto {
  _id: string;
  email: string;
  clerkId: string | null;
  name: string | null;
  status: SignerStatus;
  inviteSentAt: string | null;
  signedAt: string | null;
  rejectionReason: string | null;
  // NOTE: inviteTokenHash and inviteExpiry MUST NEVER appear here.
}

export interface WorkflowStepDto {
  _id: string;
  stepNumber: number;
  stepType: WorkflowStepType;
  label: string;
  executionMode: ExecutionMode;
  dueDate: string | null;
  status: WorkflowStepStatus;
  completedAt: string | null;
  signers: SignerDto[];
}

export type {
  PdfFormFieldType,
  PdfFormFieldTemplate,
} from './pdf-form.types.js';

export interface DocumentDto {
  _id: string;
  title: string;
  description: string | null;
  fileSize: number | null;
  pageCount: number | null;
  ownerId: string;
  status: DocumentStatus;
  currentStep: number;
  workflowSteps: WorkflowStepDto[];
  participantEmails: string[];
  participantClerkIds: string[];
  formTemplateId: string | null;
  /** Saved PDF template id when the document was created from /templates. */
  pdfTemplateId?: string | null;
  /** AI-detected fillable regions for uploaded PDFs (not used for haknasot template). */
  formFields?: PdfFormFieldTemplate[];
  formValues: Record<string, string>;
  createdAt: string;
  updatedAt: string;
  // Optional fields populated by specific endpoints:
  fileUrl?: string;
  /** True when the document has an uploaded PDF in storage (viewer uses source.pdf). */
  hasPdfFile?: boolean;
}

export interface SavedSignatureDto {
  _id: string;
  label: string;
  imageUrl: string; // presigned, never the raw key
  type: SignatureType;
  isDefault: boolean;
  createdAt: string;
}

/** Pre-configured signer in the owner's directory (title + name + optional signature). */
export interface SignerProfileDto {
  _id: string;
  /** PDF template id or built-in form template id (e.g. haknasot). */
  templateId: string;
  title: string;
  name: string;
  email: string | null;
  signatureImageUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SignatureDto {
  _id: string;
  documentId: string;
  stepId: string;
  signerId: string | null;
  signerEmail: string;
  signatureFieldId: string | null;
  pageNumber: number;
  x: number;
  y: number;
  width: number;
  height: number;
  imageUrl: string; // presigned
  signedAt: string;
}

/** Pre-assigned signature placement on the PDF, owned by a specific signer. */
export interface SignatureFieldDto {
  _id: string;
  stepId: string;
  signerId: string;
  signerEmail: string;
  signerName: string | null;
  pageNumber: number;
  x: number;
  y: number;
  width: number;
  height: number;
  label: string | null;
  signed: boolean;
}

export interface CommentDto {
  _id: string;
  documentId: string;
  authorId: string | null;
  authorEmail: string;
  authorName: string | null;
  content: string;
  mentionedEmails: string[];
  pageNumber: number | null;
  x: number | null;
  y: number | null;
  type: CommentType;
  resolved: boolean;
  resolvedBy: string | null;
  parentId: string | null;
  createdAt: string;
  updatedAt: string;
}

export type UserNotificationType = 'comment' | 'comment_reply';

export interface UserNotificationDto {
  _id: string;
  type: UserNotificationType;
  documentId: string;
  documentTitle: string;
  commentId: string;
  parentCommentId: string | null;
  authorName: string | null;
  authorEmail: string;
  contentPreview: string;
  read: boolean;
  createdAt: string;
}

export interface TemplateFieldDto {
  _id: string;
  label: string;
  pageNumber: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PdfTemplateDto {
  _id: string;
  name: string;
  fileUrl: string | null;
  fileSize: number | null;
  pageCount: number | null;
  isDefault: boolean;
  fields: TemplateFieldDto[];
  formFields: PdfFormFieldTemplate[];
  createdAt: string;
  updatedAt: string;
}

export interface AuditEventDto {
  _id: string;
  documentId: string;
  actorId: string | null;
  actorEmail: string;
  actorName: string | null;
  eventType: AuditEventType;
  metadata: Record<string, unknown> | null;
  ipAddress: string | null;
  createdAt: string;
}

// Guest signing endpoint response (must be minimal — no other signers exposed)
export interface GuestSigningDataDto {
  documentTitle: string;
  presignedPdfUrl?: string;
  formTemplateId?: string | null;
  formFields?: PdfFormFieldTemplate[];
  formValues?: Record<string, string>;
  stepLabel: string;
  stepId: string;
  signerName: string | null;
  signerEmail: string;
  alreadySigned: boolean;
  signatureFields: SignatureFieldDto[];
}

/** Field positions (% of page) aligned with the Hebrew sample PDF. */
export type { SignatureFieldTemplate } from './signature-field-template.js';

export {
  MUNICIPAL_APPROVAL_SIGNER_TITLES,
  MUNICIPAL_APPROVAL_FIELD_LAYOUT,
  MUNICIPAL_APPROVAL_SIGNATURE_ROWS,
  HEBREW_MULTI_SIGNER_FIELD_TEMPLATE,
} from './approval-template.js';

export {
  missingTemplateFieldMappings,
  buildTemplateFieldMappings,
  resolveApprovalRowIndices,
  listTemplateSignatureSigners,
  type TemplateFieldMapping,
  type TemplateSignerRef,
  type TemplateWorkflowStep,
} from './template-signature-fields.js';

export { buildGenericUploadSignatureTemplate } from './generic-upload-signature-template.js';

export {
  MENTION_PATTERN,
  formatSignerMention,
  formatSignerMentionPlain,
  appendSignerMentionToDraft,
  extractMentionedEmails,
  resolveMentionedEmails,
  parseCommentContent,
  filterSignersByNameQuery,
  signerDisplayName,
  type CommentContentPart,
  type SignerMentionRef,
} from './comment-mentions.js';

export const HEBREW_SAMPLE_PDF_FILENAME = 'haknasot.pdf';

export const HEBREW_SAMPLE_DEFAULT_TITLE = 'הכנסות';

import type { PdfFormFieldTemplate } from './pdf-form.types.js';
import { getHaknasotFormFields } from './haknasot-form.js';

export {
  HAKNASOT_FORM_TEMPLATE_ID,
  HAKNASOT_FORM_FIELDS,
  getHaknasotFormFields,
} from './haknasot-form.js';

export {
  FORM_TEMPLATE_CATALOG,
  getFormTemplateCatalogEntry,
  isKnownFormTemplateId,
  type FormTemplateCatalogEntry,
} from './form-template-catalog.js';

export { HAKNASOT_SAMPLE_FORM_VALUES } from './haknasot-sample-values.js';

export function resolveFormTemplateFields(
  templateId: string | null | undefined,
): PdfFormFieldTemplate[] {
  if (templateId === 'haknasot') {
    return getHaknasotFormFields();
  }
  return [];
}

export {
  allocateFormFieldId,
  buildPdfFormFieldsFromExtracted,
  resolveDocumentFormFields,
  allowedDocumentFormFieldIds,
  isEditableDocumentFormField,
} from './document-form-fields.js';
