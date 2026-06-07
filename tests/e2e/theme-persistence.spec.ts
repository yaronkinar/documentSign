import { test, expect, type Page } from '@playwright/test';

async function gotoSettings(page: Page) {
  await page.goto('/settings');
  await expect(page.getByRole('heading', { name: /settings/i })).toBeVisible();
}

test.describe('Theme persistence', () => {
  test('selecting a theme writes localStorage and cookie', async ({ page }) => {
    await gotoSettings(page);

    await page.getByRole('radio', { name: /modern/i }).click();

    const ls = await page.evaluate(() =>
      window.localStorage.getItem('docflow-theme'),
    );
    expect(ls).toBe('modern');

    const cookies = await page.context().cookies();
    const themeCookie = cookies.find((c) => c.name === 'docflow-theme');
    expect(themeCookie?.value).toBe('modern');
  });

  test('chosen theme survives a full reload (FOUC-free)', async ({ page }) => {
    await gotoSettings(page);
    await page.getByRole('radio', { name: /classic/i }).click();

    await page.reload();

    const htmlClass = await page.evaluate(
      () => document.documentElement.className,
    );
    expect(htmlClass).toContain('theme-classic');
  });

  test('switching theme broadcasts to other tabs', async ({ context }) => {
    const tabA = await context.newPage();
    const tabB = await context.newPage();

    await tabA.goto('/settings');
    await tabB.goto('/settings');

    await tabA.getByRole('radio', { name: /humane/i }).click();
    await tabA.getByRole('radio', { name: /modern/i }).click();

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
