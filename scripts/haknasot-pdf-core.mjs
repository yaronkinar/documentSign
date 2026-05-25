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
export const MUNICIPAL_APPROVAL_SIGNATURE_ROWS = [
  { pageNumber: 2, x: 29, y: 30.31, width: 10, height: 3.5 }, // 13. אישור מנהל האגף
  { pageNumber: 2, x: 29, y: 34.76, width: 10, height: 3.5 }, // 14. אישור ראש המנהל
  { pageNumber: 2, x: 29, y: 38.96, width: 10, height: 3.5 }, // 15. אישור יועץ משפטי
  { pageNumber: 2, x: 29, y: 43.17, width: 10, height: 3.5 }, // 16. אישור מנהל אגף נכסים
  { pageNumber: 2, x: 29, y: 47.37, width: 10, height: 3.5 }, // 17. אישור חשב האגף
  { pageNumber: 2, x: 29, y: 51.59, width: 10, height: 3.5 }, // 18. אישור מהנדס העירייה
  { pageNumber: 2, x: 29, y: 56.02, width: 10, height: 3.5 }, // 19. אישור מ.אגף מכרזים
  { pageNumber: 2, x: 29, y: 60.24, width: 10, height: 3.5 }, // 20. אישור מנהל אגף תכנון ופיתוח כלכלי
  { pageNumber: 2, x: 29, y: 64.44, width: 10, height: 3.5 }, // 21. אישור מ.אגף גזברות
  { pageNumber: 2, x: 29, y: 68.65, width: 10, height: 3.5 }, // 22. אישור גזבר העירייה
  { pageNumber: 2, x: 29, y: 73.10, width: 10, height: 3.5 }, // 23. אישור מנכ"ל העירייה
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
