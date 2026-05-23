import type { DocumentDto, SignatureFieldDto } from '@docflow/shared';
import {
  HEBREW_MULTI_SIGNER_FIELD_TEMPLATE,
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

export async function createMissingTemplateFields(
  doc: DocumentDto,
  existingFields: { stepId: string; signerId: string }[],
  createField: (mapping: FieldMappingInput) => Promise<SignatureFieldDto>,
  template: SignatureFieldTemplate[] = HEBREW_MULTI_SIGNER_FIELD_TEMPLATE,
): Promise<SignatureFieldDto[]> {
  const mappings = buildTemplateFieldMappings(doc.workflowSteps, template).filter(
    (mapping) =>
      !existingFields.some(
        (field) =>
          field.stepId === mapping.stepId &&
          field.signerId === mapping.signerId,
      ),
  );
  const created: SignatureFieldDto[] = [];
  for (const mapping of mappings) {
    created.push(await createField(mapping));
  }
  return created;
}

export { missingTemplateFieldMappings };
