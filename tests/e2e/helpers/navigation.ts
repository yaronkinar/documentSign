import { expect, type Page } from '@playwright/test';

const BYPASS_TOKEN = process.env.BYPASS_TOKEN ?? 'dev-bypass-token-local';

/** Next dev can leave subresources pending; domcontentloaded is enough for E2E. */
export async function gotoApp(page: Page, path: string) {
  await page.addInitScript((token) => {
    document.cookie = `docflow-bypass-token=${encodeURIComponent(token)};path=/;max-age=86400;samesite=lax`;
  }, BYPASS_TOKEN);
  await page.goto(path, { waitUntil: 'domcontentloaded' });
}

/**
 * Open the /dev/tokens preview and wait until it actually renders.
 *
 * Next dev compiles routes lazily, so a fresh server under parallel worker load
 * can return a transient 404/500 for /dev/tokens before the route finishes
 * building. Retry the navigation until the page renders instead of failing on
 * the first cold miss.
 */
export async function gotoDevTokens(page: Page) {
  const heading = page.getByRole('heading', { name: /tokens & primitives/i });

  await expect(async () => {
    await gotoApp(page, '/dev/tokens');
    await expect(heading).toBeVisible({ timeout: 10_000 });
  }).toPass({ timeout: 45_000 });
}
