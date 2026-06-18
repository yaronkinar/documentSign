/**
 * Stamps fillable form field values onto a PDF using the same % coordinate
 * model as the PDFViewer overlays and haknasot-renderer.
 */
import fs from 'node:fs';
import path from 'node:path';

import type { PdfFormFieldTemplate } from '@docflow/shared';

/** Strip lone surrogates and replace non-breaking spaces with regular spaces. */
export function sanitizeFormText(s: string): string {
  let out = '';
  for (let i = 0; i < s.length; i++) {
    const code = s.charCodeAt(i);
    if (code >= 0xd800 && code <= 0xdfff) continue;
    if (code === 0xa0) {
      out += ' ';
      continue;
    }
    out += s[i];
  }
  return out.trim();
}

const HEBREW_RE = /[֐-׿יִ-ﭏ]/;

let cachedFontBytes: Uint8Array | null = null;

function resolveAssetPath(...segments: string[]): string {
  const candidates = [
    path.resolve(__dirname, '..', '..', '..', '..', ...segments),
    path.resolve(__dirname, '..', '..', '..', ...segments),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  throw new Error(`asset not found: ${segments.join('/')}`);
}

function loadHebrewFont(): Uint8Array {
  if (!cachedFontBytes) {
    const p = resolveAssetPath(
      'apps',
      'web',
      'public',
      'fonts',
      'NotoSansHebrew-Regular.ttf',
    );
    cachedFontBytes = fs.readFileSync(p);
  }
  return new Uint8Array(cachedFontBytes);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type PdfPage = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type PdfFont = any;

export interface FormFieldFonts {
  hebrewFont: PdfFont;
  latinFont: PdfFont;
}

export async function embedFormFieldFonts(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  pdfDoc: any,
): Promise<FormFieldFonts> {
  const { StandardFonts } = await import('pdf-lib');
  const fontkit = (await import('@pdf-lib/fontkit')).default;
  pdfDoc.registerFontkit(fontkit);
  const hebrewFont = await pdfDoc.embedFont(loadHebrewFont());
  const latinFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
  return { hebrewFont, latinFont };
}

export function drawFormFieldValue(
  page: PdfPage,
  field: Pick<
    PdfFormFieldTemplate,
    'pageNumber' | 'x' | 'y' | 'width' | 'height'
  >,
  rawValue: string,
  fonts: FormFieldFonts,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  rgb: (r: number, g: number, b: number) => any,
): void {
  const raw = sanitizeFormText(rawValue);
  if (!raw) return;

  const { width: pw, height: ph } = page.getSize();
  const boxLeft = (field.x / 100) * pw;
  const boxWidth = (field.width / 100) * pw;
  const boxTopFromTop = (field.y / 100) * ph;
  const boxHeight = (field.height / 100) * ph;

  const hasHebrew = HEBREW_RE.test(raw);
  const font = hasHebrew ? fonts.hebrewFont : fonts.latinFont;

  let fontSize = Math.max(7, Math.min(10, boxHeight * 0.75));
  const maxTextWidth = boxWidth - 2;
  while (fontSize > 5 && font.widthOfTextAtSize(raw, fontSize) > maxTextWidth) {
    fontSize -= 0.5;
  }
  const textWidth = Math.min(
    font.widthOfTextAtSize(raw, fontSize),
    maxTextWidth,
  );
  const x = hasHebrew ? boxLeft + boxWidth - textWidth - 1 : boxLeft + 1;
  const y = ph - boxTopFromTop - fontSize * 0.85;

  page.drawText(raw, {
    x,
    y,
    size: fontSize,
    font,
    color: rgb(0, 0, 0),
  });
}

/** True when a checkbox form value means "checked". */
export function isCheckboxChecked(rawValue: string | undefined): boolean {
  const v = sanitizeFormText(rawValue ?? '').toLowerCase();
  return v !== '' && v !== 'false' && v !== '0' && v !== 'no';
}

/** Mask the pre-printed glyph, draw a fresh box, and a check mark when set. */
export function drawCheckbox(
  page: PdfPage,
  field: Pick<PdfFormFieldTemplate, 'x' | 'y' | 'width' | 'height'>,
  checked: boolean,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  rgb: (r: number, g: number, b: number) => any,
): void {
  const { width: pw, height: ph } = page.getSize();
  const boxLeft = (field.x / 100) * pw;
  const boxWidth = (field.width / 100) * pw;
  const boxTopFromTop = (field.y / 100) * ph;
  const boxHeight = (field.height / 100) * ph;
  const bottom = ph - boxTopFromTop - boxHeight;

  // Cover the form's pre-printed ☐/☑ glyph so selection is fully dynamic.
  page.drawRectangle({
    x: boxLeft,
    y: bottom,
    width: boxWidth,
    height: boxHeight,
    color: rgb(1, 1, 1),
  });

  const side = Math.min(boxWidth, boxHeight) * 0.72;
  const sx = boxLeft + (boxWidth - side) / 2;
  const sy = bottom + (boxHeight - side) / 2;
  page.drawRectangle({
    x: sx,
    y: sy,
    width: side,
    height: side,
    borderColor: rgb(0.25, 0.25, 0.25),
    borderWidth: 0.8,
    color: rgb(1, 1, 1),
  });
  if (checked) {
    const green = rgb(0.05, 0.45, 0.12);
    page.drawLine({
      start: { x: sx + side * 0.18, y: sy + side * 0.5 },
      end: { x: sx + side * 0.42, y: sy + side * 0.24 },
      thickness: 1.3,
      color: green,
    });
    page.drawLine({
      start: { x: sx + side * 0.42, y: sy + side * 0.24 },
      end: { x: sx + side * 0.84, y: sy + side * 0.8 },
      thickness: 1.3,
      color: green,
    });
  }
}

/** Draw form field values onto an existing PDF document (mutates pdfDoc). */
export async function stampFormFieldsOnDocument(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  pdfDoc: any,
  fields: readonly PdfFormFieldTemplate[],
  formValues: Record<string, string>,
  skipFieldIds: Set<string> = new Set(),
): Promise<void> {
  const fonts = await embedFormFieldFonts(pdfDoc);
  const { rgb } = await import('pdf-lib');
  const pages = pdfDoc.getPages();

  for (const field of fields) {
    if (skipFieldIds.has(field.id)) continue;
    const page = pages[field.pageNumber - 1];
    if (!page) continue;

    if (field.type === 'checkbox') {
      // Always render: masks the pre-printed glyph so state is fully dynamic.
      drawCheckbox(page, field, isCheckboxChecked(formValues[field.id]), rgb);
      continue;
    }

    const rawVal = formValues[field.id];
    if (rawVal === undefined || rawVal === '') continue;

    drawFormFieldValue(page, field, rawVal, fonts, rgb);
  }
}

/** Load PDF bytes, stamp form values, return flattened buffer. */
export async function stampFormFieldsOnPdf(
  pdfBytes: Buffer,
  fields: readonly PdfFormFieldTemplate[],
  formValues: Record<string, string>,
  skipFieldIds: Set<string> = new Set(),
): Promise<Buffer> {
  if (fields.length === 0) return pdfBytes;

  const hasValues = fields.some((f) => {
    if (skipFieldIds.has(f.id)) return false;
    const v = formValues[f.id];
    return v !== undefined && sanitizeFormText(v) !== '';
  });
  if (!hasValues) return pdfBytes;

  const { PDFDocument } = await import('pdf-lib');
  const pdfDoc = await PDFDocument.load(pdfBytes);
  await stampFormFieldsOnDocument(pdfDoc, fields, formValues, skipFieldIds);
  return Buffer.from(await pdfDoc.save());
}
