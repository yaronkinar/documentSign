import { expect, test, type Locator, type Page } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { gotoApp, saveDownload } from './helpers/navigation';

const API_URL = process.env.PLAYWRIGHT_API_URL ?? 'http://127.0.0.1:3001';

async function assertApiAvailable() {
  try {
    const res = await fetch(`${API_URL}/health`);
    return res.ok;
  } catch {
    return false;
  }
}

/** The workflow editor lists each signer as an <li> inside `ul.mb-3`. */
function signerRows(page: Page): Locator {
  return page.locator('ul.mb-3 > li');
}

/** Click a "Download PDF" button and return the downloaded file's bytes. */
async function downloadPdfBytes(page: Page): Promise<Buffer> {
  const button = page.getByRole('button', { name: 'Download PDF' }).first();
  await expect(button).toBeEnabled({ timeout: 30_000 });
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    button.click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/\.pdf$/i);
  const downloadPath = path.join(os.tmpdir(), `send-sign-download-${Date.now()}.pdf`);
  await saveDownload(download, downloadPath);
  return fs.readFileSync(downloadPath);
}

/**
 * Extract every dd/mm/yyyy date stamped into a PDF's text layer. The Haknasot
 * renderer draws each signer's signed date in this format, so for a document
 * whose form was skipped these dates are a reliable proxy for "a signature was
 * baked in".
 */
async function extractPdfDates(bytes: Buffer): Promise<string[]> {
  const { PDFParse } = await import('pdf-parse');
  const parser = new PDFParse({ data: new Uint8Array(bytes) });
  const { text } = await parser.getText();
  return text.match(/\d{2}\/\d{2}\/\d{4}/g) ?? [];
}

/**
 * Drive the New Document wizard to create a Haknasot (municipal form) document
 * with a single approval signer that is the current (bypass) user, then land on
 * the document page in draft state.
 *
 * Haknasot is a form template, so its signature fields are auto-mapped to the
 * signer's role on submit — no manual field placement is required, which keeps
 * the "send" precondition (all signers mapped) satisfied without canvas clicks.
 */
async function createHaknasotDocAsSelfSigner(page: Page) {
  await gotoApp(page, '/documents/new');
  await expect(page.getByRole('heading', { name: 'New Document' })).toBeVisible();

  // Start -> create the Haknasot document. Wait for the template preview canvas
  // first: it only renders after the client bundle hydrates. Clicking before
  // then can drop the event (the button is server-rendered but its onClick is
  // not attached yet), leaving the wizard stuck on the Start step.
  const startFormButton = page.getByRole('button', { name: 'Start form' });
  await expect(startFormButton).toBeEnabled();
  await expect(page.getByText('Loading PDF…')).toHaveCount(0, { timeout: 30_000 });
  await expect(async () => {
    const canvas = page.locator('canvas').first();
    await expect(canvas).toBeVisible({ timeout: 5_000 });
    const box = await canvas.boundingBox();
    expect(box?.width ?? 0).toBeGreaterThan(0);
    expect(box?.height ?? 0).toBeGreaterThan(0);
  }).toPass({ timeout: 30_000 });
  // The PDF preview can overlap the button; force ensures the handler runs.
  await startFormButton.click({ force: true });

  // Fail loudly if the create-document call errored, instead of timing out below.
  const startError = page.locator('.border-red-300');
  if (await startError.isVisible().catch(() => false)) {
    throw new Error(`Start form failed: ${await startError.innerText()}`);
  }

  // Attach-contract step: attach a real sample PDF before the wizard advances
  // to the form step. This hits the real dev API, so the attach -> confirm ->
  // summarize -> extract-form-values round trip takes real network time.
  await expect(
    page.getByRole('heading', { name: 'Attach the contract' }),
  ).toBeVisible({ timeout: 30_000 });
  await page
    .locator('input[type="file"]')
    .setInputFiles(path.join(process.cwd(), 'apps/web/public/samples/haknasot.pdf'));

  // Form step: skip filling values (avoids the AI summary round-trip).
  const skipButton = page.getByRole('button', { name: 'Skip for now' });
  await expect(skipButton).toBeVisible({ timeout: 30_000 });
  await skipButton.click();

  // Details step: give it a unique title, then continue.
  const titleInput = page.locator('#new-document-title');
  await expect(titleInput).toBeVisible({ timeout: 30_000 });
  await titleInput.fill(`E2E send-sign-download ${Date.now()}`);
  await page.getByRole('button', { name: 'Next' }).click();

  // Workflow step: roles are pre-populated (possibly with emails from saved
  // signer profiles). Clear every pre-filled row, then add a single signer that
  // is the current user, so one signer (me) owns the whole workflow. The
  // signer keeps a municipal role name so the Haknasot template auto-maps a
  // signature field to it (required before the document can be sent).
  const rows = signerRows(page);
  await expect(rows.first()).toBeVisible({ timeout: 30_000 });

  for (let count = await rows.count(); count > 0; count -= 1) {
    await rows
      .nth(count - 1)
      .getByRole('button', { name: 'Remove', exact: true })
      .click();
    await expect(rows).toHaveCount(count - 1);
  }

  // The add-signer form's role <select> is the one offering the "Custom name…"
  // option (the other <select> on screen is the step-type picker).
  const roleSelect = page
    .locator('select')
    .filter({ has: page.locator('option', { hasText: 'Custom name' }) });
  await roleSelect.selectOption({ index: 1 });

  // "Add me" fills the new-signer email with the current user's address.
  await page.getByRole('button', { name: 'Add me' }).click();
  await page.getByRole('button', { name: 'Add', exact: true }).click();

  await expect(rows).toHaveCount(1);
  await expect(rows.first().locator('input[type="email"]')).not.toHaveValue('');

  // Workflow -> Review.
  await page.getByRole('button', { name: 'Next' }).click();

  // Review -> persist steps and open the document page. Retry the click: the
  // local dev API runs in watch mode and can briefly restart mid-run, which
  // surfaces here as a transient "network error" without navigating. Re-posting
  // the steps is idempotent, so clicking again once the API is back is safe.
  const docUrlPattern = /\/documents\/[a-f0-9]{24}$/;
  const saveButton = page.getByRole('button', { name: 'Save & assign fields' });
  await expect(async () => {
    if (!docUrlPattern.test(page.url())) {
      await saveButton.click();
    }
    await expect(page).toHaveURL(docUrlPattern, { timeout: 10_000 });
  }).toPass({ timeout: 90_000 });
}

test.describe('Send, sign, and download a document', () => {
  test.describe.configure({ mode: 'serial', timeout: 180_000 });

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

  test('owner sends to signers, signs, and downloads the completed PDF', async ({
    page,
  }) => {
    await createHaknasotDocAsSelfSigner(page);

    const documentUrl = page.url();
    // eslint-disable-next-line no-console
    console.log('\nDocument created:', documentUrl);

    // Document opens in draft.
    await expect(page.getByText('Draft', { exact: true })).toBeVisible();
    await expect(page.locator('canvas').first()).toBeVisible({ timeout: 30_000 });

    // --- SEND ---------------------------------------------------------------
    const sendButton = page.getByRole('button', { name: 'Send to signers' });
    await expect(sendButton).toBeEnabled({ timeout: 30_000 });
    await sendButton.click();

    await expect(
      page.getByText('Pending signature', { exact: true }),
    ).toBeVisible({ timeout: 30_000 });

    // Baseline: the rendered PDF before anyone signs has no signature rows, and
    // since the form was skipped it carries no dd/mm/yyyy dates either.
    const unsignedPdf = await downloadPdfBytes(page);
    expect(unsignedPdf.subarray(0, 4).toString('latin1')).toBe('%PDF');
    const unsignedDates = await extractPdfDates(unsignedPdf);

    // --- SIGN ---------------------------------------------------------------
    const signButton = page.getByRole('button', { name: 'Sign Document' });
    await expect(signButton).toBeVisible({ timeout: 30_000 });
    await signButton.click();

    // If the signer has no saved/profile signature, the signature pad opens and
    // we capture one via the "Type" tab (no canvas drawing required). When a
    // saved signature already exists, the app applies it directly and no pad
    // appears — both paths are valid.
    const typeTab = page.getByRole('button', { name: 'Type' });
    const padOpened = await typeTab
      .waitFor({ state: 'visible', timeout: 5_000 })
      .then(() => true)
      .catch(() => false);
    if (padOpened) {
      await typeTab.click();
      await page.getByPlaceholder('Type your name').fill('E2E Owner');
      await page.getByRole('button', { name: 'Use Signature' }).click();
    }

    // A single signer in a single step => the document is fully approved.
    await expect(page.getByText('Approved', { exact: true })).toBeVisible({
      timeout: 30_000,
    });

    // --- DOWNLOAD + VERIFY SIGNATURES ---------------------------------------
    // The viewer re-renders the PDF after signing, so the download can briefly
    // serve the pre-signature version. Retry until the freshly stamped
    // signature (its dd/mm/yyyy signed date) appears in the downloaded file.
    let signedPdf = Buffer.alloc(0);
    let signedDates: string[] = [];
    await expect(async () => {
      signedPdf = await downloadPdfBytes(page);
      signedDates = await extractPdfDates(signedPdf);
      expect(signedDates.length).toBeGreaterThan(unsignedDates.length);
    }).toPass({ timeout: 30_000 });

    // PDFs start with the "%PDF" magic header.
    expect(signedPdf.subarray(0, 4).toString('latin1')).toBe('%PDF');
    // The signed PDF must carry at least one stamped signature date...
    expect(signedDates.length).toBeGreaterThanOrEqual(1);
    // ...and must differ from the unsigned baseline (signature content baked in).
    expect(signedPdf.equals(unsignedPdf)).toBe(false);
  });
});
