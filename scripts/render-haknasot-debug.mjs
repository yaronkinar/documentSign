/**
 * Renders each page of scripts/.out/haknasot-filled-sample.pdf to its own
 * high-resolution PNG (scripts/.out/page-N.png) for readable visual inspection.
 *
 * Usage: node scripts/render-haknasot-debug.mjs [scale]
 */
import { chromium } from '@playwright/test';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const PDF = path.resolve(process.argv[2] ?? 'scripts/.out/haknasot-filled-sample.pdf');
const SCALE = Number(process.argv[3] ?? 2.6);

const server = http.createServer((req, res) => {
  if (req.url === '/smoke.pdf') {
    const data = fs.readFileSync(PDF);
    res.writeHead(200, {
      'Content-Type': 'application/pdf',
      'Access-Control-Allow-Origin': '*',
    });
    return res.end(data);
  }
  res.writeHead(200, { 'Content-Type': 'text/html' });
  res.end(`<!DOCTYPE html><html><head>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js"></script>
    <style>body{margin:0;background:#fff}canvas{display:block}</style>
  </head><body><div id="pages"></div>
  <script>
    pdfjsLib.GlobalWorkerOptions.workerSrc =
      'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    pdfjsLib.getDocument('/smoke.pdf').promise.then(async (pdf) => {
      window.__pages = pdf.numPages;
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const vp = page.getViewport({ scale: ${SCALE} });
        const canvas = document.createElement('canvas');
        canvas.id = 'page-' + i;
        canvas.width = vp.width; canvas.height = vp.height;
        document.getElementById('pages').appendChild(canvas);
        await page.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;
      }
      document.title = 'DONE';
    });
  </script></body></html>`);
});

await new Promise((r) => server.listen(9877, r));
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
await page.goto('http://localhost:9877/', { waitUntil: 'load', timeout: 30000 });
await page.waitForFunction(() => document.title === 'DONE', { timeout: 30000 });
const count = await page.evaluate(() => window.__pages);
for (let i = 1; i <= count; i++) {
  const el = await page.$(`#page-${i}`);
  await el.screenshot({ path: `scripts/.out/page-${i}.png` });
  console.log(`Saved scripts/.out/page-${i}.png`);
}
await browser.close();
server.close();
