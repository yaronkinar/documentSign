import { test, expect, type Page } from '@playwright/test';

import { gotoDevTokens } from './helpers/navigation';

async function gotoThemePicker(page: Page) {
  await gotoDevTokens(page);
}

test.describe('Theme persistence', () => {
  test.describe.configure({ mode: 'serial' });

  async function selectTheme(page: Page, name: RegExp) {
    const option = page.getByRole('radio', { name });
    await expect(option).toBeVisible();
    await option.click();
    await expect(option).toHaveAttribute('aria-checked', 'true', { timeout: 5_000 });
  }

  test('selecting a theme writes localStorage and cookie', async ({ page }) => {
    await gotoThemePicker(page);

    await selectTheme(page, /^Modern\b/i);

    await expect
      .poll(async () =>
        page.evaluate(() => window.localStorage.getItem('docflow-theme')),
      )
      .toBe('modern');

    const cookies = await page.context().cookies();
    const themeCookie = cookies.find((c) => c.name === 'docflow-theme');
    expect(themeCookie?.value).toBe('modern');
  });

  test('chosen theme survives a full reload (FOUC-free)', async ({ page }) => {
    await gotoThemePicker(page);
    await selectTheme(page, /^Classic\b/i);

    await page.reload({ waitUntil: 'domcontentloaded' });

    await expect
      .poll(async () =>
        page.evaluate(() => document.documentElement.className),
      )
      .toContain('theme-classic');
  });

  test('switching theme broadcasts to other tabs', async ({ context }) => {
    const tabA = await context.newPage();
    const tabB = await context.newPage();

    await gotoThemePicker(tabA);
    await gotoThemePicker(tabB);

    await selectTheme(tabA, /^Modern\b/i);

    await expect
      .poll(async () =>
        tabB.evaluate(() =>
          document.documentElement.classList.contains('theme-modern'),
        ),
      )
      .toBe(true);

    await tabA.close();
    await tabB.close();
  });
});
