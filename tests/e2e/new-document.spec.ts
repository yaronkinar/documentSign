import { expect, test, type Page, type Route } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

type ApiCall = {
  method: string;
  pathname: string;
  body: unknown;
};

const createdAt = '2026-05-25T07:00:00.000Z';

function mockDocument(overrides: Record<string, unknown> = {}) {
  return {
    _id: 'doc-e2e',
    title: 'הכנסות',
    description: null,
    fileSize: null,
    pageCount: 1,
    ownerId: 'user-e2e',
    status: 'draft',
    currentStep: 1,
    workflowSteps: [],
    participantEmails: [],
    participantClerkIds: ['user-e2e'],
    formTemplateId: 'haknasot',
    formValues: {},
    createdAt,
    updatedAt: createdAt,
    ...overrides,
  };
}

async function fulfillJson(route: Route, data: unknown, status = 200) {
  await route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify(data),
  });
}

async function installPdfMock(page: Page) {
  const tinyPdf = Buffer.from(
    'JVBERi0xLjQKMSAwIG9iajw8L1R5cGUvQ2F0YWxvZy9QYWdlcyAyIDAgUj4+ZW5kb2JqCjIgMCBvYmo8PC9UeXBlL1BhZ2VzL0tpZHNbMyAwIFJdL0NvdW50IDE+PmVuZG9iagozIDAgb2JqPDwvVHlwZS9QYWdlL1BhcmVudCAyIDAgUi9NZWRpYUJveFswIDAgMjAwIDIwMF0+PmVuZG9iagp0cmFpbGVyPDwvUm9vdCAxIDAgUj4+CiUlRU9G',
    'base64',
  );

  const resolvePdfBytes = () => {
    const generatedPdf = path.join(
      __dirname,
      '..',
      '..',
      'scripts',
      '.out',
      'haknasot-filled-sample.pdf',
    );
    return fs.existsSync(generatedPdf) ? fs.readFileSync(generatedPdf) : tinyPdf;
  };

  await page.route('**/api/template-pdf/haknasot', async (route) => {
    const bytes = resolvePdfBytes();
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        mimeType: 'application/pdf',
        data: bytes.toString('base64'),
      }),
    });
  });

  await page.route('**/samples/haknasot.pdf', async (route) => {
    const bytes = resolvePdfBytes();
    await route.fulfill({
      contentType: 'application/pdf',
      body: bytes,
    });
  });
}

async function installApiMocks(page: Page, calls: ApiCall[]) {
  await page.route(/http:\/\/(127\.0\.0\.1|localhost):3001\/.*/, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const postData = request.postData();
    let body: unknown;

    if (postData) {
      try {
        body = JSON.parse(postData);
      } catch {
        body = postData;
      }
    }

    calls.push({ method: request.method(), pathname: url.pathname, body });

    if (request.method() === 'GET' && url.pathname === '/users/me') {
      await fulfillJson(route, {
        email: 'owner@example.com',
        name: 'Owner User',
      });
      return;
    }

    if (request.method() === 'POST' && url.pathname === '/documents') {
      await fulfillJson(route, mockDocument());
      return;
    }

    if (
      request.method() === 'PATCH' &&
      url.pathname === '/documents/doc-e2e/form-values'
    ) {
      const values =
        body && typeof body === 'object' && 'values' in body
          ? (body as { values: Record<string, string> }).values
          : {};
      await fulfillJson(route, mockDocument({ formValues: values }));
      return;
    }

    if (
      request.method() === 'POST' &&
      url.pathname === '/documents/doc-e2e/summarize'
    ) {
      await fulfillJson(route, {
        summary: 'Mocked AI summary for the municipal income form.',
      });
      return;
    }

    if (request.method() === 'PATCH' && url.pathname === '/documents/doc-e2e') {
      await fulfillJson(route, mockDocument(body as Record<string, unknown>));
      return;
    }

    if (
      request.method() === 'POST' &&
      url.pathname === '/documents/doc-e2e/steps'
    ) {
      await fulfillJson(route, mockDocument());
      return;
    }

    await fulfillJson(route, { message: `Unhandled mock: ${url.pathname}` }, 404);
  });
}

test('loads Haknasot template preview via JSON API without errors', async ({
  page,
}) => {
  const templatePdfRequests: Array<{
    accept: string | null;
    responseContentType: string | null;
    payloadMimeType: string | null;
    payloadBytes: number;
  }> = [];

  await page.addInitScript(() => {
    window.localStorage.setItem('docflow-locale', 'en');
  });

  await page.route('**/api/template-pdf/haknasot', async (route) => {
    const tinyPdf = Buffer.from(
      'JVBERi0xLjQKMSAwIG9iajw8L1R5cGUvQ2F0YWxvZy9QYWdlcyAyIDAgUj4+ZW5kb2JqCjIgMCBvYmo8PC9UeXBlL1BhZ2VzL0tpZHNbMyAwIFJdL0NvdW50IDE+PmVuZG9iagozIDAgb2JqPDwvVHlwZS9QYWdlL1BhcmVudCAyIDAgUi9NZWRpYUJveFswIDAgMjAwIDIwMF0+PmVuZG9iagp0cmFpbGVyPDwvUm9vdCAxIDAgUj4+CiUlRU9G',
      'base64',
    );
    const accept = route.request().headers()['accept'] ?? null;

    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        mimeType: 'application/pdf',
        data: tinyPdf.toString('base64'),
      }),
    });

    templatePdfRequests.push({
      accept,
      responseContentType: 'application/json',
      payloadMimeType: 'application/pdf',
      payloadBytes: tinyPdf.length,
    });
  });

  await page.goto('/documents/new');

  await expect(page.getByRole('heading', { name: 'New Document' })).toBeVisible();
  await expect(
    page.getByText('Municipal income form (הכנסות)'),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Start form' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Download PDF' })).toBeVisible();

  await expect(page.getByText(/Template PDF failed to load/i)).toHaveCount(0);
  await expect(page.getByText(/Template PDF is empty/i)).toHaveCount(0);
  await expect(page.getByText('Loading PDF…')).toHaveCount(0);

  await expect(page.locator('canvas').first()).toBeVisible({ timeout: 15_000 });

  await expect.poll(() => templatePdfRequests.length).toBeGreaterThanOrEqual(1);
  for (const req of templatePdfRequests) {
    expect(req.accept).toContain('application/json');
    expect(req.responseContentType).toBe('application/json');
    expect(req.payloadMimeType).toBe('application/pdf');
    expect(req.payloadBytes).toBeGreaterThan(0);
  }
});

test('creates a Haknasot document through the mocked wizard flow', async ({
  page,
}) => {
  const apiCalls: ApiCall[] = [];

  await page.addInitScript(() => {
    window.localStorage.setItem('docflow-locale', 'en');
  });
  await installPdfMock(page);
  await installApiMocks(page, apiCalls);

  await page.goto('/documents/new');

  await expect(page.getByRole('heading', { name: 'New Document' })).toBeVisible();
  await page.getByRole('button', { name: 'Start form' }).click();

  await expect(
    page.getByRole('button', { name: 'Fill automatically' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Fill automatically' }).click();
  await page.getByRole('button', { name: 'Next' }).click();

  await expect(page.getByLabel(/Description/)).toHaveValue(
    'Mocked AI summary for the municipal income form.',
  );
  await page.getByLabel('Title').fill('Playwright mocked integration doc');
  await page.getByRole('button', { name: 'Next' }).click();

  await expect(
    page.getByText('Add an email address for each approval role'),
  ).toBeVisible();

  const addAllApprovals = page.getByRole('button', {
    name: /Add all approval roles/,
  });
  if (await addAllApprovals.isVisible()) {
    await addAllApprovals.click();
  }

  const signerEmails = page.getByLabel('Email');
  await expect(signerEmails.first()).toBeVisible();
  const signerCount = await signerEmails.count();
  for (let i = 0; i < signerCount; i++) {
    await signerEmails.nth(i).fill(`signer${i}@example.com`);
  }

  const workflowNext = page.getByRole('button', { name: 'Next' });
  await expect(workflowNext).toBeEnabled();
  await workflowNext.click();

  await expect(
    page.getByRole('button', { name: 'Save & assign fields' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Save & assign fields' }).click();

  await expect
    .poll(
      () =>
        apiCalls.filter(
          (call) =>
            call.method === 'POST' &&
            call.pathname === '/documents/doc-e2e/steps',
        ).length,
    )
    .toBe(1);

  expect(
    apiCalls.some(
      (call) => call.method === 'POST' && call.pathname === '/documents',
    ),
  ).toBe(true);
  expect(
    apiCalls.some(
      (call) =>
        call.method === 'PATCH' &&
        call.pathname === '/documents/doc-e2e/form-values',
    ),
  ).toBe(true);
});
