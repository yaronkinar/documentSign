import { HAKNASOT_FORM_TEMPLATE_ID } from './haknasot-form.js';

export interface FormTemplateCatalogEntry {
  id: string;
  labelHe: string;
  labelEn: string;
  /** Shown when the document has an uploaded PDF (fields fill in sidebar only). */
  supportsUploadedPdf: boolean;
}

/** Built-in form templates users can attach after signature fields are assigned. */
export const FORM_TEMPLATE_CATALOG: FormTemplateCatalogEntry[] = [
  {
    id: HAKNASOT_FORM_TEMPLATE_ID,
    labelHe: 'הכנסות',
    labelEn: 'Municipal income (Haknasot)',
    supportsUploadedPdf: true,
  },
];

export function getFormTemplateCatalogEntry(
  id: string,
): FormTemplateCatalogEntry | undefined {
  return FORM_TEMPLATE_CATALOG.find((entry) => entry.id === id);
}

export function isKnownFormTemplateId(id: string): boolean {
  return FORM_TEMPLATE_CATALOG.some((entry) => entry.id === id);
}
