import { defineConfig, devices } from '@playwright/test';

const port = Number(process.env.PORT ?? 3100);
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? `http://localhost:${port}`;

const bypassToken = process.env.BYPASS_TOKEN ?? 'dev-bypass-token-local';

/**
 * Reuse an existing dev server on the target URL when possible.
 * Set PLAYWRIGHT_FORCE_NEW_SERVER=1 to always start a fresh Next dev server
 * (use a free PORT if the default is taken).
 */
const forceNewServer = process.env.PLAYWRIGHT_FORCE_NEW_SERVER === '1';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  expect: {
    timeout: 10_000,
  },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [['github'], ['html']] : [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL,
    trace: 'on-first-retry',
  },
  webServer: {
    command: `npm exec --workspace web next dev -- -p ${port}`,
    url: baseURL,
    reuseExistingServer: !forceNewServer,
    timeout: 120_000,
    env: {
      BYPASS_AUTH: 'true',
      BYPASS_TOKEN: bypassToken,
      BYPASS_AUTH_EMAIL: process.env.BYPASS_AUTH_EMAIL ?? 'yaronkinar@gmail.com',
      NEXT_PUBLIC_BYPASS_AUTH: 'true',
      NEXT_PUBLIC_BYPASS_TOKEN: bypassToken,
      NEXT_PUBLIC_API_URL: process.env.PLAYWRIGHT_API_URL ?? 'http://127.0.0.1:3001',
      NEXT_PUBLIC_APP_URL: baseURL,
      NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY:
        process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ??
        'pk_test_c3Rlcmxpbmctc3RhcmZpc2gtNzkuY2xlcmsuYWNjb3VudHMuZGV2JA',
      CLERK_SECRET_KEY:
        process.env.CLERK_SECRET_KEY ??
        'sk_test_playwrightMocksDoNotUseOutsideTests',
    },
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
