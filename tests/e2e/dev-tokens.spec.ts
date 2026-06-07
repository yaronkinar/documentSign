import { test, expect, type Page } from '@playwright/test';

import { gotoApp } from './helpers/navigation';

const THEMES = [
  { theme: 'humane', expectedBg: 'rgb(251, 250, 247)' },
  { theme: 'classic', expectedBg: 'rgb(246, 248, 252)' },
  { theme: 'modern', expectedBg: 'rgb(247, 249, 251)' },
] as const;

async function gotoTokens(page: Page, theme: string) {
  await page.addInitScript((t) => {
    window.localStorage.setItem('docflow-theme', t);
  }, theme);

  const heading = page.getByRole('heading', { name: /tokens & primitives/i });

  await expect(async () => {
    await gotoApp(page, '/dev/tokens');
    await expect(heading).toBeVisible({ timeout: 10_000 });
  }).toPass({ timeout: 45_000 });
}

function attachRuntimeMonitors(page: Page) {
  const consoleErrors: string[] = [];
  const failedResponses: string[] = [];

  page.on('pageerror', (err) => consoleErrors.push(err.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('response', (response) => {
    if (response.status() >= 400) {
      failedResponses.push(`${response.status()} ${response.url()}`);
    }
  });

  return { consoleErrors, failedResponses };
}

function assertNoBlockingFailures(
  consoleErrors: string[],
  failedResponses: string[],
) {
  const transientStatic500 = failedResponses.filter(
    (entry) => entry.startsWith('500 ') && entry.includes('/_next/static/'),
  );
  const blockingResponses = failedResponses.filter(
    (entry) => !transientStatic500.includes(entry),
  );

  expect(
    blockingResponses,
    `Failed responses:\n${blockingResponses.join('\n')}`,
  ).toEqual([]);

  const blockingConsole = consoleErrors.filter((msg) => {
    if (transientStatic500.length === 0) return true;
    return !/Failed to load resource: the server responded with a status of 500/.test(
      msg,
    );
  });

  expect(
    blockingConsole,
    `Console errors:\n${blockingConsole.join('\n')}`,
  ).toEqual([]);
}

test.describe('/dev/tokens preview route', () => {
  // Next dev can return transient 500s for chunks when many workers cold-hit routes.
  test.describe.configure({ mode: 'serial', timeout: 90_000 });

  for (const { theme, expectedBg } of THEMES) {
    test(`renders in ${theme} theme without console errors`, async ({ page }) => {
      const { consoleErrors, failedResponses } = attachRuntimeMonitors(page);

      await gotoTokens(page, theme);

      const htmlClass = await page.evaluate(() =>
        document.documentElement.className,
      );
      expect(htmlClass).toContain(`theme-${theme}`);

      const bg = await page.evaluate(() =>
        getComputedStyle(document.body).backgroundColor,
      );
      expect(bg).toBe(expectedBg);

      assertNoBlockingFailures(consoleErrors, failedResponses);
    });
  }

  test('RTL toggle flips direction without reloading', async ({ page }) => {
    await gotoTokens(page, 'humane');

    const wrapper = page.locator('[data-testid="tokens-preview-root"]');
    await expect(wrapper).toHaveAttribute('dir', 'ltr');

    await page.getByRole('button', { name: /direction: ltr/i }).click();

    await expect(
      page.getByRole('button', { name: /direction: rtl/i }),
    ).toBeVisible();
    await expect(wrapper).toHaveAttribute('dir', 'rtl');
  });

  test('selecting a theme in ThemePicker updates the html class', async ({
    page,
  }) => {
    await gotoTokens(page, 'humane');

    await page.getByRole('radio', { name: /modern/i }).click();

    await expect
      .poll(async () =>
        page.evaluate(() =>
          document.documentElement.classList.contains('theme-modern'),
        ),
      )
      .toBe(true);
  });
});
