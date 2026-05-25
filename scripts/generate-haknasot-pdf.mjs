/**
 * Installs the haknasot municipal form PDF for DocFlow.
 * Run: npm run generate:haknasot-pdf
 *
 * Prefer the canonical Word-export PDF when present; otherwise falls back to
 * programmatic generation (legacy).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import https from 'node:https';

import { buildHaknasotPdfBytes } from './haknasot-pdf-core.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const fontPath = path.join(root, 'apps', 'web', 'public', 'fonts', 'NotoSansHebrew-Regular.ttf');
const publicDir = path.join(root, 'apps', 'web', 'public', 'samples');
const outFile = 'haknasot.pdf';
const sourceCandidates = [
  path.join(root, 'apps', 'web', 'public', 'samples', 'haknasot-source.pdf'),
  path.join(process.env.USERPROFILE ?? '', 'Downloads', 'haknasot (3).pdf'),
];

const FONT_URL =
  'https://github.com/googlefonts/noto-fonts/raw/main/hinted/ttf/NotoSansHebrew/NotoSansHebrew-Regular.ttf';

function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    const file = fs.createWriteStream(dest);
    https
      .get(url, (res) => {
        if (
          res.statusCode &&
          res.statusCode >= 300 &&
          res.statusCode < 400 &&
          res.headers.location
        ) {
          res.resume();
          downloadFile(res.headers.location, dest).then(resolve).catch(reject);
          return;
        }
        if (res.statusCode !== 200) {
          reject(new Error(`Download failed (${res.statusCode})`));
          return;
        }
        res.pipe(file);
        file.on('finish', () => file.close(resolve));
      })
      .on('error', reject);
  });
}

async function ensureFont() {
  if (fs.existsSync(fontPath)) return;
  console.log('Downloading Noto Sans Hebrew font...');
  await downloadFile(FONT_URL, fontPath);
}

function resolveSourcePdf() {
  for (const candidate of sourceCandidates) {
    if (!candidate || !fs.existsSync(candidate)) continue;

    const stat = fs.statSync(candidate);
    if (stat.size === 0) {
      console.warn(`Ignoring empty haknasot source PDF: ${candidate}`);
      continue;
    }

    const header = fs.readFileSync(candidate, { encoding: 'utf8', flag: 'r' }).slice(0, 4);
    if (header !== '%PDF') {
      console.warn(`Ignoring invalid haknasot source PDF: ${candidate}`);
      continue;
    }

    return candidate;
  }
  return null;
}

async function main() {
  fs.mkdirSync(publicDir, { recursive: true });
  const publicPath = path.join(publicDir, outFile);
  const sourcePdf = resolveSourcePdf();

  if (sourcePdf) {
    fs.copyFileSync(sourcePdf, publicPath);
    console.log(`Copied ${sourcePdf} -> ${publicPath}`);
    return;
  }

  console.warn('Canonical haknasot PDF not found; generating programmatic fallback.');
  await ensureFont();
  const fontBytes = fs.readFileSync(fontPath);
  const bytes = await buildHaknasotPdfBytes(fontBytes);
  fs.writeFileSync(publicPath, bytes);
  console.log(`Created ${publicPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
