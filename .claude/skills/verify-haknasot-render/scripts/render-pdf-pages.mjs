/**
 * Rasterize specific pages of a PDF to PNGs — used to *see* what the Haknasot
 * renderer produced, because this machine has no pdftoppm / ghostscript /
 * ImageMagick (the `convert` on PATH is the Windows builtin, not ImageMagick).
 *
 * Uses pdfjs-dist (already a dependency) + @napi-rs/canvas. pdfjs draws glyphs
 * through Path2D/DOMMatrix taken from the *global* scope, and @napi-rs/canvas's
 * implementations must be wired in BEFORE pdfjs loads or rendering throws
 * "Value is none of these types String, Path".
 *
 * Setup (once per environment, does not touch package.json):
 *   npm i --no-save @napi-rs/canvas
 *
 * Usage:
 *   node .claude/skills/verify-haknasot-render/scripts/render-pdf-pages.mjs <pdf> [pages] [scale] [outDir]
 *   node .../render-pdf-pages.mjs out.pdf 3,4 2.0 scripts/.out
 *
 * Note: numeric/date fields stamped in the standard Helvetica font do NOT
 * rasterize here (pdfjs lacks the glyph outlines and logs "getPathGenerator
 * ignoring character"); they show as blank/white boxes but ARE present in the
 * real PDF. Hebrew (embedded Noto) renders fine. Judge text placement by the
 * Hebrew names; trust a real viewer for the Latin dates.
 */
import fs from 'node:fs';
import path from 'node:path';

let napi;
try {
  napi = await import('@napi-rs/canvas');
} catch {
  console.error(
    'Missing @napi-rs/canvas. Install it (does not modify package.json):\n' +
      '  npm i --no-save @napi-rs/canvas',
  );
  process.exit(2);
}

// Wire canvas's Path2D/DOMMatrix/ImageData into global scope before pdfjs loads.
globalThis.Path2D = napi.Path2D;
globalThis.DOMMatrix = napi.DOMMatrix;
globalThis.ImageData = napi.ImageData;

const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');

const file = process.argv[2];
if (!file) {
  console.error('Usage: render-pdf-pages.mjs <pdf> [pages=3,4] [scale=2.0] [outDir=scripts/.out]');
  process.exit(1);
}
const pages = (process.argv[3] ?? '3,4').split(',').map((n) => parseInt(n, 10));
const scale = parseFloat(process.argv[4] ?? '2.0');
const outDir = process.argv[5] ?? 'scripts/.out';
fs.mkdirSync(outDir, { recursive: true });

const data = new Uint8Array(fs.readFileSync(file));
const doc = await pdfjs.getDocument({ data }).promise;
console.log(`${file}: ${doc.numPages} pages`);

for (const pageNum of pages) {
  const page = await doc.getPage(pageNum);
  const viewport = page.getViewport({ scale });
  const canvas = napi.createCanvas(viewport.width, viewport.height);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = 'white';
  ctx.fillRect(0, 0, viewport.width, viewport.height);
  await page.render({ canvasContext: ctx, viewport, canvas }).promise;
  const out = path.join(outDir, `_page${pageNum}.png`);
  fs.writeFileSync(out, canvas.toBuffer('image/png'));
  console.log('wrote', out);
}
