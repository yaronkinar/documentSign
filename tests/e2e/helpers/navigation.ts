import type { Page } from '@playwright/test';

const BYPASS_TOKEN = process.env.BYPASS_TOKEN ?? 'dev-bypass-token-local';

/** Next dev can leave subresources pending; domcontentloaded is enough for E2E. */
export async function gotoApp(page: Page, path: string) {
  await page.addInitScript((token) => {
    document.cookie = `docflow-bypass-token=${encodeURIComponent(token)};path=/;max-age=86400;samesite=lax`;
  }, BYPASS_TOKEN);
  await page.goto(path, { waitUntil: 'domcontentloaded' });
}
