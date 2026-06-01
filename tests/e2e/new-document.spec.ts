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
  await page.route('**/samples/haknasot.pdf', async (route) => {
    const generatedPdf = path.join(
      __dirname,
      '..',
      '..',
      'scripts',
      '.out',
      'haknasot-filled-sample.pdf',
    );

    if (fs.existsSync(generatedPdf)) {
      await route.fulfill({ path: generatedPdf, contentType: 'application/pdf' });
      return;
    }

    await route.fulfill({
      contentType: 'application/pdf',
      body: Buffer.from(
        'JVBERi0xLjQKMSAwIG9iajw8L1R5cGUvQ2F0YWxvZy9QYWdlcyAyIDAgUj4+ZW5kb2JqCjIgMCBvYmo8PC9UeXBlL1BhZ2VzL0tpZHNbMyAwIFJdL0NvdW50IDE+PmVuZG9iagozIDAgb2JqPDwvVHlwZS9QYWdlL1BhcmVudCAyIDAgUi9NZWRpYUJveFswIDAgMjAwIDIwMF0+PmVuZG9iagp0cmFpbGVyPDwvUm9vdCAxIDAgUj4+CiUlRU9G',
        'base64',
      ),
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

  await page.getByRole('button', { name: /Add all approval roles/ }).click();
  await page.getByRole('button', { name: 'Next' }).click();

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
