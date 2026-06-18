# Signer Profiles Excel Import — Design

## Goal

On `/signer-profiles`, let a user download an Excel template scoped to the
currently selected template (Haknasot or a custom PDF template), fill in
Name/Email per role, and upload it back to bulk-create/update signer
profiles — instead of adding each row by hand.

## Architecture

Two new endpoints on the existing `SignerProfilesController`, scoped the
same way the rest of the page already is (`templateId` query param):

- `GET /signer-profiles/template.xlsx?templateId=...`
  Streams a generated `.xlsx` workbook. No new schema; reuses role data
  already derivable from `MUNICIPAL_APPROVAL_SIGNER_TITLES` (Haknasot) or
  the `PdfTemplate.fields` labels (custom templates).

- `POST /signer-profiles/import?templateId=...` (multipart, field `file`)
  Parses the uploaded `.xlsx` and upserts `SignerProfile` docs. Returns a
  summary plus the refreshed profile list for that template.

No schema changes. Both endpoints live in `SignerProfilesModule`; it gains
a `MongooseModule.forFeature` registration for `PdfTemplate` so
`SignerProfilesService` can resolve custom-template role labels without a
circular dependency on `TemplatesModule`.

## Role resolution (server-side)

Ported into `SignerProfilesService` (mirrors `signerRolesForTemplate` in
`apps/web/app/users/UsersClient.tsx`, kept separate since one runs in the
browser for the role dropdown and the other server-side for file
generation):

```
async resolveRoleTitles(ownerId: string, templateId: string): Promise<string[]>
```

- `templateId === HAKNASOT_FORM_TEMPLATE_ID` → `[...MUNICIPAL_APPROVAL_SIGNER_TITLES]`.
- Otherwise → load the `PdfTemplate` (`_id: templateId, ownerId`), return
  unique non-empty `fields[].label` values in order. Missing/foreign
  template → `[]` (download still succeeds with a headers-only sheet).

## Excel generation

- Library: `exceljs` (new dependency, `apps/api`). Handles both write and
  read; better-maintained than SheetJS-style alternatives for this case.
- Workbook: one sheet, header row `Title | Name | Email` (bold, fixed
  column widths), one data row per role title with Title pre-filled and
  Name/Email blank.
- Controller method mirrors the existing `convertToPdf` pattern in
  `documents.controller.ts`: `@Header('Content-Type', '...spreadsheetml...')`,
  `@Header('Content-Disposition', 'attachment; filename="signer-profiles-template.xlsx"')`,
  returns `new StreamableFile(buffer)`.

## Excel import / parsing

`SignerProfilesService.importFromWorkbook(ownerId, templateId, buffer)`:

1. Load workbook with `exceljs`; read the first worksheet; iterate rows
   from row 2 (row 1 is the header).
2. For each row, read `Title`/`Name`/`Email` via cell `.text` (normalizes
   rich text/formula cells), trimmed.
3. Row classification:
   - Title blank AND Name blank → **ignored**, not counted anywhere
     (trailing/empty sheet rows).
   - Title blank, Name present → **skipped**, reason `"missing title"`.
   - Email present but fails `class-validator`'s `isEmail` → **skipped**,
     reason `"invalid email"`.
   - Title present, Name blank, no email → **ignored**, not counted
     (expected — most pre-filled roles won't all be used). This is
     distinct from "skipped": it's not a problem, just nothing to do.
   - Otherwise → **upsert**: find first existing profile matching
     `(ownerId, templateId, title)`. If found, update its `name`/`email`
     (leave `signatureImageKey` untouched) → counts as `updated`. If not
     found, create a new profile (works for rows with custom titles too,
     not just known roles) → counts as `created`.
4. Return `{ created, updated, skipped: { row: number; reason: string }[], profiles: SignerProfileDto[] }`
   where `profiles` is the full refreshed `list(ownerId, templateId)`.

Empty/unreadable workbook → `BadRequestException('Empty or invalid Excel file')`.

### New shared type

`packages/shared`: `ImportSignerProfilesResultDto` —
```ts
{ created: number; updated: number; skipped: { row: number; reason: string }[]; profiles: SignerProfileDto[] }
```

## API controller additions

```ts
@Get('template.xlsx')
@Header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
@Header('Content-Disposition', 'attachment; filename="signer-profiles-template.xlsx"')
async downloadTemplate(@CurrentUser() user, @Query('templateId') templateId?: string): Promise<StreamableFile>

@Post('import')
@UseInterceptors(FileInterceptor('file', { limits: { fileSize: 5 * 1024 * 1024 } }))
async import(@CurrentUser() user, @Query('templateId') templateId, @UploadedFile() file): Promise<ImportSignerProfilesResultDto>
```

Both require `templateId`, validated the same way `list`/`dedupe` already
do (`BadRequestException` if missing).

## Web UI changes

`apps/web/lib/api-client.ts`: add a `getBlob(path, query)`-style method
(mirrors `postFormData`) for the authenticated binary download.

`apps/web/app/users/UsersClient.tsx`, next to the template selector when
a template is selected:

- **"Download Excel template"** button → `getBlob('/signer-profiles/template.xlsx', { templateId })`, save via existing blob-download pattern (`createObjectURL` + anchor click), filename `signer-profiles-template.xlsx`.
- **"Upload filled Excel"** button → hidden `<input type="file" accept=".xlsx">` → `postFormData('/signer-profiles/import', formData, { templateId })`.
- On import response: show a summary banner ("3 created, 2 updated") and, if `skipped.length > 0`, a small inline list `Row N: reason`. Replace `profiles` state with `result.profiles`.
- New i18n keys in `en.ts`/`he.ts`: button labels, summary/skip message strings, and the column headers baked into the generated file (kept in English for spreadsheet portability, not localized).

## Testing

- `signer-profiles.service.spec.ts`: role resolution (Haknasot vs. custom template vs. unknown template), and `importFromWorkbook` covering create / update-by-title / skip-missing-title / skip-invalid-email / ignore-blank-row / ignore-unfilled-role-row, plus duplicate-title (first-match update).
- Controller-level coverage only if the existing test harness already exercises multipart easily (check `documents.controller`-style FileInterceptor tests for a pattern); otherwise service-level tests are sufficient.

## Out of scope

- No changes to the `dedupe` flow — duplicates created by re-uploading
  with renamed titles are still cleaned up via the existing "remove
  duplicates" button.
- No support for `.csv` or other formats.
- No bulk signature-image import (signatures stay a per-profile upload).
