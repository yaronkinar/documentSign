import type { DocumentDto, SignatureFieldDto } from '@docflow/shared';
import {
  HAKNASOT_FORM_TEMPLATE_ID,
  HEBREW_MULTI_SIGNER_FIELD_TEMPLATE,
  buildGenericUploadSignatureTemplate,
  buildTemplateFieldMappings,
  listTemplateSignatureSigners,
  missingTemplateFieldMappings,
  type SignatureFieldTemplate,
  type TemplateFieldMapping,
} from '@docflow/shared';

export type SignerRef = ReturnType<typeof listTemplateSignatureSigners>[number];

export type FieldMappingInput = TemplateFieldMapping;

export function listSignatureSigners(doc: DocumentDto) {
  return listTemplateSignatureSigners(doc.workflowSteps);
}

export function signersMissingFields(
  doc: DocumentDto,
  fields: { stepId: string; signerId: string }[],
): SignerRef[] {
  return listSignatureSigners(doc).filter(
    (signer) =>
      !fields.some(
        (field) =>
          field.stepId === signer.stepId && field.signerId === signer.signerId,
      ),
  );
}

export { buildTemplateFieldMappings };

function resolveAutoMapTemplate(doc: DocumentDto): SignatureFieldTemplate[] {
  if (doc.formTemplateId === HAKNASOT_FORM_TEMPLATE_ID) {
    return HEBREW_MULTI_SIGNER_FIELD_TEMPLATE;
  }
  const signerCount = listSignatureSigners(doc).length;
  const pageNumber = Math.max(1, doc.pageCount ?? 1);
  return buildGenericUploadSignatureTemplate(signerCount, pageNumber);
}

type ExistingSignatureField = {
  _id: string;
  stepId: string;
  signerId: string;
  signed?: boolean;
};

function sameSigner(
  field: { stepId: string; signerId: string },
  mapping: FieldMappingInput,
): boolean {
  return (
    String(field.stepId) === String(mapping.stepId) &&
    String(field.signerId) === String(mapping.signerId)
  );
}

/** Create missing fields and reposition existing unsigned fields from a template. */
export async function applyTemplateFieldMappings(
  doc: DocumentDto,
  existingFields: ExistingSignatureField[],
  handlers: {
    createField: (mapping: FieldMappingInput) => Promise<SignatureFieldDto>;
    updateField: (
      fieldId: string,
      mapping: FieldMappingInput,
    ) => Promise<SignatureFieldDto>;
  },
  template?: SignatureFieldTemplate[],
): Promise<SignatureFieldDto[]> {
  const resolvedTemplate = template ?? resolveAutoMapTemplate(doc);
  const mappings = buildTemplateFieldMappings(
    doc.workflowSteps,
    resolvedTemplate,
  );
  const results: SignatureFieldDto[] = [];

  for (const mapping of mappings) {
    const existing = existingFields.find(
      (field) => sameSigner(field, mapping) && !field.signed,
    );
    if (existing) {
      results.push(await handlers.updateField(existing._id, mapping));
      continue;
    }
    if (existingFields.some((field) => sameSigner(field, mapping))) {
      continue;
    }
    results.push(await handlers.createField(mapping));
  }

  return results;
}

export async function createMissingTemplateFields(
  doc: DocumentDto,
  existingFields: { stepId: string; signerId: string }[],
  createField: (mapping: FieldMappingInput) => Promise<SignatureFieldDto>,
  template?: SignatureFieldTemplate[],
): Promise<SignatureFieldDto[]> {
  const resolvedTemplate = template ?? resolveAutoMapTemplate(doc);
  const mappings = buildTemplateFieldMappings(
    doc.workflowSteps,
    resolvedTemplate,
  ).filter(
    (mapping) =>
      !existingFields.some((field) => sameSigner(field, mapping)),
  );
  const created: SignatureFieldDto[] = [];
  for (const mapping of mappings) {
    created.push(await createField(mapping));
  }
  return created;
}

export { missingTemplateFieldMappings };
