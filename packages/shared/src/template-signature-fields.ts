import {
  HEBREW_MULTI_SIGNER_FIELD_TEMPLATE,
  MUNICIPAL_APPROVAL_FIELD_LAYOUT,
} from './approval-template.js';
import { HAKNASOT_FORM_TEMPLATE_ID } from './haknasot-form.js';
import type { SignatureFieldTemplate } from './signature-field-template.js';

export interface TemplateSignerRef {
  stepId: string;
  signerId: string;
  email: string;
  name: string | null;
  stepLabel: string;
}

export interface TemplateFieldMapping {
  stepId: string;
  signerId: string;
  pageNumber: number;
  x: number;
  y: number;
  width: number;
  height: number;
  label: string | null;
}

export interface TemplateWorkflowStep {
  _id: string;
  stepType: string;
  label: string;
  signers: Array<{ _id: string; email: string; name: string | null }>;
}

function resolveTemplateForForm(
  formTemplateId: string | null,
): SignatureFieldTemplate[] | null {
  if (formTemplateId === HAKNASOT_FORM_TEMPLATE_ID) {
    return HEBREW_MULTI_SIGNER_FIELD_TEMPLATE;
  }
  return null;
}

export function listTemplateSignatureSigners(
  workflowSteps: TemplateWorkflowStep[],
): TemplateSignerRef[] {
  return workflowSteps
    .filter(
      (step) => step.stepType === 'signature' || step.stepType === 'approval',
    )
    .flatMap((step) =>
      step.signers.map((signer) => ({
        stepId: step._id,
        signerId: signer._id,
        email: signer.email,
        name: signer.name,
        stepLabel: step.label,
      })),
    );
}

export function buildTemplateFieldMappings(
  workflowSteps: TemplateWorkflowStep[],
  template: SignatureFieldTemplate[],
): TemplateFieldMapping[] {
  const signers = listTemplateSignatureSigners(workflowSteps);
  const usedSlots = new Set<number>();
  return signers.map((signer, index) => {
    const slot = resolveTemplateSlot(signer, template, usedSlots, index);
    return {
      stepId: signer.stepId,
      signerId: signer.signerId,
      pageNumber: slot.pageNumber,
      x: slot.x,
      y: slot.y,
      width: slot.width,
      height: slot.height,
      label: signer.name ?? slot.label ?? signer.email,
    };
  });
}

function resolveTemplateSlot(
  signer: TemplateSignerRef,
  template: SignatureFieldTemplate[],
  usedSlots: Set<number>,
  signerIndex: number,
): SignatureFieldTemplate {
  if (signer.name) {
    const byLabel = template.findIndex(
      (slot, index) => !usedSlots.has(index) && slot.label === signer.name,
    );
    if (byLabel >= 0) {
      usedSlots.add(byLabel);
      return template[byLabel]!;
    }
  }

  const byOrder = template.findIndex((_, index) => !usedSlots.has(index));
  if (byOrder >= 0) {
    usedSlots.add(byOrder);
    return template[byOrder]!;
  }

  return fallbackSlot(signerIndex, signer);
}

function fallbackSlot(
  index: number,
  signer: TemplateSignerRef,
): SignatureFieldTemplate {
  const row = index % 11;
  return {
    pageNumber: MUNICIPAL_APPROVAL_FIELD_LAYOUT.pageNumber,
    x: MUNICIPAL_APPROVAL_FIELD_LAYOUT.x,
    y:
      MUNICIPAL_APPROVAL_FIELD_LAYOUT.startY +
      row * MUNICIPAL_APPROVAL_FIELD_LAYOUT.rowGap,
    width: MUNICIPAL_APPROVAL_FIELD_LAYOUT.width,
    height: MUNICIPAL_APPROVAL_FIELD_LAYOUT.height,
    label: signer.name ?? signer.email,
  };
}

/** Mappings for signers that do not yet have a signature field. */
export function missingTemplateFieldMappings(
  formTemplateId: string | null,
  workflowSteps: TemplateWorkflowStep[],
  existingFields: Array<{ stepId: string; signerId: string }>,
): TemplateFieldMapping[] {
  const template = resolveTemplateForForm(formTemplateId);
  if (!template) return [];

  return buildTemplateFieldMappings(workflowSteps, template).filter(
    (mapping) =>
      !existingFields.some(
        (field) =>
          field.stepId === mapping.stepId &&
          field.signerId === mapping.signerId,
      ),
  );
}
