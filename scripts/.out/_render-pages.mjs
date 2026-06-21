import fs from 'node:fs';
import * as napi from '@napi-rs/canvas';

// pdfjs (node) renders glyphs via Path2D/DOMMatrix taken from the global scope.
// Wire @napi-rs/canvas's implementations in BEFORE importing pdfjs.
globalThis.Path2D = napi.Path2D;
globalThis.DOMMatrix = napi.DOMMatrix;
globalThis.ImageData = napi.ImageData;

const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');

const file = process.argv[2];
const pagesArg = (process.argv[3] ?? '3,4').split(',').map((n) => parseInt(n, 10));
const scale = parseFloat(process.argv[4] ?? '2.0');

const data = new Uint8Array(fs.readFileSync(file));
const doc = await pdfjs.getDocument({ data }).promise;

for (const pageNum of pagesArg) {
  const page = await doc.getPage(pageNum);
  const viewport = page.getViewport({ scale });
  const canvas = napi.createCanvas(viewport.width, viewport.height);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = 'white';
  ctx.fillRect(0, 0, viewport.width, viewport.height);
  await page.render({ canvasContext: ctx, viewport, canvas }).promise;
  const out = `scripts/.out/_page${pageNum}.png`;
  fs.writeFileSync(out, canvas.toBuffer('image/png'));
  console.log('wrote', out);
}
