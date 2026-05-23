/** Canonical haknasot form text lines for PDF generation. */
import lines from './haknasot-pdf-lines.json';

export interface HaknasotPdfLine {
  page: 1 | 2;
  text: string;
  y: number;
  size?: number;
  align?: 'right' | 'center' | 'left';
}

export const HAKNASOT_PDF_LINES = lines as HaknasotPdfLine[];

export const HAKNASOT_PAGE_SIZE = { width: 595.32, height: 842.04 } as const;
