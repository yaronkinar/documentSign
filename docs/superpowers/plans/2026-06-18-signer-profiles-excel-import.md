# Signer Profiles Excel Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On `/signer-profiles`, let users download a per-template Excel file pre-filled with role titles, fill in Name/Email, and upload it back to bulk create/update signer profiles.

**Architecture:** Two new endpoints on `SignerProfilesController` (`GET /signer-profiles/template.xlsx`, `POST /signer-profiles/import`), backed by new `SignerProfilesService` methods that use `exceljs` to read/write workbooks. Row-classification logic (the only piece worth unit-testing in isolation) lives in `packages/shared` as a pure function, since `apps/api` has no test runner installed in this repo — everything else is verified through a Playwright e2e test, matching how the rest of this codebase is tested (see `tests/e2e/*.spec.ts`; there are zero `*.spec.ts` files under `apps/api`).

**Tech Stack:** NestJS (`apps/api`), Next.js (`apps/web`), `@docflow/shared` (Vitest), `exceljs` (new dependency), Playwright (`tests/e2e`).

**Spec:** `docs/superpowers/specs/2026-06-18-signer-profiles-excel-import-design.md`

---

## Reference: design decisions already locked in

- Template download is pre-filled with role titles (Haknasot's `MUNICIPAL_APPROVAL_SIGNER_TITLES`, or a custom `PdfTemplate`'s unique field labels); Name/Email are left blank.
- Import matches existing profiles by `(ownerId, templateId, title)` only — update on match, create otherwise.
- Row handling: blank title+name → ignored silently; title without name → ignored silently (expected — most pre-filled roles go unused); name without title → reported as skipped (`missing-title`); invalid email format → reported as skipped (`invalid-email`); checked in that priority order.
- Response shows a created/updated summary plus any skipped rows with reasons.

---

### Task 1: Add the `exceljs` dependency to the API

**Files:**
- Modify: `apps/api/package.json`

- [ ] **Step 1: Add the dependency**

In `apps/api/package.json`, add to `"dependencies"` (keep alphabetical order, between `"@supabase/supabase-js"` and `"bcrypt"`):

```json
    "exceljs": "^4.4.0",
```

- [ ] **Step 2: Install**

Run: `npm install` (from the repo root — this is an npm workspaces monorepo, so installing from root resolves `apps/api`'s new dependency).
Expected: `exceljs` appears under `node_modules/exceljs` and `apps/api/package.json`'s lockfile entry updates with no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/api/package.json package-lock.json
git commit -m "Add exceljs dependency to the API"
```

---

### Task 2: Shared types — `ImportSignerProfilesResultDto` and row classification

This is the only pure, easily-unit-testable piece of the feature (everything else touches Mongoose or the DOM), so it lives in `packages/shared` where Vitest is already configured (see `packages/shared/src/document-form-fields.test.ts` for the existing pattern).

**Files:**
- Create: `packages/shared/src/signer-profile-import.ts`
- Create: `packages/shared/src/signer-profile-import.test.ts`
- Modify: `packages/shared/src/index.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/shared/src/signer-profile-import.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { classifySignerProfileImportRow } from './signer-profile-import.js';

describe('classifySignerProfileImportRow', () => {
  it('ignores a fully blank row', () => {
    const result = classifySignerProfileImportRow({
      row: 2,
      title: '',
      name: '',
      email: '',
    });
    expect(result).toEqual({ kind: 'ignore' });
  });

  it('ignores a pre-filled role row with no name typed in', () => {
    const result = classifySignerProfileImportRow({
      row: 2,
      title: 'Engineer',
      name: '',
      email: '',
    });
    expect(result).toEqual({ kind: 'ignore' });
  });

  it('skips a row with a name but no title', () => {
    const result = classifySignerProfileImportRow({
      row: 3,
      title: '',
      name: 'Jane Doe',
      email: '',
    });
    expect(result).toEqual({ kind: 'skip', row: 3, reason: 'missing-title' });
  });

  it('skips a row with a malformed email', () => {
    const result = classifySignerProfileImportRow({
      row: 4,
      title: 'Engineer',
      name: 'Jane Doe',
      email: 'not-an-email',
    });
    expect(result).toEqual({ kind: 'skip', row: 4, reason: 'invalid-email' });
  });

  it('upserts a row with title + name and no email', () => {
    const result = classifySignerProfileImportRow({
      row: 5,
      title: 'Engineer',
      name: 'Jane Doe',
      email: '',
    });
    expect(result).toEqual({
      kind: 'upsert',
      title: 'Engineer',
      name: 'Jane Doe',
      email: null,
    });
  });

  it('upserts a row with title + name + valid email, trimmed', () => {
    const result = classifySignerProfileImportRow({
      row: 6,
      title: '  Engineer  ',
      name: '  Jane Doe  ',
      email: '  jane@example.com  ',
    });
    expect(result).toEqual({
      kind: 'upsert',
      title: 'Engineer',
      name: 'Jane Doe',
      email: 'jane@example.com',
    });
  });

  it('upserts a row with a custom title not in any known role list', () => {
    const result = classifySignerProfileImportRow({
      row: 7,
      title: 'Extra Reviewer',
      name: 'Jane Doe',
      email: '',
    });
    expect(result.kind).toBe('upsert');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test -w @docflow/shared`
Expected: FAIL — `Cannot find module './signer-profile-import.js'` (or similar resolution error), since the implementation file doesn't exist yet.

- [ ] **Step 3: Write the implementation**

Create `packages/shared/src/signer-profile-import.ts`:

```ts
/** A single raw row read from an uploaded signer-profile import workbook. */
export interface SignerProfileImportRow {
  row: number;
  title: string;
  name: string;
  email: string;
}

export type SignerProfileImportSkipReason = 'missing-title' | 'invalid-email';

export type SignerProfileImportRowResult =
  | { kind: 'ignore' }
  | { kind: 'skip'; row: number; reason: SignerProfileImportSkipReason }
  | { kind: 'upsert'; title: string; name: string; email: string | null };

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Classifies one row of an uploaded signer-profile import sheet.
 *
 * Checks run in this priority order: a fully blank row is ignored; a row
 * missing only its title is reported as a problem (it has a name to act on
 * but nowhere to put it); a malformed email is reported next; a row with a
 * title but no name is ignored silently (expected — most pre-filled roles
 * go unused); anything else is upserted.
 */
export function classifySignerProfileImportRow(
  input: SignerProfileImportRow,
): SignerProfileImportRowResult {
  const title = input.title.trim();
  const name = input.name.trim();
  const email = input.email.trim();

  if (!title && !name) return { kind: 'ignore' };
  if (!title) return { kind: 'skip', row: input.row, reason: 'missing-title' };
  if (email && !EMAIL_PATTERN.test(email)) {
    return { kind: 'skip', row: input.row, reason: 'invalid-email' };
  }
  if (!name) return { kind: 'ignore' };

  return { kind: 'upsert', title, name, email: email || null };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test -w @docflow/shared`
Expected: PASS — all 7 tests in `signer-profile-import.test.ts` green (plus the pre-existing suites in that package).

- [ ] **Step 5: Export the new module and add the result DTO**

In `packages/shared/src/index.ts`, add the DTO right after `SignerProfileDto` (after line 223, i.e. right after its closing `}`):

```ts
export interface ImportSignerProfilesResultDto {
  created: number;
  updated: number;
  skipped: { row: number; reason: SignerProfileImportSkipReason }[];
  profiles: SignerProfileDto[];
}
```

Then add the re-export block near the other domain-logic re-exports (next to the `document-form-fields.js` block, e.g. right after its closing `} from './document-form-fields.js';`):

```ts
export {
  classifySignerProfileImportRow,
  type SignerProfileImportRow,
  type SignerProfileImportRowResult,
  type SignerProfileImportSkipReason,
} from './signer-profile-import.js';
```

- [ ] **Step 6: Build shared and verify the new exports compile**

Run: `npm run build -w @docflow/shared`
Expected: succeeds with no TypeScript errors, `packages/shared/dist/signer-profile-import.js` and `.d.ts` are produced.

- [ ] **Step 7: Commit**

```bash
git add packages/shared/src/signer-profile-import.ts packages/shared/src/signer-profile-import.test.ts packages/shared/src/index.ts
git commit -m "Add signer profile import row classification to shared package"
```

---

### Task 3: API — role resolution + PdfTemplate access in `SignerProfilesService`

**Files:**
- Modify: `apps/api/src/signer-profiles/signer-profiles.module.ts`
- Modify: `apps/api/src/signer-profiles/signer-profiles.service.ts`

- [ ] **Step 1: Register the `PdfTemplate` model in `SignerProfilesModule`**

In `apps/api/src/signer-profiles/signer-profiles.module.ts`, replace the full file:

```ts
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { StorageModule } from '../storage/storage.module';
import { PdfTemplate, PdfTemplateSchema } from '../templates/template.schema';
import { SignerProfile, SignerProfileSchema } from './signer-profile.schema';
import { SignerProfilesController } from './signer-profiles.controller';
import { SignerProfilesService } from './signer-profiles.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: SignerProfile.name, schema: SignerProfileSchema },
      { name: PdfTemplate.name, schema: PdfTemplateSchema },
    ]),
    StorageModule,
  ],
  providers: [SignerProfilesService],
  controllers: [SignerProfilesController],
  exports: [SignerProfilesService],
})
export class SignerProfilesModule {}
```

This registers the same `PdfTemplate` schema a second time (it's already registered in `TemplatesModule`) — Mongoose/Nest supports this; both modules get a model bound to the same underlying collection on the same connection. No dependency on `TemplatesModule` itself, so no circular-import risk.

- [ ] **Step 2: Inject the model and add `resolveRoleTitles`**

In `apps/api/src/signer-profiles/signer-profiles.service.ts`, update the imports at the top (after the existing `import { SignerProfile, SignerProfileDocument } from './signer-profile.schema';` line):

```ts
import {
  HAKNASOT_FORM_TEMPLATE_ID,
  MUNICIPAL_APPROVAL_SIGNER_TITLES,
} from '@docflow/shared';
import { PdfTemplate, PdfTemplateDocument } from '../templates/template.schema';
```

Update the existing `import type { SignerProfileDto } from '@docflow/shared';` line — merge it into one `@docflow/shared` import:

```ts
import type { SignerProfileDto } from '@docflow/shared';
import {
  HAKNASOT_FORM_TEMPLATE_ID,
  MUNICIPAL_APPROVAL_SIGNER_TITLES,
} from '@docflow/shared';
```

(Two separate import statements from the same module is fine and matches how other files in this codebase mix `import type` and `import` from the same package — no need to combine them into one statement.)

Update the constructor to inject the new model:

```ts
  constructor(
    @InjectModel(SignerProfile.name)
    private readonly profileModel: Model<SignerProfileDocument>,
    @InjectModel(PdfTemplate.name)
    private readonly pdfTemplateModel: Model<PdfTemplateDocument>,
    private readonly storageService: StorageService,
  ) {}
```

Add this new method anywhere in the class (e.g. right after `list`):

```ts
  /** Role titles to pre-fill on an Excel template for this templateId. */
  async resolveRoleTitles(ownerId: string, templateId: string): Promise<string[]> {
    if (templateId === HAKNASOT_FORM_TEMPLATE_ID) {
      return [...MUNICIPAL_APPROVAL_SIGNER_TITLES];
    }
    const template = await this.pdfTemplateModel.findById(templateId).exec();
    if (!template || template.ownerId !== ownerId) return [];
    const seen = new Set<string>();
    const roles: string[] = [];
    for (const field of template.fields) {
      const label = field.label.trim();
      if (!label || seen.has(label)) continue;
      seen.add(label);
      roles.push(label);
    }
    return roles;
  }
```

- [ ] **Step 3: Verify it compiles**

Run: `npm run build -w @docflow/shared && npm run build -w api`
Expected: both succeed with no TypeScript errors.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/signer-profiles/signer-profiles.module.ts apps/api/src/signer-profiles/signer-profiles.service.ts
git commit -m "Resolve signer profile role titles per template"
```

---

### Task 4: API — generate the Excel template workbook

**Files:**
- Modify: `apps/api/src/signer-profiles/signer-profiles.service.ts`

- [ ] **Step 1: Add the `import ExcelJS from 'exceljs';` import**

At the top of `apps/api/src/signer-profiles/signer-profiles.service.ts`, add:

```ts
import ExcelJS from 'exceljs';
```

- [ ] **Step 2: Add `buildTemplateWorkbook`**

Add this method to `SignerProfilesService`, after `resolveRoleTitles`:

```ts
  /** Builds an .xlsx with Title/Name/Email columns, Title pre-filled per role. */
  async buildTemplateWorkbook(ownerId: string, templateId: string): Promise<Buffer> {
    const roles = await this.resolveRoleTitles(ownerId, templateId);

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Signer Profiles');
    sheet.columns = [
      { header: 'Title', key: 'title', width: 32 },
      { header: 'Name', key: 'name', width: 24 },
      { header: 'Email', key: 'email', width: 32 },
    ];
    sheet.getRow(1).font = { bold: true };
    for (const title of roles) {
      sheet.addRow({ title, name: '', email: '' });
    }

    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }
```

- [ ] **Step 3: Verify it compiles**

Run: `npm run build -w api`
Expected: succeeds with no TypeScript errors.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/signer-profiles/signer-profiles.service.ts
git commit -m "Generate signer profile Excel templates"
```

---

### Task 5: API — import a filled-in workbook

**Files:**
- Modify: `apps/api/src/signer-profiles/signer-profiles.service.ts`

- [ ] **Step 1: Add the `classifySignerProfileImportRow` import**

In `apps/api/src/signer-profiles/signer-profiles.service.ts`, extend the `@docflow/shared` value import added in Task 3:

```ts
import {
  HAKNASOT_FORM_TEMPLATE_ID,
  MUNICIPAL_APPROVAL_SIGNER_TITLES,
  classifySignerProfileImportRow,
} from '@docflow/shared';
```

And extend the `import type` line to also pull in `ImportSignerProfilesResultDto` and `SignerProfileImportSkipReason`:

```ts
import type {
  SignerProfileDto,
  ImportSignerProfilesResultDto,
  SignerProfileImportSkipReason,
} from '@docflow/shared';
```

- [ ] **Step 2: Add `importFromWorkbook`**

Add this method after `buildTemplateWorkbook`. It reads every data row into a plain array first (cell access via `eachRow` is synchronous), then walks that array applying each classified row — upserts need `await`, which `eachRow`'s callback can't do, so the two steps (read, then apply) must be separate:

```ts
  /** Parses an uploaded .xlsx and upserts SignerProfile rows by (templateId, title). */
  async importFromWorkbook(
    ownerId: string,
    templateId: string,
    buffer: Buffer,
  ): Promise<ImportSignerProfilesResultDto> {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);
    const sheet = workbook.worksheets[0];
    if (!sheet) {
      throw new BadRequestException('Empty or invalid Excel file');
    }

    const rows: { row: number; title: string; name: string; email: string }[] = [];
    sheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return; // header row
      rows.push({
        row: rowNumber,
        title: String(row.getCell(1).text ?? ''),
        name: String(row.getCell(2).text ?? ''),
        email: String(row.getCell(3).text ?? ''),
      });
    });

    let created = 0;
    let updated = 0;
    const skipped: { row: number; reason: SignerProfileImportSkipReason }[] = [];

    for (const rawRow of rows) {
      const result = classifySignerProfileImportRow(rawRow);
      if (result.kind === 'ignore') continue;
      if (result.kind === 'skip') {
        skipped.push({ row: result.row, reason: result.reason });
        continue;
      }

      const existing = await this.profileModel
        .findOne({ ownerId, templateId, title: result.title })
        .exec();
      if (existing) {
        existing.name = result.name;
        existing.email = result.email;
        await existing.save();
        updated += 1;
      } else {
        await this.profileModel.create({
          ownerId,
          templateId,
          title: result.title,
          name: result.name,
          email: result.email,
          signatureImageKey: null,
        });
        created += 1;
      }
    }

    const profiles = await this.list(ownerId, templateId);
    return { created, updated, skipped, profiles };
  }
```

- [ ] **Step 3: Verify it compiles**

Run: `npm run build -w api`
Expected: succeeds with no TypeScript errors.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/signer-profiles/signer-profiles.service.ts
git commit -m "Import signer profiles from an uploaded Excel workbook"
```

---

### Task 6: API — controller endpoints

**Files:**
- Modify: `apps/api/src/signer-profiles/signer-profiles.controller.ts`

- [ ] **Step 1: Update imports**

Replace the top import block (lines 1–22) with:

```ts
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Param,
  Patch,
  Post,
  Query,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { ImportSignerProfilesResultDto, SignerProfileDto } from '@docflow/shared';

import { ClerkAuthGuard } from '../auth/clerk.guard';
import { CurrentUser, CurrentUserPayload } from '../auth/current-user.decorator';
import {
  ConfirmProfileSignatureDto,
  CreateSignerProfileDto,
  UpdateSignerProfileDto,
} from './signer-profiles.dto';
import { SignerProfilesService } from './signer-profiles.service';
```

- [ ] **Step 2: Add the two new endpoints**

Add these methods right after the existing `dedupe` method (after its closing `}`, before `@Patch(':id')`):

```ts
  @Get('template.xlsx')
  @Header(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  )
  @Header('Cache-Control', 'no-store')
  async downloadTemplate(
    @CurrentUser() user: CurrentUserPayload,
    @Query('templateId') templateId?: string,
  ): Promise<StreamableFile> {
    if (!templateId?.trim()) {
      throw new BadRequestException('templateId query parameter is required');
    }
    const buffer = await this.signerProfilesService.buildTemplateWorkbook(
      user.clerkId,
      templateId.trim(),
    );
    return new StreamableFile(buffer);
  }

  @Post('import')
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: 5 * 1024 * 1024 } }),
  )
  importFromExcel(
    @CurrentUser() user: CurrentUserPayload,
    @Query('templateId') templateId: string | undefined,
    @UploadedFile() file: { buffer: Buffer } | undefined,
  ): Promise<ImportSignerProfilesResultDto> {
    if (!templateId?.trim()) {
      throw new BadRequestException('templateId query parameter is required');
    }
    if (!file?.buffer?.length) {
      throw new BadRequestException('No file uploaded');
    }
    return this.signerProfilesService.importFromWorkbook(
      user.clerkId,
      templateId.trim(),
      file.buffer,
    );
  }
```

- [ ] **Step 3: Verify it compiles**

Run: `npm run build -w api`
Expected: succeeds with no TypeScript errors.

- [ ] **Step 4: Manual smoke test against the running API**

Start the stack if not already running: `npm run dev` (from repo root). In a separate terminal:

```bash
curl -s -o /tmp/signer-profiles-template.xlsx -w "%{http_code}\n" \
  "http://localhost:3001/signer-profiles/template.xlsx?templateId=haknasot" \
  -H "Authorization: Bearer dev-bypass-token-local"
```

Expected: prints `200`, and `/tmp/signer-profiles-template.xlsx` is a non-empty `.xlsx` file (`file /tmp/signer-profiles-template.xlsx` reports a Zip/Excel archive). This requires the API to be running with `BYPASS_AUTH=true BYPASS_TOKEN=dev-bypass-token-local` in its environment — check `apps/api/.env` or however the dev API is normally started in this project; if bypass isn't configured, skip this manual check and rely on Task 9's e2e test instead.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/signer-profiles/signer-profiles.controller.ts
git commit -m "Add Excel template download and import endpoints"
```

---

### Task 7: Web — API client support for blob downloads and form-data query params

**Files:**
- Modify: `apps/web/lib/api-client.ts`

- [ ] **Step 1: Add a `requestBlob` helper and `getBlob` to `apiClient`**

In `apps/web/lib/api-client.ts`, add this function after `requestFormData` (after its closing `}`, before `export const apiClient = {`):

```ts
async function requestBlob(
  path: string,
  opts: RequestOptions = {},
): Promise<Blob> {
  const url = new URL(`${API_URL}${path}`);
  if (opts.query) {
    for (const [k, v] of Object.entries(opts.query)) {
      if (v !== undefined) url.searchParams.set(k, String(v));
    }
  }
  const headers: Record<string, string> = {};
  const token = SERVER_BYPASS_TOKEN ?? opts.token;
  if (token) headers['Authorization'] = `Bearer ${token}`;

  let res: Response;
  try {
    res = await fetch(url.toString(), { headers, cache: 'no-store' });
  } catch (err) {
    const hint =
      err instanceof TypeError
        ? ` Cannot reach the API at ${API_URL}. Is "npm run dev:api" running?`
        : '';
    throw new Error(`Network error calling GET ${path}.${hint}`, { cause: err });
  }
  if (!res.ok) {
    let message = `Request failed: ${res.status}`;
    try {
      const data = await res.json();
      message = formatApiErrorMessage(data, message);
    } catch {
      // ignore
    }
    throw new ApiError(res.status, message);
  }
  return res.blob();
}
```

Update `requestFormData`'s signature to confirm it already accepts `opts.query` (it does — no change needed there; this step is just a note for the engineer, skip if already true). Verify by reading the current `requestFormData` body: it already builds `url` from `opts.query` the same way. Good — no change needed to `requestFormData` itself, only the hook needs to expose `query` to it (next step).

Add `getBlob` to the `apiClient` object (after the existing `delete` method, before `postFormData`):

```ts
  getBlob(path: string, opts?: RequestOptions): Promise<Blob> {
    return requestBlob(path, opts);
  },
```

- [ ] **Step 2: Expose `getBlob` and query support for `postFormData` on the hook**

In the `useApiClient` hook's returned object, add `getBlob` (after the `delete` method) and add an optional `query` parameter to `postFormData`:

```ts
      getBlob(path: string, query?: RequestOptions['query']) {
        return withToken<Blob>((token) =>
          apiClient.getBlob(path, { token, query }),
        );
      },
      async postFormData(
        path: string,
        formData: FormData,
        query?: RequestOptions['query'],
      ): Promise<Response> {
        return withToken((token) =>
          apiClient.postFormData(path, formData, { token, query }),
        );
      },
```

This replaces the existing `postFormData` entry in the hook (the one currently at the end of the returned object).

- [ ] **Step 3: Verify it compiles**

Run: `npm run build -w @docflow/shared && npm run build -w web`
Expected: succeeds with no TypeScript errors. (`convert-word-to-pdf.ts`'s call to `api.postFormData('/documents/convert-to-pdf', form)` still type-checks since `query` is optional.)

- [ ] **Step 4: Commit**

```bash
git add apps/web/lib/api-client.ts
git commit -m "Add blob download and form-data query support to the API client"
```

---

### Task 8: Web — i18n strings

**Files:**
- Modify: `apps/web/lib/i18n/locales/en.ts`
- Modify: `apps/web/lib/i18n/locales/he.ts`

- [ ] **Step 1: Add English keys**

In `apps/web/lib/i18n/locales/en.ts`, inside the `users: { ... }` block, add these keys right after `removeDuplicatesFailed: 'Failed to remove duplicates',` (still inside the `users` object, before its closing `},`):

```ts
    downloadTemplate: 'Download Excel template',
    downloadTemplateFailed: 'Failed to download Excel template',
    uploadTemplate: 'Upload filled Excel',
    importSummary: '{{created}} created, {{updated}} updated',
    importSkippedHeading: 'Skipped rows:',
    importReasonMissingTitle: 'missing title',
    importReasonInvalidEmail: 'invalid email',
    importFailed: 'Failed to import Excel file',
```

- [ ] **Step 2: Add Hebrew keys**

In `apps/web/lib/i18n/locales/he.ts`, inside the `users: { ... }` block, add the matching keys right after `removeDuplicatesFailed: 'הסרת הכפילויות נכשלה',` (before the closing `},`):

```ts
    downloadTemplate: 'הורד תבנית אקסל',
    downloadTemplateFailed: 'הורדת תבנית האקסל נכשלה',
    uploadTemplate: 'העלה אקסל מלא',
    importSummary: 'נוצרו {{created}}, עודכנו {{updated}}',
    importSkippedHeading: 'שורות שדולגו:',
    importReasonMissingTitle: 'חסר תפקיד',
    importReasonInvalidEmail: 'אימייל לא תקין',
    importFailed: 'ייבוא קובץ האקסל נכשל',
```

- [ ] **Step 3: Verify it compiles**

Run: `npm run build -w web`
Expected: succeeds with no TypeScript errors (the `en.ts`/`he.ts` locale objects are typically typed against each other or against a shared key type — if `apps/web/lib/i18n/types.ts` defines a strict key union, this build step will catch any mismatched keys between the two files).

- [ ] **Step 4: Commit**

```bash
git add apps/web/lib/i18n/locales/en.ts apps/web/lib/i18n/locales/he.ts
git commit -m "Add i18n strings for signer profile Excel import"
```

---

### Task 9: Web — UI for download/upload in `UsersClient.tsx`

**Files:**
- Modify: `apps/web/app/users/UsersClient.tsx`

- [ ] **Step 1: Add state for the import result and a download-busy flag**

In the `UsersClient` function, after the existing `const [deduping, setDeduping] = useState(false);` line, add:

```ts
  const [downloadingTemplate, setDownloadingTemplate] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<ImportSignerProfilesResultDto | null>(null);
  const importFileRef = useRef<HTMLInputElement>(null);
```

Update the type import line at the top of the file:

```ts
import type { PdfTemplateDto, SignerProfileDto, ImportSignerProfilesResultDto } from '@docflow/shared';
```

- [ ] **Step 2: Add `downloadTemplate` and `importTemplate` functions**

Add these functions after `removeDuplicates` (after its closing `}`, before the `return (` that starts the JSX):

```ts
  async function downloadTemplate() {
    if (!selectedTemplateId) return;
    setDownloadingTemplate(true);
    setError(null);
    try {
      const blob = await api.getBlob('/signer-profiles/template.xlsx', {
        templateId: selectedTemplateId,
      });
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = objectUrl;
      anchor.download = 'signer-profiles-template.xlsx';
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : t('users.downloadTemplateFailed'),
      );
    } finally {
      setDownloadingTemplate(false);
    }
  }

  async function importTemplate(file: File) {
    if (!selectedTemplateId) return;
    setImporting(true);
    setError(null);
    setImportResult(null);
    try {
      const formData = new FormData();
      formData.append('file', file, file.name);
      const res = await api.postFormData('/signer-profiles/import', formData, {
        templateId: selectedTemplateId,
      });
      if (!res.ok) {
        let message = t('users.importFailed');
        try {
          const data = await res.json();
          if (data?.message) {
            message = Array.isArray(data.message)
              ? data.message.join(', ')
              : String(data.message);
          }
        } catch {
          // ignore
        }
        throw new Error(message);
      }
      const result = (await res.json()) as ImportSignerProfilesResultDto;
      setImportResult(result);
      setProfiles(result.profiles);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('users.importFailed'));
    } finally {
      setImporting(false);
    }
  }
```

- [ ] **Step 3: Add the buttons next to the template selector**

In the JSX, the template selector block currently ends like this:

```tsx
          <option value="">{t('users.selectTemplatePlaceholder')}</option>
          {templateOptions.map((template) => (
            <option key={template.id} value={template.id}>
              {template.name}
            </option>
          ))}
        </select>
      </div>
```

Replace that closing `</select>\n      </div>` with:

```tsx
          <option value="">{t('users.selectTemplatePlaceholder')}</option>
          {templateOptions.map((template) => (
            <option key={template.id} value={template.id}>
              {template.name}
            </option>
          ))}
        </select>
        {selectedTemplateId && (
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={downloadTemplate}
              disabled={downloadingTemplate}
              className="text-xs text-blue-700 hover:underline disabled:opacity-50"
            >
              {downloadingTemplate ? t('common.saving') : t('users.downloadTemplate')}
            </button>
            <button
              type="button"
              onClick={() => importFileRef.current?.click()}
              disabled={importing}
              className="text-xs text-blue-700 hover:underline disabled:opacity-50"
            >
              {importing ? t('common.saving') : t('users.uploadTemplate')}
            </button>
            <input
              ref={importFileRef}
              type="file"
              accept=".xlsx"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void importTemplate(file);
                e.target.value = '';
              }}
            />
          </div>
        )}
        {importResult && (
          <div className="mt-3 rounded border border-gray-200 bg-gray-50 p-3 text-xs text-gray-700">
            <p>
              {t('users.importSummary', {
                created: String(importResult.created),
                updated: String(importResult.updated),
              })}
            </p>
            {importResult.skipped.length > 0 && (
              <div className="mt-2">
                <p className="font-medium">{t('users.importSkippedHeading')}</p>
                <ul className="mt-1 list-inside list-disc">
                  {importResult.skipped.map((s) => (
                    <li key={s.row}>
                      {`Row ${s.row}: `}
                      {s.reason === 'missing-title'
                        ? t('users.importReasonMissingTitle')
                        : t('users.importReasonInvalidEmail')}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
```

- [ ] **Step 4: Verify it compiles**

Run: `npm run build -w @docflow/shared && npm run build -w web`
Expected: succeeds with no TypeScript errors.

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/users/UsersClient.tsx
git commit -m "Add Excel template download/upload UI to signer profiles page"
```

---

### Task 10: e2e test — download, fill, upload, verify

**Files:**
- Create: `tests/e2e/signer-profiles-excel-import.spec.ts`

- [ ] **Step 1: Write the test**

```ts
import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { gotoApp } from './helpers/navigation';

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
    const downloadButton = page.getByRole('button', { name: 'Download Excel template' });
    await expect(downloadButton).toBeVisible({ timeout: 15_000 });
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      downloadButton.click(),
    ]);
    const downloadPath = await download.path();
    expect(downloadPath).toBeTruthy();

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(downloadPath!);
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
```

- [ ] **Step 2: Run the test**

Run: `npm run dev` in one terminal (leave it running — this starts both the API with bypass auth and the web app per the root `dev` script), then in another terminal:

```bash
npx playwright test tests/e2e/signer-profiles-excel-import.spec.ts
```

Expected: 1 passed. If the API doesn't have `BYPASS_AUTH=true`/`BYPASS_TOKEN` configured in whatever `.env` `npm run dev:api` loads, the test will report "API not reachable" via `test.skip` only if `/health` itself is down — if `/health` is up but bypass auth isn't configured, the test will fail at the `gotoApp` step instead (every API call returns 401). In that case, set `BYPASS_AUTH=true` and `BYPASS_TOKEN=dev-bypass-token-local` in `apps/api`'s env before starting it, matching what `playwright.config.ts` already does for the web server.

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/signer-profiles-excel-import.spec.ts
git commit -m "Add e2e test for signer profile Excel import"
```

---

### Task 11: Final verification pass

- [ ] **Step 1: Full build**

Run: `npm run build:shared && npm run build:api && npm run build:web`
Expected: all three succeed.

- [ ] **Step 2: Shared unit tests**

Run: `npm run test -w @docflow/shared`
Expected: all tests pass, including the 7 new `classifySignerProfileImportRow` cases.

- [ ] **Step 3: Manual walkthrough**

With `npm run dev` running, open `/signer-profiles` in a browser:
1. Select the Haknasot template (default).
2. Click "Download Excel template" — confirm a `.xlsx` downloads with role titles in column A and blank Name/Email columns.
3. Fill in a couple of rows with names/emails in Excel (or any spreadsheet app), save, and upload it via "Upload filled Excel".
4. Confirm the summary banner shows the right created/updated counts and the directory table reflects the new names/emails.
5. Re-upload the same file unmodified — confirm it now reports `updated` (not `created`) for those rows, since titles already match existing profiles.
6. Switch to a custom PDF template (if one exists) and repeat — confirm the downloaded template's Title column matches that template's field labels.

- [ ] **Step 4: Run the broader e2e suite for regressions**

Run: `npx playwright test`
Expected: no new failures beyond any pre-existing flakiness already present on this branch.
