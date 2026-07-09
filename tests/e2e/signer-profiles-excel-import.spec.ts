import { expect, test, type Download } from '@playwright/test';
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

test.describe('signer profiles Excel import', () => {
  test.beforeEach(async ({ page }) => {
    const apiUp = await assertApiAvailable();
    test.skip(
      !apiUp,
      `API not reachable at ${API_URL}. Start the dev stack: npm run dev`,
    );
    void page;
  });

  test('downloads a pre-filled template and imports a filled-in copy', async ({ page }) => {
    const { default: ExcelJS } = await import('exceljs');

    await gotoApp(page, '/signer-profiles');
    await expect(
      page.getByRole('heading', { name: 'Users & signatures' }),
    ).toBeVisible();

    // Haknasot is selected by default. Download its template.
    //
    // Next dev can serve a route's HTML before the client bundle finishes
    // hydrating, so a click right after the button becomes visible can land
    // before React has attached its handler. Retry the click until the
    // download actually fires.
    const downloadButton = page.getByRole('button', { name: 'Download Excel template' });
    await expect(downloadButton).toBeVisible({ timeout: 15_000 });
    let download: Download | undefined;
    await expect(async () => {
      [download] = await Promise.all([
        page.waitForEvent('download', { timeout: 5_000 }),
        downloadButton.click(),
      ]);
    }).toPass({ timeout: 30_000 });
    const templatePath = path.join(os.tmpdir(), `signer-profiles-template-${Date.now()}.xlsx`);
    await saveDownload(download!, templatePath);

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(templatePath);
    const sheet = workbook.worksheets[0];
    expect(sheet.getRow(1).getCell(1).text).toBe('Title');
    const firstRoleTitle = sheet.getRow(2).getCell(1).text;
    expect(firstRoleTitle.length).toBeGreaterThan(0);

    // Fill in the first role row, then upload it back.
    const uniqueName = `E2E Import ${Date.now()}`;
    sheet.getRow(2).getCell(2).value = uniqueName;
    sheet.getRow(2).getCell(3).value = 'e2e-import@example.com';
    const uploadPath = path.join(os.tmpdir(), `signer-profiles-import-${Date.now()}.xlsx`);
    await workbook.xlsx.writeFile(uploadPath);

    try {
      const fileInput = page.locator('input[type="file"][accept=".xlsx"]');
      await fileInput.setInputFiles(uploadPath);

      await expect(page.getByText(/created|updated/)).toBeVisible({ timeout: 15_000 });
      await expect(page.getByRole('cell', { name: uniqueName })).toBeVisible();
    } finally {
      fs.unlinkSync(uploadPath);
    }
  });
});
