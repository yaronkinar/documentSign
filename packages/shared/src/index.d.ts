export type DocumentStatus = 'draft' | 'pending_review' | 'pending_signature' | 'approved' | 'rejected' | 'completed';
export type WorkflowStepStatus = 'pending' | 'in_progress' | 'completed' | 'skipped';
export type WorkflowStepType = 'review' | 'signature' | 'approval' | 'notification';
export type SignerStatus = 'pending' | 'signed' | 'rejected' | 'skipped';
export type SignatureType = 'drawn' | 'typed' | 'uploaded';
export type CommentType = 'general' | 'annotation' | 'rejection_reason' | 'approval_note';
export type UserRole = 'admin' | 'member' | 'guest';
export type ExecutionMode = 'sequential' | 'parallel';
export declare enum AuditEventType {
    DocumentCreated = "document_created",
    DocumentUploaded = "document_uploaded",
    DocumentViewed = "document_viewed",
    DocumentDeleted = "document_deleted",
    StatusChanged = "status_changed",
    StepStarted = "step_started",
    StepCompleted = "step_completed",
    StepSkipped = "step_skipped",
    SignerAdded = "signer_added",
    SignerInvited = "signer_invited",
    SignerSkipped = "signer_skipped",
    Signed = "signed",
    Rejected = "rejected",
    Commented = "commented",
    CommentResolved = "comment_resolved"
}
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
export interface SocketEvents {
    'document:status_changed': DocumentStatusChangedPayload;
    'step:completed': StepCompletedPayload;
    'signer:signed': SignerSignedPayload;
    'signer:rejected': SignerRejectedPayload;
    'comment:added': CommentAddedPayload;
    'comment:resolved': CommentResolvedPayload;
}
export type SocketEventName = keyof SocketEvents;
export interface SignerDto {
    _id: string;
    email: string;
    clerkId: string | null;
    name: string | null;
    status: SignerStatus;
    inviteSentAt: string | null;
    signedAt: string | null;
    rejectionReason: string | null;
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
    createdAt: string;
    updatedAt: string;
    fileUrl?: string;
}
export interface SavedSignatureDto {
    _id: string;
    label: string;
    imageUrl: string;
    type: SignatureType;
    isDefault: boolean;
    createdAt: string;
}
export interface SignatureDto {
    _id: string;
    documentId: string;
    stepId: string;
    signerId: string | null;
    signerEmail: string;
    pageNumber: number;
    x: number;
    y: number;
    width: number;
    height: number;
    imageUrl: string;
    signedAt: string;
}
export interface CommentDto {
    _id: string;
    documentId: string;
    authorId: string | null;
    authorEmail: string;
    content: string;
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
export interface GuestSigningDataDto {
    documentTitle: string;
    presignedPdfUrl: string;
    stepLabel: string;
    stepId: string;
    signerName: string | null;
    signerEmail: string;
    alreadySigned: boolean;
}
