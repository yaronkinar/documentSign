export type PdfFormFieldType = 'text' | 'textarea' | 'date' | 'checkbox';

/** Static template field mapped to a region on a PDF (% of page). */
export interface PdfFormFieldTemplate {
  id: string;
  label: string;
  type: PdfFormFieldType;
  section: string;
  pageNumber: number;
  x: number;
  y: number;
  width: number;
  height: number;
  /** Exact value found at this field's location in the source PDF, if any — shown as copyable reference text when filling a new document. */
  referenceValue?: string | null;
}
