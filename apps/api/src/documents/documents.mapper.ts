import type { DocumentDto, SignerDto, WorkflowStepDto } from '@docflow/shared';
import type { DocumentDocument } from './document.schema';

/**
 * Maps a Mongoose DocumentDocument to a sanitized DocumentDto.
 * Strips: fileKey, completedFileKey, inviteTokenHash.
 * Optionally attaches a presigned fileUrl.
 */
export function toDocumentDto(
  doc: DocumentDocument,
  options?: { fileUrl?: string },
): DocumentDto {
  return {
    _id: String(doc._id),
    title: doc.title,
    description: doc.description ?? null,
    fileSize: doc.fileSize ?? null,
    pageCount: doc.pageCount ?? null,
    ownerId: doc.ownerId,
    status: doc.status,
    currentStep: doc.currentStep,
    workflowSteps: doc.workflowSteps.map(toWorkflowStepDto),
    participantEmails: doc.participantEmails,
    participantClerkIds: doc.participantClerkIds,
    formTemplateId: doc.formTemplateId ?? null,
    formValues: doc.formValues ?? {},
    createdAt: (doc as unknown as { createdAt: Date }).createdAt.toISOString(),
    updatedAt: (doc as unknown as { updatedAt: Date }).updatedAt.toISOString(),
    ...(options?.fileUrl ? { fileUrl: options.fileUrl } : {}),
  };
}

function toWorkflowStepDto(step: DocumentDocument['workflowSteps'][number]): WorkflowStepDto {
  return {
    _id: String(step._id),
    stepNumber: step.stepNumber,
    stepType: step.stepType,
    label: step.label,
    executionMode: step.executionMode,
    dueDate: step.dueDate ? step.dueDate.toISOString() : null,
    status: step.status,
    completedAt: step.completedAt ? step.completedAt.toISOString() : null,
    signers: step.signers.map(toSignerDto),
  };
}

function toSignerDto(signer: DocumentDocument['workflowSteps'][number]['signers'][number]): SignerDto {
  // SECRET fields (inviteTokenHash, inviteExpiry) are deliberately omitted.
  return {
    _id: String(signer._id),
    email: signer.email,
    clerkId: signer.clerkId,
    name: signer.name,
    status: signer.status,
    inviteSentAt: signer.inviteSentAt ? signer.inviteSentAt.toISOString() : null,
    signedAt: signer.signedAt ? signer.signedAt.toISOString() : null,
    rejectionReason: signer.rejectionReason,
  };
}
