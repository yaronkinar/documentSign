/**
 * Renders the same Hebrew sample strings three ways onto a blank PDF so we can
 * tell visually which shaping strategy is correct in the current pdf-lib +
 * Noto Sans Hebrew + Adobe/Chrome viewer combination.
 *
 *  Row A: raw (no transformation) — pdf-lib draws the Unicode codepoints as-is.
 *  Row B: shapeRtl (reverse word order, reverse chars within Hebrew tokens)
 *         — the strategy currently used by haknasot-pdf-draw.ts.
 *  Row C: char-reverse only (reverse chars in each Hebrew token but keep word
 *         order) — alternative shaping for single-line bidi.
 *
 * Run: node scripts/test-hebrew-shaping.mjs
 *
 * Output: scripts/.out/hebrew-shaping-compare.pdf
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const FONT_PATH = path.join(root, 'apps', 'web', 'public', 'fonts', 'NotoSansHebrew-Regular.ttf');
const OUT_DIR = path.join(__dirname, '.out');
const OUT_PATH = path.join(OUT_DIR, 'hebrew-shaping-compare.pdf');

const HEBREW_RE = /[֐-׿יִ-ﭏ]/;

function shapeRtlBoth(text) {
  return text
    .split(/(\s+)/)
    .reverse()
    .map((t) => (HEBREW_RE.test(t) ? [...t].reverse().join('') : t))
    .join('');
}

function shapeCharsOnly(text) {
  return text
    .split(/(\s+)/)
    .map((t) => (HEBREW_RE.test(t) ? [...t].reverse().join('') : t))
    .join('');
}

const SAMPLES = [
  'חדש',
  'אגף תכנון',
  'חברת בדיקה',
  'מתן שירותי תחזוקה',
];

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const { PDFDocument, rgb } = await import('pdf-lib');
  const fontkit = (await import('@pdf-lib/fontkit')).default;

  const pdfDoc = await PDFDocument.create();
  pdfDoc.registerFontkit(fontkit);
  const font = await pdfDoc.embedFont(fs.readFileSync(FONT_PATH));
  const page = pdfDoc.addPage([595, 842]);

  const rowHeight = 90;
  let y = 760;

  page.drawText('Hebrew shaping comparison', { x: 40, y, size: 14, font, color: rgb(0, 0, 0) });
  y -= 40;

  for (const sample of SAMPLES) {
    page.drawText(`logical: ${[...sample].map((c) => 'U+' + c.charCodeAt(0).toString(16)).join(' ')}`, {
      x: 40, y, size: 7, font, color: rgb(0.4, 0.4, 0.4),
    });
    y -= 14;

    page.drawText('A raw            :', { x: 40, y, size: 11, font, color: rgb(0.4, 0.4, 0.4) });
    page.drawText(sample, { x: 200, y, size: 14, font, color: rgb(0, 0, 0) });
    y -= 20;

    page.drawText('B shapeRtl       :', { x: 40, y, size: 11, font, color: rgb(0.4, 0.4, 0.4) });
    page.drawText(shapeRtlBoth(sample), { x: 200, y, size: 14, font, color: rgb(0, 0, 0) });
    y -= 20;

    page.drawText('C chars-only rev :', { x: 40, y, size: 11, font, color: rgb(0.4, 0.4, 0.4) });
    page.drawText(shapeCharsOnly(sample), { x: 200, y, size: 14, font, color: rgb(0, 0, 0) });
    y -= rowHeight - 54;
  }

  fs.writeFileSync(OUT_PATH, await pdfDoc.save());
  console.log('Wrote', OUT_PATH);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
