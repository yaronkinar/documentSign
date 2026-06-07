/**
 * Records a Hebrew product demo: haknasot form + municipal approval signers.
 *
 * Prerequisites:
 *   - Web + API dev servers (`npm run dev`)
 *   - BYPASS_AUTH=true in apps/web and apps/api env (see .env.local.example)
 *
 * Usage:
 *   npm run record:demo
 *   PLAYWRIGHT_BASE_URL=http://localhost:3000 node scripts/record-product-demo.mjs
 */
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from '@playwright/test';

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000';
const API_URL = process.env.API_URL ?? 'http://127.0.0.1:3001';
const BYPASS_TOKEN = process.env.BYPASS_TOKEN ?? 'dev-bypass-token-local';
const ROOT = path.resolve(import.meta.dirname, '..');
const VIDEOS_DIR = path.join(ROOT, 'apps', 'web', 'public', 'videos');
const RECORDING_DIR = path.join(VIDEOS_DIR, '.recording');
const WEBM_OUT = path.join(RECORDING_DIR, 'product-demo.webm');
const MP4_OUT = path.join(VIDEOS_DIR, 'product-demo.mp4');
const WEBM_PUBLIC = path.join(VIDEOS_DIR, 'product-demo.webm');
const POSTER_OUT = path.join(VIDEOS_DIR, 'product-demo-poster.jpg');

const VIEWPORT = { width: 1280, height: 720 };
const LOCALE = 'he';

const HE = {
  startForm: 'התחל טופס',
  fillAuto: 'מלא אוטומטית',
  next: 'הבא',
  title: 'כותרת',
  saveAndAssign: 'שמור ושייך שדות',
  sendToSigners: 'שלח לחותמים',
  newDocument: 'מסמך חדש',
  email: 'אימייל',
  demoTitle: 'חוזה הכנסות – הדגמה',
};

async function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function ensureServers() {
  for (const [label, url] of [
    ['Web', BASE_URL],
    ['API', `${API_URL}/health`],
  ]) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      console.log(`✓ ${label} reachable at ${url}`);
    } catch (err) {
      console.error(`Cannot reach ${label} at ${url}. Start with: npm run dev`);
      throw err;
    }
  }
}

async function ensureBypassAuth() {
  try {
    const res = await fetch(`${API_URL}/users/me`, {
      headers: { Authorization: `Bearer ${BYPASS_TOKEN}` },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    const me = await res.json();
    console.log(`✓ Bypass auth OK (${me.email ?? 'dev user'})`);
  } catch {
    throw new Error(
      'API bypass auth failed. Set BYPASS_AUTH=true and BYPASS_TOKEN=dev-bypass-token-local in apps/api and apps/web env, then restart dev servers.',
    );
  }
}

function seedDemoSigners() {
  console.log('→ Seeding Hebrew demo signer profiles');
  execSync('node scripts/seed-demo-hebrew-signers.mjs', {
    cwd: ROOT,
    stdio: 'inherit',
    env: { ...process.env, API_URL, BYPASS_TOKEN },
  });
}

async function pause(page, ms = 1800) {
  await page.waitForLoadState('networkidle', { timeout: 12000 }).catch(() => {});
  await wait(ms);
}

async function clickNext(page) {
  await page.getByRole('button', { name: HE.next, exact: true }).click({ timeout: 12000 });
  await wait(900);
}

async function runBriefTour(page) {
  console.log('→ Onboarding welcome (Hebrew, skip)');
  await page.goto(`${BASE_URL}/onboarding?replay=1`, {
    waitUntil: 'domcontentloaded',
  });
  await pause(page, 2200);
  await page.getByRole('button', { name: 'סגור' }).click({ timeout: 10000 });
  await wait(800);
}

async function runDashboard(page) {
  console.log('→ Dashboard');
  await page.goto(`${BASE_URL}/dashboard`, { waitUntil: 'domcontentloaded' });
  await pause(page, 2200);
}

async function fillMissingSignerEmails(page) {
  const emails = page.getByLabel(HE.email, { exact: true });
  const count = await emails.count();
  for (let i = 0; i < count; i++) {
    const field = emails.nth(i);
    const value = await field.inputValue();
    if (!value.trim()) {
      await field.fill(`demo-signer-${i + 1}@demo.local`);
    }
  }
}

async function runHebrewHaknasotFlow(page) {
  console.log('→ New document — haknasot form + Hebrew signers');
  await page.goto(`${BASE_URL}/documents/new`, { waitUntil: 'domcontentloaded' });
  await expectHeading(page, HE.newDocument);
  await pause(page, 2400);

  await page.getByRole('button', { name: HE.startForm }).click({ timeout: 15000 });
  await page
    .getByRole('button', { name: HE.fillAuto })
    .click({ timeout: 20000 });
  await pause(page, 2200);

  await clickNext(page);

  // Details
  await page.getByLabel(HE.title).fill(HE.demoTitle);
  await pause(page, 2800);
  await clickNext(page);

  // Workflow — municipal approval roles (Hebrew titles + seeded emails)
  const signerEmails = page.getByLabel(HE.email, { exact: true });
  await signerEmails.first().waitFor({ timeout: 20000 });
  const signerCount = await signerEmails.count();
  if (signerCount < 4) {
    throw new Error(`Expected at least 4 signers on workflow step, got ${signerCount}`);
  }
  console.log(`  ${signerCount} Hebrew approval signers loaded`);
  await pause(page, 3200);
  await page.mouse.wheel(0, 280);
  await wait(1200);

  await fillMissingSignerEmails(page);
  await clickNext(page);

  // Review
  await page.getByText(HE.demoTitle).waitFor({ timeout: 10000 });
  await pause(page, 2400);
  await page.getByRole('button', { name: HE.saveAndAssign }).click();
  await page.waitForURL(/\/documents\/[^/]+$/, { timeout: 30000 });
  await pause(page, 3500);

  // Document viewer — show PDF + signer list, then send
  await page.mouse.wheel(0, 200);
  await wait(1000);
  const sendBtn = page.getByRole('button', { name: HE.sendToSigners });
  await sendBtn.waitFor({ timeout: 15000 });
  await pause(page, 2200);
  await sendBtn.click();
  await pause(page, 2800);
}

async function expectHeading(page, name) {
  await page.getByRole('heading', { name, level: 1 }).waitFor({ timeout: 15000 });
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
    `ffmpeg -y -i "${MP4_OUT}" -ss 00:00:04 -frames:v 1 -update 1 "${POSTER_OUT}"`,
    { stdio: 'inherit' },
  );
}

async function main() {
  await ensureServers();
  await ensureBypassAuth();
  seedDemoSigners();

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
    locale: 'he-IL',
  });

  await context.addInitScript((locale) => {
    localStorage.setItem('docflow-locale', locale);
    document.cookie = `docflow-locale=${locale};path=/;max-age=31536000;samesite=lax`;
  }, LOCALE);

  const page = await context.newPage();

  try {
    await runBriefTour(page);
    await runDashboard(page);
    await runHebrewHaknasotFlow(page);
    await runDashboard(page);
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
