import { test, expect, type Page } from '@playwright/test';

const THEMES = [
  { theme: 'humane', expectedBg: 'rgb(251, 250, 247)' },
  { theme: 'classic', expectedBg: 'rgb(246, 248, 252)' },
  { theme: 'modern', expectedBg: 'rgb(247, 249, 251)' },
] as const;

async function gotoTokens(page: Page, theme: string) {
  await page.addInitScript((t) => {
    window.localStorage.setItem('docflow-theme', t);
  }, theme);
  await page.goto('/dev/tokens');
  await expect(page.getByRole('heading', { name: /tokens & primitives/i })).toBeVisible();
}

test.describe('/dev/tokens preview route', () => {
  for (const { theme, expectedBg } of THEMES) {
    test(`renders in ${theme} theme without console errors`, async ({ page }) => {
      const errors: string[] = [];
      page.on('pageerror', (err) => errors.push(err.message));
      page.on('console', (msg) => {
        if (msg.type() === 'error') errors.push(msg.text());
      });

      await gotoTokens(page, theme);

      const htmlClass = await page.evaluate(() =>
        document.documentElement.className,
      );
      expect(htmlClass).toContain(`theme-${theme}`);

      const bg = await page.evaluate(() =>
        getComputedStyle(document.body).backgroundColor,
      );
      expect(bg).toBe(expectedBg);

      expect(errors, `Console errors: ${errors.join('\n')}`).toEqual([]);
    });
  }

  test('RTL toggle flips direction without reloading', async ({ page }) => {
    await gotoTokens(page, 'humane');

    const initialDir = await page.evaluate(() =>
      document.querySelector('[dir]')?.getAttribute('dir'),
    );
    expect(initialDir).toBe('ltr');

    await page.getByRole('button', { name: /direction: ltr/i }).click();

    await expect(
      page.getByRole('button', { name: /direction: rtl/i }),
    ).toBeVisible();

    await expect
      .poll(async () =>
        page.evaluate(
          () => document.querySelector('[dir]')?.getAttribute('dir'),
        ),
      )
      .toBe('rtl');
  });

  test('selecting a theme in ThemePicker updates the html class', async ({
    page,
  }) => {
    await gotoTokens(page, 'humane');

    await page.getByRole('radio', { name: /modern/i }).click();

    await expect
      .poll(async () =>
        page.evaluate(() => document.documentElement.classList.contains('theme-modern')),
      )
      .toBe(true);
  });
});
