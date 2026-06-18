/**
 * One-off fix: the canonical haknasot-source.pdf ships with two checkboxes
 * pre-checked (ct_expand "הרחבה" and rel_income "הכנסה: משכירות...") baked
 * into the source export. Mask them back to empty boxes so the unfilled
 * template preview (served raw via /api/template-pdf/haknasot) doesn't show
 * stray checks before any form values are selected.
 *
 * Run: node scripts/strip-haknasot-template-checks.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PDFDocument, rgb } from 'pdf-lib';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const publicDir = path.join(root, 'apps', 'web', 'public', 'samples');
const targets = ['haknasot-source.pdf', 'haknasot.pdf'].map((f) =>
  path.join(publicDir, f),
);

// page1 fields baked-in checked in the source export (see packages/shared/src/haknasot-form.ts)
const FIELDS = [
  { id: 'ct_expand', x: 9.6, y: 17, width: 2.4, height: 2.4 },
  { id: 'rel_income', x: 88.3, y: 27.7, width: 2.4, height: 2.2 },
];

async function stripChecks(filePath) {
  const bytes = fs.readFileSync(filePath);
  const pdfDoc = await PDFDocument.load(bytes);
  const page = pdfDoc.getPages()[0];
  const { width: pw, height: ph } = page.getSize();

  for (const field of FIELDS) {
    const boxLeft = (field.x / 100) * pw;
    const boxWidth = (field.width / 100) * pw;
    const boxTopFromTop = (field.y / 100) * ph;
    const boxHeight = (field.height / 100) * ph;
    const bottom = ph - boxTopFromTop - boxHeight;

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
  }

  const out = await pdfDoc.save();
  fs.writeFileSync(filePath, out);
  console.log(`Stripped pre-checked boxes: ${filePath}`);
}

for (const target of targets) {
  if (!fs.existsSync(target)) {
    console.warn(`Skipping missing file: ${target}`);
    continue;
  }
  await stripChecks(target);
}
