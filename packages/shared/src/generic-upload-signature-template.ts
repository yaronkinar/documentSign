import type { SignatureFieldTemplate } from './signature-field-template.js';

/** Stack signature boxes on the bottom of a single-page (or last-page) uploaded PDF. */
export function buildGenericUploadSignatureTemplate(
  signerCount: number,
  pageNumber = 1,
): SignatureFieldTemplate[] {
  const rows = Math.max(signerCount, 1);
  const startY = 72;
  const rowGap = 4;
  const height = 3.5;
  return Array.from({ length: rows }, (_, index) => ({
    pageNumber,
    x: 55,
    y: startY + index * rowGap,
    width: 35,
    height,
    label: '',
  }));
}
