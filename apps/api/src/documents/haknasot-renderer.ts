/**
 * Renders a flattened haknasot PDF: starts from the static template,
 * stamps every filled form field, draws the contract-type ellipse, and
 * stamps each municipal-approval signature row with the real signer's
 * image + name + date.
 *
 * Mirrors scripts/test-haknasot-fill.mjs so the live viewer matches the
 * smoketest output exactly.
 */
import fs from 'node:fs';
import path from 'node:path';

import {
  HAKNASOT_FORM_FIELDS,
  MUNICIPAL_APPROVAL_SIGNATURE_ROWS,
} from '@docflow/shared';


/** Strip lone surrogates and replace non-breaking spaces with regular spaces. */
function sanitizeText(s: string): string {
  let out = '';
  for (let i = 0; i < s.length; i++) {
    const code = s.charCodeAt(i);
    if (code >= 0xD800 && code <= 0xDFFF) continue;
    if (code === 0xA0) { out += ' '; continue; }
    out += s[i];
  }
  return out.trim();
}

const HEBREW_RE = /[֐-׿יִ-ﭏ]/;

// Offsets for circling one of the three printed contract-type options
// on the form. The contract_type field anchors at חדש.
const CONTRACT_TYPE_OFFSETS: Record<string, number> = {
  'חדש': 0,
  'הארכה': -10.7,
  'הרחבה': -21.85,
  'הערכה': -10.7, // legacy alias for הארכה
};

const APPROVAL_NAME_BOX = { x: 52.4, width: 8.7 } as const;
const APPROVAL_DATE_BOX = { x: 16.9, width: 8.5 } as const;

let cachedTemplateBytes: Uint8Array | null = null;
let cachedFontBytes: Uint8Array | null = null;

function resolveAssetPath(...segments: string[]): string {
  // apps/api/src or apps/api/dist – walk up to the repo root either way.
  const candidates = [
    path.resolve(__dirname, '..', '..', '..', '..', ...segments),
    path.resolve(__dirname, '..', '..', '..', ...segments),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  throw new Error(`haknasot asset not found: ${segments.join('/')}`);
}

function loadTemplate(): Uint8Array {
  if (!cachedTemplateBytes) {
    const p = resolveAssetPath('apps', 'web', 'public', 'samples', 'haknasot.pdf');
    cachedTemplateBytes = fs.readFileSync(p);
  }
  // Return a fresh copy each call so pdf-lib cannot mutate the cached original.
  return new Uint8Array(cachedTemplateBytes);
}

function loadFont(): Uint8Array {
  if (!cachedFontBytes) {
    const p = resolveAssetPath('apps', 'web', 'public', 'fonts', 'NotoSansHebrew-Regular.ttf');
    cachedFontBytes = fs.readFileSync(p);
  }
  return new Uint8Array(cachedFontBytes);
}

export interface SignedRowInput {
  rowIndex: number;
  name: string | null;
  email: string;
  signedAt: Date | null;
  imageBytes: Buffer | null;
}

export interface RenderHaknasotPdfOpts {
  formValues: Record<string, string>;
  signedRows: SignedRowInput[];
  contractTypeSelection?: string | null;
}

function formatRowDate(date: Date | null): string {
  if (!date) return '';
  const d = String(date.getDate()).padStart(2, '0');
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const y = date.getFullYear();
  return `${d}/${m}/${y}`;
}

export async function renderHaknasotPdf(
  opts: RenderHaknasotPdfOpts,
): Promise<Buffer> {
  const { PDFDocument, rgb, StandardFonts } = await import('pdf-lib');
  const fontkit = (await import('@pdf-lib/fontkit')).default;

  const pdfDoc = await PDFDocument.load(loadTemplate());
  pdfDoc.registerFontkit(fontkit);
  const hebrewFont = await pdfDoc.embedFont(loadFont());
  // Helvetica for dates, numbers, and any purely-ASCII content — NotoSansHebrew
  // does not reliably embed Latin digit glyphs through pdf-lib's subsetter.
  const latinFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const latinBoldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const pages = pdfDoc.getPages();

  const contractTypeField = HAKNASOT_FORM_FIELDS.find(
    (f) => f.id === 'contract_type',
  );

  for (const field of HAKNASOT_FORM_FIELDS) {
    if (field.id === 'contract_type') continue;
    const page = pages[field.pageNumber - 1];
    if (!page) continue;
    const rawVal = opts.formValues[field.id];
    if (rawVal === undefined || rawVal === '') continue;
    const raw = sanitizeText(rawVal);
    if (!raw) continue;

    const { width: pw, height: ph } = page.getSize();
    const boxLeft = (field.x / 100) * pw;
    const boxWidth = (field.width / 100) * pw;
    const boxTopFromTop = (field.y / 100) * ph;
    const boxHeight = (field.height / 100) * ph;

    const hasHebrew = HEBREW_RE.test(raw);
    const font = hasHebrew ? hebrewFont : latinFont;

    let fontSize = Math.max(7, Math.min(10, boxHeight * 0.75));
    const maxTextWidth = boxWidth - 2;
    while (fontSize > 5 && font.widthOfTextAtSize(raw, fontSize) > maxTextWidth) {
      fontSize -= 0.5;
    }
    const textWidth = Math.min(font.widthOfTextAtSize(raw, fontSize), maxTextWidth);
    // Right-align Hebrew; left-align Latin (dates, IDs, amounts).
    const x = hasHebrew
      ? boxLeft + boxWidth - textWidth - 1
      : boxLeft + 1;
    const y = ph - boxTopFromTop - fontSize * 0.85;

    page.drawText(raw, {
      x,
      y,
      size: fontSize,
      font,
      color: rgb(0, 0, 0),
    });
  }

  if (opts.contractTypeSelection && contractTypeField) {
    const ctPage = pages[contractTypeField.pageNumber - 1];
    if (ctPage) {
      const { width: pw, height: ph } = ctPage.getSize();
      const offset = CONTRACT_TYPE_OFFSETS[sanitizeText(opts.contractTypeSelection)] ?? 0;
      const boxLeft = ((contractTypeField.x + offset) / 100) * pw;
      const boxWidth = (contractTypeField.width / 100) * pw;
      const boxTopFromTop = (contractTypeField.y / 100) * ph;
      const boxHeight = (contractTypeField.height / 100) * ph;
      const centerX = boxLeft + boxWidth / 2;
      const centerY = ph - boxTopFromTop - boxHeight / 2;
      ctPage.drawEllipse({
        x: centerX,
        y: centerY,
        xScale: boxWidth * 1.4,
        yScale: boxHeight * 1.3,
        borderColor: rgb(0.85, 0.1, 0.1),
        borderWidth: 1.4,
      });
    }
  }

  const sigPage = pages[1];
  if (sigPage) {
    const { width: pw, height: ph } = sigPage.getSize();

    for (let rowIndex = 0; rowIndex < MUNICIPAL_APPROVAL_SIGNATURE_ROWS.length; rowIndex += 1) {
      const row = MUNICIPAL_APPROVAL_SIGNATURE_ROWS[rowIndex]!;
      const boxLeft = (row.x / 100) * pw;
      const boxWidth = (row.width / 100) * pw;
      const boxHeight = (row.height / 100) * ph;
      const boxTopFromTop = (row.y / 100) * ph;
      const boxBottom = ph - boxTopFromTop - boxHeight;
      const nameLeft = (APPROVAL_NAME_BOX.x / 100) * pw;
      const nameWidthPx = (APPROVAL_NAME_BOX.width / 100) * pw;
      const dateLeft = (APPROVAL_DATE_BOX.x / 100) * pw;
      const dateWidthPx = (APPROVAL_DATE_BOX.width / 100) * pw;

      const signed = opts.signedRows.find((r) => r.rowIndex === rowIndex);
      if (!signed) continue;

      let drewSignatureImage = false;
      if (signed.imageBytes) {
        try {
          const img = await pdfDoc.embedPng(signed.imageBytes);
          // Skip stub images (< 10×10) — they're placeholder placeholders, not real sigs.
          if (img.width > 10 && img.height > 10) {
            const imgMaxWidth = boxWidth * 0.95;
            const imgMaxHeight = boxHeight * 0.82;
            const ratio = Math.min(
              imgMaxWidth / img.width,
              imgMaxHeight / img.height,
            );
            sigPage.drawImage(img, {
              x: boxLeft + (boxWidth - img.width * ratio) / 2,
              y: boxBottom + (boxHeight - img.height * ratio) / 2,
              width: img.width * ratio,
              height: img.height * ratio,
            });
            drewSignatureImage = true;
          }
        } catch {
          // not embeddable — text-only stamp
        }
      }

      const displayName = sanitizeText(signed.name ?? signed.email);
      let nameSize = Math.min(8.5, boxHeight * 0.42);
      while (
        nameSize > 5.5 &&
        hebrewFont.widthOfTextAtSize(displayName, nameSize) > nameWidthPx - 2
      ) {
        nameSize -= 0.5;
      }
      const dateSize = Math.min(8.5, boxHeight * 0.45);
      const nameWidth = Math.min(
        hebrewFont.widthOfTextAtSize(displayName, nameSize),
        nameWidthPx - 2,
      );
      sigPage.drawText(displayName, {
        x: nameLeft + nameWidthPx - nameWidth - 1,
        y: boxBottom + boxHeight * 0.72,
        size: nameSize,
        font: hebrewFont,
        color: rgb(0.1, 0.1, 0.1),
      });

      if (!drewSignatureImage) {
        const signatureText = 'חתימה';
        const signatureSize = Math.min(8, boxHeight * 0.42);
        const signatureWidth = hebrewFont.widthOfTextAtSize(
          signatureText,
          signatureSize,
        );
        sigPage.drawText(signatureText, {
          x: boxLeft + (boxWidth - signatureWidth) / 2,
          y: boxBottom + boxHeight * 0.7,
          size: signatureSize,
          font: hebrewFont,
          color: rgb(0.1, 0.25, 0.75),
        });
        sigPage.drawLine({
          start: { x: boxLeft + boxWidth * 0.18, y: boxBottom + boxHeight * 0.35 },
          end: { x: boxLeft + boxWidth * 0.82, y: boxBottom + boxHeight * 0.55 },
          thickness: 0.8,
          color: rgb(0.1, 0.25, 0.75),
        });
      }

      const dateStr = formatRowDate(signed.signedAt);
      if (dateStr) {
        const dateWidth = Math.min(
          latinBoldFont.widthOfTextAtSize(dateStr, dateSize),
          dateWidthPx - 2,
        );
        const dateX = dateLeft + (dateWidthPx - dateWidth) / 2;
        const dateY = boxBottom + boxHeight * 0.66;
        sigPage.drawRectangle({
          x: dateX - 1,
          y: dateY - 1,
          width: dateWidth + 2,
          height: dateSize + 2,
          color: rgb(1, 1, 1),
          opacity: 0.9,
        });
        sigPage.drawText(dateStr, {
          x: dateX,
          y: dateY,
          size: dateSize,
          font: latinBoldFont,
          color: rgb(0, 0, 0),
        });
      }
    }
  }

  const out = await pdfDoc.save();
  return Buffer.from(out);
}
