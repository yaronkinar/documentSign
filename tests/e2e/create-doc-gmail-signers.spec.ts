import { expect, test, type Page } from '@playwright/test';
import path from 'node:path';

import { GMAIL_TEST_SIGNERS } from './helpers/gmail-signers';
import { gotoApp } from './helpers/navigation';

const API_URL = process.env.PLAYWRIGHT_API_URL ?? 'http://127.0.0.1:3001';
const TINY_PDF = path.join(__dirname, '..', 'fixtures', 'tiny.pdf');

async function assertApiAvailable() {
  try {
    const res = await fetch(`${API_URL}/health`);
    return res.ok;
  } catch {
    return false;
  }
}

async function ensureWorkflowStep(page: Page) {
  const addStep = page.getByRole('button', { name: '+ Add Step' });
  const stepLabel = page.getByRole('textbox').first();
  if (!(await stepLabel.isVisible().catch(() => false))) {
    await addStep.click();
  }
  await expect(page.getByText('Add signer')).toBeVisible();
}

async function removeAllWorkflowSigners(page: Page) {
  const signerRemoveButtons = page.locator('ul.mb-3 > li').getByRole('button', {
    name: 'Remove',
  });
  for (let i = (await signerRemoveButtons.count()) - 1; i >= 0; i -= 1) {
    await signerRemoveButtons.nth(i).click();
  }
}

function addSignerForm(page: Page) {
  return page.locator('.border-dashed');
}

async function uploadPdf(page: Page, pdfPath: string) {
  await expect(page.locator('canvas').first()).toBeVisible({ timeout: 15_000 });

  const fileInput = page.locator('input[type="file"][accept*="pdf"]');
  await expect(fileInput).toHaveCount(1, { timeout: 30_000 });
  await fileInput.setInputFiles(pdfPath);
  await expect(
    page.getByText('Uploading...').or(page.getByLabel('Title')),
  ).toBeVisible({ timeout: 30_000 });
}

async function reachDetailsStep(page: Page) {
  const uploadError = page.locator('.border-red-300');
  await expect(
    page.getByRole('heading', { name: 'Upload your PDF' }),
  ).toBeHidden({ timeout: 90_000 });
  if (await uploadError.isVisible().catch(() => false)) {
    throw new Error(`Upload failed: ${await uploadError.innerText()}`);
  }

  const skipForm = page.getByRole('button', { name: 'Skip for now' });
  if (await skipForm.isVisible().catch(() => false)) {
    await skipForm.click();
  }

  await expect(page.getByLabel('Title')).toBeVisible({ timeout: 30_000 });
}

async function addSignerInWorkflowStep(
  page: Page,
  signer: { name: string; email: string },
) {
  const form = addSignerForm(page);
  await form.getByRole('textbox', { name: 'Email' }).fill(signer.email);
  await form.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(page.locator('ul.mb-3 input[type="email"]').last()).toHaveValue(
    signer.email,
  );
}

test.describe('Create document with Gmail signer aliases', () => {
  test.describe.configure({ mode: 'serial', timeout: 120_000 });

  test.beforeEach(async ({ page }) => {
    const apiUp = await assertApiAvailable();
    test.skip(
      !apiUp,
      `API not reachable at ${API_URL}. Start the dev stack: npm run dev`,
    );

    await page.addInitScript(() => {
      window.localStorage.setItem('docflow-locale', 'en');
    });
  });

  test('uploads a PDF and saves workflow signers as yaronkinar@gmail.com aliases', async ({
    page,
  }) => {
    const docTitle = `Gmail alias test ${Date.now()}`;

    await gotoApp(page, '/documents/new');
    await expect(page.getByRole('heading', { name: 'New Document' })).toBeVisible();

    await uploadPdf(page, TINY_PDF);
    await reachDetailsStep(page);
    await page.getByLabel('Title').fill(docTitle);
    await page.getByRole('button', { name: 'Next' }).click();

    await expect(page.getByText('Add signer')).toBeVisible({ timeout: 30_000 });
    await ensureWorkflowStep(page);
    await removeAllWorkflowSigners(page);

    for (const signer of GMAIL_TEST_SIGNERS) {
      await addSignerInWorkflowStep(page, signer);
    }

    await page.getByRole('button', { name: 'Next' }).click();
    await expect(
      page.getByRole('button', { name: 'Save & assign fields' }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Save & assign fields' }).click();

    await expect(page).toHaveURL(/\/documents\/[a-f0-9]{24}$/, { timeout: 30_000 });

    for (const signer of GMAIL_TEST_SIGNERS) {
      await expect(
        page.getByRole('complementary').getByText(signer.email),
      ).toBeVisible();
    }

    const documentUrl = page.url();
    // eslint-disable-next-line no-console
    console.log('\nDocument created:', documentUrl);
    // eslint-disable-next-line no-console
    console.log('Signers:', GMAIL_TEST_SIGNERS.map((s) => s.email).join(', '));
  });
});
