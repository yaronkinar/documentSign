/**
 * Shared haknasot PDF builder used by the CLI script and the web app.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

export const HAKNASOT_PAGE_SIZE = { width: 595.32, height: 842.04 };

// Measured directly from haknasot.pdf (items 13–23 on page 2). The previous
// y-values drifted up to 6% off the actual rows.
// Signature (חתימה) column boxes for the approval table on pages 3-4 of the
// new haknasot form (mirrors packages/shared/src/approval-template.ts).
export const MUNICIPAL_APPROVAL_SIGNATURE_ROWS = [
  { pageNumber: 3, x: 21.1, y: 15.5, width: 15.6, height: 4.5 }, // 1. אישור מנהל האגף
  { pageNumber: 3, x: 21.1, y: 33.0, width: 15.6, height: 5.0 }, // 2. אישור ראש המנהל
  { pageNumber: 3, x: 21.1, y: 49.4, width: 15.6, height: 5.0 }, // 3. אישור יועץ משפטי
  { pageNumber: 3, x: 21.1, y: 57.0, width: 15.6, height: 5.0 }, // 4. אישור מנהל אגף נכסים
  { pageNumber: 3, x: 21.1, y: 64.7, width: 15.6, height: 5.0 }, // 5. אישור חשב האגף
  { pageNumber: 3, x: 21.1, y: 72.4, width: 15.6, height: 5.0 }, // 6. אישור מהנדס העירייה
  { pageNumber: 3, x: 21.1, y: 80.0, width: 15.6, height: 5.0 }, // 7. אישור מ.אגף מכרזים
  { pageNumber: 4, x: 21.1, y: 7.0, width: 15.6, height: 5.0 }, // 8. אישור מנהל אגף תכנון ופיתוח כלכלי
  { pageNumber: 4, x: 21.1, y: 21.4, width: 15.6, height: 5.0 }, // 9. אישור מ.אגף גזברות
  { pageNumber: 4, x: 21.1, y: 29.0, width: 15.6, height: 5.0 }, // 10. אישור גזבר העירייה
  { pageNumber: 4, x: 21.1, y: 36.7, width: 15.6, height: 5.0 }, // 11. אישור מנכ"ל העירייה
];

const HEBREW_RE = /[\u0590-\u05FF\uFB1D-\uFB4F]/;

export function loadHaknasotLines() {
  const linesPath = path.join(
    root,
    'packages',
    'shared',
    'src',
    'haknasot-pdf-lines.json',
  );
  return JSON.parse(readFileSync(linesPath, 'utf8'));
}

function shapeRtl(text) {
  return text
    .split(/(\s+)/)
    .reverse()
    .map((token) => {
      if (!token.trim()) return token;
      if (HEBREW_RE.test(token)) {
        return [...token].reverse().join('');
      }
      return token;
    })
    .join('');
}

function drawLine(page, font, line, rgb) {
  const fontSize = line.size ?? 10;
  const shaped = shapeRtl(line.text);
  const { width, height } = page.getSize();
  const marginX = width * 0.07;
  const textWidth = font.widthOfTextAtSize(shaped, fontSize);
  const align = line.align ?? 'right';

  let x;
  if (align === 'center') {
    x = (width - textWidth) / 2;
  } else if (align === 'left') {
    x = marginX;
  } else {
    x = width - marginX - textWidth;
  }

  const y = height - (height * line.y) / 100 - fontSize * 0.85;

  page.drawText(shaped, {
    x,
    y,
    size: fontSize,
    font,
    color: rgb(0, 0, 0),
  });
}

function drawSignatureZones(page, rgb) {
  const { width, height } = page.getSize();

  for (const row of MUNICIPAL_APPROVAL_SIGNATURE_ROWS) {
    const boxTop = height * (1 - row.y / 100);
    const boxHeight = height * (row.height / 100);
    const boxLeft = width * (row.x / 100);
    const boxWidth = width * (row.width / 100);

    page.drawRectangle({
      x: boxLeft,
      y: boxTop - boxHeight,
      width: boxWidth,
      height: boxHeight,
      borderColor: rgb(0.75, 0.75, 0.75),
      borderWidth: 0.5,
      borderOpacity: 0.35,
    });
  }
}

export async function buildHaknasotPdfBytes(fontBytes, lines = loadHaknasotLines()) {
  const { PDFDocument, rgb } = await import('pdf-lib');
  const fontkit = (await import('@pdf-lib/fontkit')).default;

  const pdfDoc = await PDFDocument.create();
  pdfDoc.registerFontkit(fontkit);
  const font = await pdfDoc.embedFont(fontBytes);

  const pages = [
    pdfDoc.addPage([HAKNASOT_PAGE_SIZE.width, HAKNASOT_PAGE_SIZE.height]),
    pdfDoc.addPage([HAKNASOT_PAGE_SIZE.width, HAKNASOT_PAGE_SIZE.height]),
  ];

  for (const line of lines) {
    const page = pages[line.page - 1];
    if (!page) continue;
    drawLine(page, font, line, rgb);
  }

  drawSignatureZones(pages[1], rgb);

  return pdfDoc.save();
}

/** @deprecated */
export const MUNICIPAL_APPROVAL_FIELD_LAYOUT = {
  pageNumber: 2,
  x: 29,
  width: 10,
  height: 3.5,
  startY: 29,
  rowGap: 3.5,
};

/** @deprecated */
export const MUNICIPAL_APPROVAL_SIGNER_TITLES = [
  'אישור מנהל האגף',
  'אישור ראש המנהל',
  'אישור יועץ משפטי',
  'אישור מנהל אגף נכסים',
  'אישור חשב האגף',
  'אישור מהנדס העירייה',
  'אישור מ. אגף מכרזים',
  'אישור מנהל אגף תכנון ופיתוח כלכלי',
  'אישור מ.אגף גזברות',
  'אישור גזבר העירייה',
  'אישור מנכ"ל העירייה',
];

export function loadHaknasotLayout() {
  return loadHaknasotLines();
}
