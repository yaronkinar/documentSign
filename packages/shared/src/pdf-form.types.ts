export type PdfFormFieldType = 'text' | 'textarea' | 'date';

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
}
