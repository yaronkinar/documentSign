export {
  HAKNASOT_PDF_LINES,
  HAKNASOT_PAGE_SIZE,
  type HaknasotPdfLine,
} from './haknasot-pdf-lines.js';

/** @deprecated Use HAKNASOT_PDF_LINES – kept for backward compatibility. */
export interface HaknasotPdfLayoutItem {
  page: number;
  text: string;
  x: number;
  y: number;
  size: number;
}

/** @deprecated Legacy word-extracted layout – no longer used for rendering. */
export const HAKNASOT_PDF_LAYOUT: HaknasotPdfLayoutItem[] = [];
