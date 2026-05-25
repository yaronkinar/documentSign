/**
 * Compares API-rendered PDF vs smoketest PDF by serving them through a local
 * HTTP server and rendering via PDF.js in Playwright.
 *
 * Usage: node scripts/pw-compare-pdf.mjs <docId>
 */
import { chromium } from '@playwright/test';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const docId = process.argv[2];
const API = 'http://localhost:3001';
const TOKEN = 'dev-bypass-token-local';
const SMOKE = path.resolve('scripts/.out/haknasot-filled-sample.pdf');

fs.mkdirSync('scripts/.out', { recursive: true });

// Download API-rendered PDF
let apiPdfPath = null;
if (docId) {
  const res = await fetch(`${API}/documents/${docId}/rendered.pdf`, {
    headers: { Authorization: `Bearer ${TOKEN}` },
  });
  if (!res.ok) {
    console.error(`API returned ${res.status}`);
  } else {
    const buf = Buffer.from(await res.arrayBuffer());
    apiPdfPath = path.resolve('scripts/.out/api-rendered-compare.pdf');
    fs.writeFileSync(apiPdfPath, buf);
    console.log(`API PDF downloaded: ${buf.length} bytes`);
  }
}

// Minimal HTTP server that serves PDFs and a PDF.js viewer page
const server = http.createServer((req, res) => {
  if (req.url === '/api.pdf' && apiPdfPath) {
    const data = fs.readFileSync(apiPdfPath);
    res.writeHead(200, { 'Content-Type': 'application/pdf', 'Access-Control-Allow-Origin': '*' });
    return res.end(data);
  }
  if (req.url === '/smoke.pdf' && fs.existsSync(SMOKE)) {
    const data = fs.readFileSync(SMOKE);
    res.writeHead(200, { 'Content-Type': 'application/pdf', 'Access-Control-Allow-Origin': '*' });
    return res.end(data);
  }
  // PDF.js viewer page
  const pdfUrl = req.url === '/view-api' ? '/api.pdf' : '/smoke.pdf';
  const label = req.url === '/view-api' ? `API render: ${docId}` : 'Smoketest reference';
  res.writeHead(200, { 'Content-Type': 'text/html' });
  res.end(`<!DOCTYPE html><html><head>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js"></script>
    <style>body{margin:0;background:#555}canvas{display:block;margin:8px auto}
    h3{color:white;font-family:sans-serif;margin:4px 8px}</style>
  </head><body>
    <h3>${label}</h3>
    <div id="pages"></div>
    <script>
      pdfjsLib.GlobalWorkerOptions.workerSrc =
        'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
      pdfjsLib.getDocument('${pdfUrl}').promise.then(async (pdf) => {
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const vp = page.getViewport({ scale: 1.2 });
          const canvas = document.createElement('canvas');
          canvas.width = vp.width; canvas.height = vp.height;
          document.getElementById('pages').appendChild(canvas);
          await page.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;
        }
        document.title = 'DONE';
      });
    </script>
  </body></html>`);
});

await new Promise((r) => server.listen(9876, r));
console.log('PDF server on :9876');

const browser = await chromium.launch({ headless: true });

async function screenshotViewer(viewPath, outFile) {
  const context = await browser.newContext({ viewport: { width: 900, height: 1200 } });
  const page = await context.newPage();
  await page.goto(`http://localhost:9876${viewPath}`, { waitUntil: 'load', timeout: 20000 });
  // Wait for PDF.js to finish rendering (title changes to DONE)
  await page.waitForFunction(() => document.title === 'DONE', { timeout: 20000 });
  await page.waitForTimeout(500);
  await page.screenshot({ path: outFile, fullPage: true });
  console.log(`Saved ${outFile}`);
  await context.close();
}

if (apiPdfPath) await screenshotViewer('/view-api', 'scripts/.out/compare-api.png');
if (fs.existsSync(SMOKE)) await screenshotViewer('/view-smoke', 'scripts/.out/compare-smoke.png');

await browser.close();
server.close();
console.log('Done.');
