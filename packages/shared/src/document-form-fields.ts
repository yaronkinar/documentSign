import type { PdfFormFieldTemplate, PdfFormFieldType } from './pdf-form.types.js';
import { HAKNASOT_FORM_TEMPLATE_ID, getHaknasotFormFields } from './haknasot-form.js';

export interface ExtractedPdfFormFieldInput {
  label: string;
  pageNumber: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

function inferFieldType(label: string): PdfFormFieldType {
  const lower = label.toLowerCase();
  if (/תאריך|date/i.test(lower)) return 'date';
  if (label.length > 80) return 'textarea';
  return 'text';
}

function slugifyFieldId(label: string, used: Set<string>): string {
  const base =
    label
      .trim()
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^\p{L}\p{N}]+/gu, '_')
      .replace(/^_|_$/g, '')
      .slice(0, 48) || 'field';
  let id = base;
  let n = 2;
  while (used.has(id)) {
    id = `${base}_${n}`;
    n += 1;
  }
  used.add(id);
  return id;
}

/** Turn vision-extracted boxes into stable form field definitions for a document. */
export function buildPdfFormFieldsFromExtracted(
  extracted: ExtractedPdfFormFieldInput[],
): PdfFormFieldTemplate[] {
  const used = new Set<string>();
  return extracted.map((field) => {
    const id = slugifyFieldId(field.label, used);
    return {
      id,
      label: field.label,
      type: inferFieldType(field.label),
      section: `page_${field.pageNumber}`,
      pageNumber: field.pageNumber,
      x: field.x,
      y: field.y,
      width: field.width,
      height: field.height,
    };
  });
}

export function resolveDocumentFormFields(doc: {
  formTemplateId?: string | null;
  formFields?: PdfFormFieldTemplate[] | null;
}): PdfFormFieldTemplate[] {
  if (doc.formTemplateId === HAKNASOT_FORM_TEMPLATE_ID) {
    return getHaknasotFormFields();
  }
  return doc.formFields ?? [];
}

export function allowedDocumentFormFieldIds(doc: {
  formTemplateId?: string | null;
  formFields?: PdfFormFieldTemplate[] | null;
}): Set<string> {
  return new Set(resolveDocumentFormFields(doc).map((f) => f.id));
}
