/**
 * Takes a screenshot of any app page.
 * Auth bypass must be enabled (BYPASS_AUTH=true in .env files).
 *
 * Usage: node scripts/pw-screenshot.mjs <url> [output.png] [--full]
 */
import { chromium } from '@playwright/test';
import fs from 'node:fs';

const url = process.argv[2] ?? 'http://localhost:3000';
const outFile = process.argv[3] ?? 'scripts/.out/screenshot.png';
const fullPage = process.argv.includes('--full');

fs.mkdirSync('scripts/.out', { recursive: true });

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
const page = await context.newPage();

const consoleErrors = [];
page.on('console', (msg) => {
  if (msg.type() === 'error') consoleErrors.push(msg.text());
});

console.log(`Navigating to ${url} …`);
await page.goto(url, { waitUntil: 'load', timeout: 30000 });
// Wait for PDF to render
await page.waitForTimeout(8000);

await page.screenshot({ path: outFile, fullPage });
console.log(`Screenshot saved → ${outFile}`);

if (consoleErrors.length) {
  console.log('\nConsole errors:');
  consoleErrors.forEach((e) => console.log(' ', e));
}

await browser.close();
