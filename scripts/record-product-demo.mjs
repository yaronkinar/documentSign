/**
 * Records an updated product demo video for /demo and onboarding.
 *
 * Prerequisites: web (and ideally API) dev servers running, e.g. `npm run dev`.
 *
 * Usage:
 *   node scripts/record-product-demo.mjs
 *   PLAYWRIGHT_BASE_URL=http://localhost:3000 node scripts/record-product-demo.mjs
 */
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from '@playwright/test';

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000';
const ROOT = path.resolve(import.meta.dirname, '..');
const VIDEOS_DIR = path.join(ROOT, 'apps', 'web', 'public', 'videos');
const RECORDING_DIR = path.join(VIDEOS_DIR, '.recording');
const WEBM_OUT = path.join(RECORDING_DIR, 'product-demo.webm');
const MP4_OUT = path.join(VIDEOS_DIR, 'product-demo.mp4');
const WEBM_PUBLIC = path.join(VIDEOS_DIR, 'product-demo.webm');
const POSTER_OUT = path.join(VIDEOS_DIR, 'product-demo-poster.jpg');

const VIEWPORT = { width: 1280, height: 720 };

async function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function ensureServer() {
  try {
    const res = await fetch(BASE_URL, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
  } catch (err) {
    console.error(`Cannot reach ${BASE_URL}. Start the app with: npm run dev`);
    throw err;
  }
}

async function pause(page, ms = 1800) {
  await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
  await wait(ms);
}

async function clickNext(page) {
  const next = page.getByRole('button', { name: /^Next$|^הבא$/ });
  await next.click({ timeout: 8000 });
  await wait(900);
}

async function runTour(page) {
  console.log('→ Onboarding tour');
  await page.goto(`${BASE_URL}/onboarding?replay=1`, { waitUntil: 'domcontentloaded' });
  await pause(page, 2200);

  // Step 1 — Welcome
  await clickNext(page);
  // Step 2 — Demo video (pause on the embedded player)
  await pause(page, 3500);
  await clickNext(page);
  // Step 3 — Prepare
  await pause(page, 2000);
  await clickNext(page);
  // Step 4 — Signers
  await pause(page, 2000);
  await clickNext(page);
  // Step 5 — Track
  await pause(page, 2200);
  await page.getByRole('button', { name: /^Done$|^סיום$/ }).click();
  await wait(1200);
}

async function runDashboard(page) {
  console.log('→ Dashboard');
  await page.goto(`${BASE_URL}/dashboard`, { waitUntil: 'domcontentloaded' });
  await pause(page, 2800);
  await page.mouse.wheel(0, 420);
  await wait(1200);
}

async function runNewDocument(page) {
  console.log('→ New document');
  await page.goto(`${BASE_URL}/documents/new`, { waitUntil: 'domcontentloaded' });
  await pause(page, 3200);
}

async function runSettings(page) {
  console.log('→ Settings');
  await page.goto(`${BASE_URL}/settings`, { waitUntil: 'domcontentloaded' });
  await pause(page, 2400);
}

async function runDemoPage(page) {
  console.log('→ Demo page');
  await page.goto(`${BASE_URL}/demo`, { waitUntil: 'domcontentloaded' });
  await pause(page, 2800);
}

function encodeOutputs() {
  console.log('→ Encoding MP4 + poster');
  fs.mkdirSync(RECORDING_DIR, { recursive: true });
  fs.mkdirSync(VIDEOS_DIR, { recursive: true });

  execSync(
    `ffmpeg -y -i "${WEBM_OUT}" -c:v libx264 -pix_fmt yuv420p -c:a aac -movflags +faststart "${MP4_OUT}"`,
    { stdio: 'inherit' },
  );
  fs.copyFileSync(WEBM_OUT, WEBM_PUBLIC);
  execSync(
    `ffmpeg -y -i "${MP4_OUT}" -ss 00:00:02 -frames:v 1 -update 1 "${POSTER_OUT}"`,
    { stdio: 'inherit' },
  );
}

async function main() {
  await ensureServer();
  fs.mkdirSync(RECORDING_DIR, { recursive: true });

  const browser = await chromium.launch({
    headless: true,
    args: ['--disable-dev-shm-usage'],
  });

  const context = await browser.newContext({
    viewport: VIEWPORT,
    recordVideo: {
      dir: RECORDING_DIR,
      size: VIEWPORT,
    },
    locale: 'en-US',
  });

  await context.addInitScript(() => {
    localStorage.setItem('docflow-locale', 'en');
    document.cookie = 'docflow-locale=en;path=/;max-age=31536000;samesite=lax';
  });

  const page = await context.newPage();

  try {
    await runTour(page);
    await runDashboard(page);
    await runNewDocument(page);
    await runSettings(page);
    await runDemoPage(page);
  } catch (err) {
    console.error('Recording failed:', err);
    throw err;
  } finally {
    const video = page.video();
    await context.close();
    if (video) {
      await video.saveAs(WEBM_OUT);
      console.log(`Saved raw recording → ${WEBM_OUT}`);
    }
    await browser.close();
  }

  encodeOutputs();
  const stats = fs.statSync(MP4_OUT);
  console.log(`Done. product-demo.mp4 (${Math.round(stats.size / 1024)} KB)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
