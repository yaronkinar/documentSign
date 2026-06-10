import type { PdfFormFieldTemplate } from '@docflow/shared';

import { stampFormFieldsOnPdf } from './filled-pdf-renderer';

/**
 * Stamps placed signature images onto an uploaded PDF for download/export.
 * Overlay coordinates (x, y, width, height) are percentages with y measured
 * from the top of the page — matching the PDFViewer overlay model.
 */
export interface SignatureStampInput {
  pageNumber: number;
  x: number;
  y: number;
  width: number;
  height: number;
  imageBytes: Buffer;
}

export async function renderSignedPdf(
  pdfBytes: Buffer,
  signatures: SignatureStampInput[],
): Promise<Buffer> {
  if (signatures.length === 0) return pdfBytes;

  const { PDFDocument } = await import('pdf-lib');
  const pdfDoc = await PDFDocument.load(pdfBytes);
  const pages = pdfDoc.getPages();

  for (const sig of signatures) {
    const page = pages[sig.pageNumber - 1];
    if (!page) continue;

    try {
      const img = await pdfDoc.embedPng(sig.imageBytes);
      // Skip stub images (< 10×10) — placeholders, not real signatures.
      if (img.width <= 10 && img.height <= 10) continue;

      const { width: pw, height: ph } = page.getSize();
      const boxLeft = (sig.x / 100) * pw;
      const boxWidth = (sig.width / 100) * pw;
      const boxHeight = (sig.height / 100) * ph;
      const boxTopFromTop = (sig.y / 100) * ph;
      const boxBottom = ph - boxTopFromTop - boxHeight;

      const ratio = Math.min(
        boxWidth / img.width,
        boxHeight / img.height,
      );

      page.drawImage(img, {
        x: boxLeft + (boxWidth - img.width * ratio) / 2,
        y: boxBottom + (boxHeight - img.height * ratio) / 2,
        width: img.width * ratio,
        height: img.height * ratio,
      });
    } catch {
      // not embeddable — skip this stamp
    }
  }

  return Buffer.from(await pdfDoc.save());
}

/** Stamp form field values, then signature images, onto an uploaded PDF. */
export async function renderFilledUploadedPdf(
  pdfBytes: Buffer,
  fields: PdfFormFieldTemplate[],
  formValues: Record<string, string>,
  signatures: SignatureStampInput[],
): Promise<Buffer> {
  let out = await stampFormFieldsOnPdf(pdfBytes, fields, formValues);
  if (signatures.length > 0) {
    out = await renderSignedPdf(out, signatures);
  }
  return out;
}
