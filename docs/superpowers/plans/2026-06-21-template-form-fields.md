# Saved-Template Form Fields Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let saved PDF templates (`PdfTemplate`) define fillable data-entry fields (same shape as `Document.formFields`), editable in the template editor, copied onto any document created from that template.

**Architecture:** Add a `formFields` array to the `PdfTemplate` schema reusing the existing `DocumentFormField` Mongoose subdocument and `PdfFormFieldTemplate` shared type verbatim (no new types). Add CRUD + AI-extraction endpoints on `TemplatesController`/`TemplatesService` mirroring the existing `DocumentsService` form-field methods almost line-for-line. Copy `template.formFields` onto a new document in `createFromPdfTemplate`. Add a bespoke "form fields" panel + mode toggle to `TemplateEditorClient.tsx`, written in that file's existing plain-English/Tailwind style (it does not use the app's i18n system, unlike the document-side `DocumentFormFieldsEditor`).

**Tech Stack:** NestJS + Mongoose (API), Next.js + React (web), Jest (backend tests).

**Out of scope:** showing a form-fill step in the `'saved_pdf'` document-creation flow in `NewDocumentClient.tsx`, and any contract-attachment/AI-autofill behavior. Both belong to a later, separate plan (see `docs/superpowers/specs/2026-06-21-contract-attachment-summary-autofill-design.md`).

Reference spec: `docs/superpowers/specs/2026-06-21-template-form-fields-design.md`

---

### Task 1: Schema — add `formFields` to `PdfTemplate`

**Files:**
- Modify: `apps/api/src/templates/template.schema.ts`

- [ ] **Step 1: Import the existing `DocumentFormField` subdocument schema**

Edit `apps/api/src/templates/template.schema.ts`. Add the import and the new field on `PdfTemplate`:

```typescript
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { DocumentFormField, DocumentFormFieldSchema } from '../documents/document.schema';

@Schema({ _id: true, timestamps: false })
export class TemplateField {
  _id!: Types.ObjectId;

  @Prop({ required: true })
  label!: string;

  @Prop({ required: true })
  pageNumber!: number;

  @Prop({ required: true })
  x!: number;

  @Prop({ required: true })
  y!: number;

  @Prop({ required: true, default: 20 })
  width!: number;

  @Prop({ required: true, default: 6 })
  height!: number;
}

export const TemplateFieldSchema = SchemaFactory.createForClass(TemplateField);

@Schema({ collection: 'pdf_templates', timestamps: true })
export class PdfTemplate {
  @Prop({ required: true })
  name!: string;

  @Prop({ required: true, index: true })
  ownerId!: string;

  /** Internal storage key — never returned to clients. */
  @Prop({ type: String, default: null })
  fileKey!: string | null;

  @Prop({ type: Number, default: null })
  fileSize!: number | null;

  @Prop({ type: Number, default: null })
  pageCount!: number | null;

  @Prop({ required: true, default: false })
  isDefault!: boolean;

  @Prop({ type: [TemplateFieldSchema], default: [] })
  fields!: Types.DocumentArray<TemplateField>;

  /** Fillable data-entry regions (text/textarea/date) — independent of `fields` (signature placements). */
  @Prop({ type: [DocumentFormFieldSchema], default: [] })
  formFields!: Types.DocumentArray<DocumentFormField>;
}

export type PdfTemplateDocument = HydratedDocument<PdfTemplate>;
export const PdfTemplateSchema = SchemaFactory.createForClass(PdfTemplate);
```

- [ ] **Step 2: Verify the API builds**

Run: `cd apps/api && npx tsc --noEmit`
Expected: no errors (no circular-import error — `templates.service.ts` already imports from `../documents/document.schema`, so the templates module already depends on it).

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/templates/template.schema.ts
git commit -m "Add formFields array to PdfTemplate schema"
```

---

### Task 2: Shared types — `PdfTemplateDto.formFields`

**Files:**
- Modify: `packages/shared/src/index.ts`

- [ ] **Step 1: Add `formFields` to `PdfTemplateDto`**

In `packages/shared/src/index.ts`, find the `PdfTemplateDto` interface (around line 302) and add the field:

```typescript
export interface PdfTemplateDto {
  _id: string;
  name: string;
  fileUrl: string | null;
  fileSize: number | null;
  pageCount: number | null;
  isDefault: boolean;
  fields: TemplateFieldDto[];
  formFields: PdfFormFieldTemplate[];
  createdAt: string;
  updatedAt: string;
}
```

`PdfFormFieldTemplate` is already imported in this file (used by `DocumentDto.formFields` and `GuestSigningDataDto.formFields`) — no new import needed.

- [ ] **Step 2: Rebuild the shared package**

Run: `cd packages/shared && npm run build`
Expected: build succeeds, `dist/index.d.ts` now includes `formFields: PdfFormFieldTemplate[]` on `PdfTemplateDto`.

- [ ] **Step 3: Commit**

```bash
git add packages/shared/src/index.ts packages/shared/dist
git commit -m "Add formFields to PdfTemplateDto"
```

---

### Task 3: Backend DTOs for template form fields

**Files:**
- Modify: `apps/api/src/templates/templates.dto.ts`

- [ ] **Step 1: Add `CreateTemplateFormFieldDto` and `UpdateTemplateFormFieldDto`**

Append to `apps/api/src/templates/templates.dto.ts` (it already imports `IsIn`, `IsInt`? — check and add any missing decorators to the existing `import` block):

```typescript
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
```

(This replaces the existing import block at the top of the file — it adds `IsIn`, `IsInt`, `MaxLength` to the existing `IsArray, IsBoolean, IsNumber, IsOptional, IsString, Max, Min, ValidateNested`.)

Then append at the end of the file:

```typescript
export class CreateTemplateFormFieldDto {
  @IsString()
  @MaxLength(200)
  label!: string;

  @IsOptional()
  @IsIn(['text', 'textarea', 'date'])
  type?: 'text' | 'textarea' | 'date';

  @IsOptional()
  @IsString()
  @MaxLength(64)
  section?: string;

  @IsInt()
  @Min(1)
  pageNumber!: number;

  @IsNumber()
  @Min(0)
  @Max(100)
  x!: number;

  @IsNumber()
  @Min(0)
  @Max(100)
  y!: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  width?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  height?: number;
}

export class UpdateTemplateFormFieldDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  label?: string;

  @IsOptional()
  @IsIn(['text', 'textarea', 'date'])
  type?: 'text' | 'textarea' | 'date';

  @IsOptional()
  @IsString()
  @MaxLength(64)
  section?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  pageNumber?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  x?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  y?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  width?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  height?: number;
}
```

- [ ] **Step 2: Verify the API builds**

Run: `cd apps/api && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/templates/templates.dto.ts
git commit -m "Add CreateTemplateFormFieldDto and UpdateTemplateFormFieldDto"
```

---

### Task 4: `TemplatesService` — form field CRUD

**Files:**
- Modify: `apps/api/src/templates/templates.service.ts`
- Test: `apps/api/src/templates/templates.service.spec.ts` (new file)

- [ ] **Step 1: Write failing tests for `addFormField`/`updateFormField`/`deleteFormField`**

Create `apps/api/src/templates/templates.service.spec.ts`:

```typescript
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';

import { TemplatesService } from './templates.service';

function buildTemplate(overrides: Record<string, unknown> = {}) {
  return {
    _id: new Types.ObjectId(),
    ownerId: 'owner1',
    fileKey: 'templates/abc/file.pdf',
    pageCount: 2,
    formFields: [] as Array<Record<string, unknown>>,
    fields: [],
    save: jest.fn().mockResolvedValue(undefined),
    markModified: jest.fn(),
    ...overrides,
  };
}

function buildService(template: unknown) {
  const templateModel = {
    findById: jest.fn().mockResolvedValue(template),
  };
  const documentModel = {};
  const storageService = {
    downloadObject: jest.fn().mockResolvedValue(Buffer.from('pdf bytes')),
    tryGetDownloadUrl: jest.fn().mockResolvedValue(null),
  };
  const aiService = {
    extractTemplateFieldsFromPdf: jest.fn().mockResolvedValue([
      { label: 'שם ספק', pageNumber: 1, x: 10, y: 10, width: 20, height: 6 },
    ]),
  };

  const service = new TemplatesService(
    templateModel as never,
    documentModel as never,
    storageService as never,
    aiService as never,
  );

  return { service, templateModel, storageService, aiService };
}

describe('TemplatesService.addFormField', () => {
  it('throws when the caller does not own the template', async () => {
    const template = buildTemplate({ ownerId: 'someone-else' });
    const { service } = buildService(template);

    await expect(
      service.addFormField(String(template._id), 'owner1', {
        label: 'Field',
        pageNumber: 1,
        x: 10,
        y: 10,
      }),
    ).rejects.toThrow(ForbiddenException);
  });

  it('adds a field and persists it', async () => {
    const template = buildTemplate();
    const { service } = buildService(template);

    const result = await service.addFormField(String(template._id), 'owner1', {
      label: 'Field one',
      pageNumber: 1,
      x: 10,
      y: 20,
    });

    expect(result.formFields).toHaveLength(1);
    expect(result.formFields[0]).toMatchObject({
      label: 'Field one',
      type: 'text',
      pageNumber: 1,
      x: 10,
      y: 20,
    });
    expect(template.markModified).toHaveBeenCalledWith('formFields');
    expect(template.save).toHaveBeenCalled();
  });
});

describe('TemplatesService.updateFormField', () => {
  it('throws NotFoundException for an unknown field id', async () => {
    const template = buildTemplate();
    const { service } = buildService(template);

    await expect(
      service.updateFormField(String(template._id), 'owner1', 'missing', {
        label: 'New label',
      }),
    ).rejects.toThrow(NotFoundException);
  });

  it('patches an existing field', async () => {
    const template = buildTemplate({
      formFields: [
        { id: 'field_one', label: 'Field one', type: 'text', section: 'general', pageNumber: 1, x: 10, y: 20, width: 20, height: 6 },
      ],
    });
    const { service } = buildService(template);

    const result = await service.updateFormField(String(template._id), 'owner1', 'field_one', {
      label: 'Renamed',
      type: 'date',
    });

    expect(result.formFields[0]).toMatchObject({ id: 'field_one', label: 'Renamed', type: 'date' });
    expect(template.save).toHaveBeenCalled();
  });
});

describe('TemplatesService.deleteFormField', () => {
  it('removes the field', async () => {
    const template = buildTemplate({
      formFields: [
        { id: 'field_one', label: 'Field one', type: 'text', section: 'general', pageNumber: 1, x: 10, y: 20, width: 20, height: 6 },
      ],
    });
    const { service } = buildService(template);

    const result = await service.deleteFormField(String(template._id), 'owner1', 'field_one');

    expect(result.formFields).toHaveLength(0);
    expect(template.save).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd apps/api && npx jest templates.service.spec.ts`
Expected: FAIL — `addFormField`/`updateFormField`/`deleteFormField` are not defined on `TemplatesService`.

- [ ] **Step 3: Implement `addFormField`, `updateFormField`, `deleteFormField`**

Edit `apps/api/src/templates/templates.service.ts`. Add imports:

```typescript
import {
  allocateFormFieldId,
  buildPdfFormFieldsFromExtracted,
  type PdfFormFieldTemplate,
  type PdfTemplateDto,
} from '@docflow/shared';
```

(This replaces the existing `import type { PdfTemplateDto } from '@docflow/shared';` line.)

Add imports for the new DTOs:

```typescript
import {
  ConfirmTemplateUploadDto,
  CreateTemplateDto,
  CreateTemplateFormFieldDto,
  CreateTemplateFromDocumentDto,
  UpdateTemplateDto,
  UpdateTemplateFormFieldDto,
} from './templates.dto';
```

Add these methods to the `TemplatesService` class (near `updateTemplate`):

```typescript
async addFormField(
  id: string,
  clerkId: string,
  dto: CreateTemplateFormFieldDto,
): Promise<PdfTemplateDto> {
  const template = await this.requireOwner(id, clerkId);

  const existingIds = (template.formFields ?? []).map((f) => f.id);
  const fieldId = allocateFormFieldId(dto.label, existingIds);
  const field = {
    id: fieldId,
    label: dto.label.trim(),
    type: dto.type ?? 'text',
    section: dto.section?.trim() || `page_${dto.pageNumber}`,
    pageNumber: dto.pageNumber,
    x: dto.x,
    y: dto.y,
    width: dto.width ?? 20,
    height: dto.height ?? 6,
  };

  if (!template.formFields) template.formFields = [] as never;
  template.formFields.push(field as never);
  template.markModified('formFields');
  await template.save();
  return this.toDto(template);
}

async updateFormField(
  id: string,
  clerkId: string,
  fieldId: string,
  dto: UpdateTemplateFormFieldDto,
): Promise<PdfTemplateDto> {
  const template = await this.requireOwner(id, clerkId);

  const field = (template.formFields ?? []).find((f) => f.id === fieldId);
  if (!field) throw new NotFoundException('Form field not found');

  if (dto.label !== undefined) field.label = dto.label.trim();
  if (dto.type !== undefined) field.type = dto.type;
  if (dto.section !== undefined) field.section = dto.section.trim();
  if (dto.pageNumber !== undefined) field.pageNumber = dto.pageNumber;
  if (dto.x !== undefined) field.x = dto.x;
  if (dto.y !== undefined) field.y = dto.y;
  if (dto.width !== undefined) field.width = dto.width;
  if (dto.height !== undefined) field.height = dto.height;

  template.markModified('formFields');
  await template.save();
  return this.toDto(template);
}

async deleteFormField(
  id: string,
  clerkId: string,
  fieldId: string,
): Promise<PdfTemplateDto> {
  const template = await this.requireOwner(id, clerkId);

  template.formFields = (template.formFields ?? []).filter(
    (f) => f.id !== fieldId,
  ) as never;
  template.markModified('formFields');
  await template.save();
  return this.toDto(template);
}
```

Update the `toDto` mapper to include `formFields`:

```typescript
private async toDto(template: PdfTemplateDocument): Promise<PdfTemplateDto> {
  let fileUrl: string | null = null;
  if (template.fileKey) {
    fileUrl = await this.storageService.tryGetDownloadUrl(template.fileKey);
  }
  return {
    _id: template._id.toString(),
    name: template.name,
    fileUrl,
    fileSize: template.fileSize,
    pageCount: template.pageCount,
    isDefault: template.isDefault,
    fields: template.fields.map((f) => ({
      _id: f._id.toString(),
      label: f.label,
      pageNumber: f.pageNumber,
      x: f.x,
      y: f.y,
      width: f.width,
      height: f.height,
    })),
    formFields: (template.formFields ?? []).map((f) => ({
      id: f.id,
      label: f.label,
      type: f.type,
      section: f.section,
      pageNumber: f.pageNumber,
      x: f.x,
      y: f.y,
      width: f.width,
      height: f.height,
    })),
    createdAt: (template as any).createdAt?.toISOString() ?? new Date().toISOString(),
    updatedAt: (template as any).updatedAt?.toISOString() ?? new Date().toISOString(),
  };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd apps/api && npx jest templates.service.spec.ts`
Expected: PASS (5/5 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/templates/templates.service.ts apps/api/src/templates/templates.service.spec.ts
git commit -m "Add TemplatesService form field CRUD methods"
```

---

### Task 5: `TemplatesService.extractFormFields` (AI extraction)

**Files:**
- Modify: `apps/api/src/templates/templates.service.ts`
- Test: `apps/api/src/templates/templates.service.spec.ts`

- [ ] **Step 1: Write a failing test**

Append to `apps/api/src/templates/templates.service.spec.ts`:

```typescript
describe('TemplatesService.extractFormFields', () => {
  it('throws when the template has no uploaded PDF', async () => {
    const template = buildTemplate({ fileKey: null });
    const { service } = buildService(template);

    await expect(
      service.extractFormFields(String(template._id), 'owner1'),
    ).rejects.toThrow('Template PDF not found');
  });

  it('extracts fields from the PDF and merges them with existing ones', async () => {
    const template = buildTemplate();
    const { service, storageService, aiService } = buildService(template);

    const result = await service.extractFormFields(String(template._id), 'owner1');

    expect(storageService.downloadObject).toHaveBeenCalledWith('templates/abc/file.pdf');
    expect(aiService.extractTemplateFieldsFromPdf).toHaveBeenCalledWith(
      Buffer.from('pdf bytes'),
      2,
      [],
      'saved_template',
    );
    expect(result.fields).toHaveLength(1);
    expect(result.fields[0]).toMatchObject({ label: 'שם ספק', pageNumber: 1 });
    expect(template.save).toHaveBeenCalled();
  });

  it('does not duplicate a field already present at the same placement', async () => {
    const template = buildTemplate({
      formFields: [
        { id: 'existing', label: 'שם ספק', type: 'text', section: 'page_1', pageNumber: 1, x: 10, y: 10, width: 20, height: 6 },
      ],
    });
    const { service } = buildService(template);

    const result = await service.extractFormFields(String(template._id), 'owner1');

    expect(result.fields).toHaveLength(1);
    expect(result.fields[0].id).toBe('existing');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd apps/api && npx jest templates.service.spec.ts`
Expected: FAIL — `extractFormFields` is not defined.

- [ ] **Step 3: Implement `extractFormFields`**

Add this import to `apps/api/src/templates/templates.service.ts`:

```typescript
import { fieldLabelAppearsInPdfText } from '../ai/pdf-field-label';
```

Add the method to `TemplatesService`:

```typescript
async extractFormFields(
  id: string,
  clerkId: string,
): Promise<{ fields: PdfFormFieldTemplate[] }> {
  const template = await this.requireOwner(id, clerkId);
  if (!template.fileKey) {
    throw new NotFoundException('Template PDF not found');
  }

  const pdfBuffer = await this.storageService.downloadObject(template.fileKey);
  const pdfText = await this.aiService.extractPdfText(pdfBuffer);
  const extracted = await this.aiService.extractTemplateFieldsFromPdf(
    pdfBuffer,
    template.pageCount,
    [],
    'saved_template',
  );
  const filtered = extracted.filter((field) =>
    fieldLabelAppearsInPdfText(field.label, pdfText),
  );
  const extractedFields = buildPdfFormFieldsFromExtracted(filtered);

  const existing = (template.formFields ?? []).map((f) => ({
    id: f.id,
    label: f.label,
    type: f.type,
    section: f.section,
    pageNumber: f.pageNumber,
    x: f.x,
    y: f.y,
    width: f.width,
    height: f.height,
  }));
  const existingIds = new Set(existing.map((f) => f.id));
  const existingPlacementKeys = new Set(
    existing.map((f) => `${f.pageNumber}:${f.label.trim().toLowerCase()}`),
  );
  const merged = [
    ...existing,
    ...extractedFields.filter((f) => {
      if (existingIds.has(f.id)) return false;
      const key = `${f.pageNumber}:${f.label.trim().toLowerCase()}`;
      if (existingPlacementKeys.has(key)) return false;
      existingPlacementKeys.add(key);
      return true;
    }),
  ];
  template.formFields = merged as never;
  template.markModified('formFields');
  await template.save();
  return { fields: merged };
}
```

Note: the test mock for `extractPdfText` is not yet on the `aiService` test double in Task 4's `buildService` helper — add it now:

```typescript
const aiService = {
  extractPdfText: jest.fn().mockResolvedValue('שם ספק: חברת דוגמה'),
  extractTemplateFieldsFromPdf: jest.fn().mockResolvedValue([
    { label: 'שם ספק', pageNumber: 1, x: 10, y: 10, width: 20, height: 6 },
  ]),
};
```

(Update this in the shared `buildService` helper at the top of the spec file — both extraction tests rely on `extractPdfText` resolving text that contains the label "שם ספק" so `fieldLabelAppearsInPdfText` does not filter it out.)

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd apps/api && npx jest templates.service.spec.ts`
Expected: PASS (8/8 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/templates/templates.service.ts apps/api/src/templates/templates.service.spec.ts
git commit -m "Add AI-driven form field extraction for saved templates"
```

---

### Task 6: `readTemplatePdf` returns `formFields`; copy onto new document

**Files:**
- Modify: `apps/api/src/templates/templates.service.ts`
- Modify: `apps/api/src/documents/documents.service.ts`
- Test: `apps/api/src/documents/documents.service.spec.ts`

- [ ] **Step 1: Extend `readTemplatePdf`'s return type**

In `apps/api/src/templates/templates.service.ts`, modify `readTemplatePdf`:

```typescript
async readTemplatePdf(
  id: string,
  clerkId: string,
): Promise<{
  buffer: Buffer;
  fileSize: number;
  pageCount: number | null;
  name: string;
  formFields: PdfFormFieldTemplate[];
}> {
  const template = await this.requireOwner(id, clerkId);
  if (!template.fileKey) {
    throw new BadRequestException('Template PDF has not been uploaded yet');
  }
  const buffer = await this.storageService.downloadObject(template.fileKey);
  return {
    buffer,
    fileSize: template.fileSize ?? buffer.length,
    pageCount: template.pageCount ?? null,
    name: template.name,
    formFields: (template.formFields ?? []).map((f) => ({
      id: f.id,
      label: f.label,
      type: f.type,
      section: f.section,
      pageNumber: f.pageNumber,
      x: f.x,
      y: f.y,
      width: f.width,
      height: f.height,
    })),
  };
}
```

- [ ] **Step 2: Write a failing test for `createFromPdfTemplate` copying fields**

Find the existing test setup for `DocumentsService` in `apps/api/src/documents/documents.service.spec.ts` (it constructs `new DocumentsService(documentModel, ..., templatesService, ...)` — check the constructor argument order at `documents.service.ts:62-77`: `documentModel, signatureModel, commentModel, signerProfileModel, invitesService, storageService, auditService, aiService, workflowService, templatesService`). Append a new describe block:

```typescript
describe('DocumentsService.createFromPdfTemplate', () => {
  it('copies the template formFields onto the new document', async () => {
    const documentModel = jest.fn().mockImplementation((data: Record<string, unknown>) => ({
      ...data,
      save: jest.fn().mockResolvedValue(undefined),
    }));
    const storageService = {
      uploadBuffer: jest.fn().mockResolvedValue(undefined),
      getDownloadUrl: jest.fn().mockResolvedValue('https://example.com/doc.pdf'),
    };
    const auditService = { log: jest.fn() };
    const templatesService = {
      readTemplatePdf: jest.fn().mockResolvedValue({
        buffer: Buffer.from('pdf bytes'),
        fileSize: 100,
        pageCount: 2,
        name: 'My template',
        formFields: [
          { id: 'supplier_name', label: 'שם ספק', type: 'text', section: 'general', pageNumber: 1, x: 10, y: 10, width: 20, height: 6 },
        ],
      }),
    };

    const service = new DocumentsService(
      documentModel as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      storageService as never,
      auditService as never,
      {} as never,
      {} as never,
      templatesService as never,
    );

    const result = await service.createFromPdfTemplate('owner1', 'owner1@example.com', {
      title: 'New doc',
      pdfTemplateId: 'template-1',
    } as never);

    expect(result.formFields).toEqual([
      { id: 'supplier_name', label: 'שם ספק', type: 'text', section: 'general', pageNumber: 1, x: 10, y: 10, width: 20, height: 6 },
    ]);
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `cd apps/api && npx jest documents.service.spec.ts -t "createFromPdfTemplate"`
Expected: FAIL — `result.formFields` is `undefined` (or `[]`), not the copied array.

- [ ] **Step 4: Copy `formFields` in `createFromPdfTemplate`**

In `apps/api/src/documents/documents.service.ts`, modify `createFromPdfTemplate` (around line 119):

```typescript
async createFromPdfTemplate(
  clerkId: string,
  actorEmail: string,
  dto: CreateDocumentDto,
): Promise<DocumentDto> {
  const pdfTemplateId = dto.pdfTemplateId!.trim();
  const { buffer, fileSize, pageCount, name, formFields } =
    await this.templatesService.readTemplatePdf(pdfTemplateId, clerkId);

  const documentId = new Types.ObjectId();
  const fileKey = `docs/${documentId.toString()}/${uuidv4()}.pdf`;
  await this.storageService.uploadBuffer(fileKey, buffer, 'application/pdf');

  const doc = new this.documentModel({
    _id: documentId,
    title: (dto.title?.trim() || name).slice(0, 200),
    description: dto.description ?? null,
    fileKey,
    fileSize,
    pageCount: pageCount ?? 1,
    pdfTemplateId,
    formFields,
    ownerId: clerkId,
    status: 'draft',
    currentStep: 0,
    workflowSteps: [],
    participantEmails: [actorEmail.toLowerCase()],
    participantClerkIds: [clerkId],
  });
  await doc.save();

  this.auditService.log({
    documentId: doc._id,
    actorId: clerkId,
    actorEmail,
    eventType: AuditEventType.DocumentCreated,
    metadata: { title: doc.title, pdfTemplateId },
  });

  const fileUrl = await this.storageService.getDownloadUrl(fileKey);
  return toDocumentDto(doc, { fileUrl });
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd apps/api && npx jest documents.service.spec.ts -t "createFromPdfTemplate"`
Expected: PASS

- [ ] **Step 6: Run the full documents + templates test suites**

Run: `cd apps/api && npx jest documents.service.spec.ts templates.service.spec.ts`
Expected: all PASS

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/templates/templates.service.ts apps/api/src/documents/documents.service.ts apps/api/src/documents/documents.service.spec.ts
git commit -m "Copy template formFields onto documents created from a saved template"
```

---

### Task 7: Controller endpoints

**Files:**
- Modify: `apps/api/src/templates/templates.controller.ts`

- [ ] **Step 1: Add the new routes**

Edit `apps/api/src/templates/templates.controller.ts`:

```typescript
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';

import { ClerkAuthGuard } from '../auth/clerk.guard';
import { CurrentUser, CurrentUserPayload } from '../auth/current-user.decorator';
import { TemplatesService } from './templates.service';
import {
  ConfirmTemplateUploadDto,
  CreateTemplateDto,
  CreateTemplateFormFieldDto,
  UpdateTemplateDto,
  UpdateTemplateFormFieldDto,
} from './templates.dto';

@Controller('templates')
@UseGuards(ClerkAuthGuard)
export class TemplatesController {
  constructor(private readonly templatesService: TemplatesService) {}

  @Post()
  create(@CurrentUser() user: CurrentUserPayload, @Body() dto: CreateTemplateDto) {
    return this.templatesService.createUpload(user.clerkId, dto);
  }

  @Post(':id/confirm')
  confirm(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') id: string,
    @Body() dto: ConfirmTemplateUploadDto,
  ) {
    return this.templatesService.confirmUpload(id, user.clerkId, dto);
  }

  @Post(':id/extract-fields')
  extractFields(@CurrentUser() user: CurrentUserPayload, @Param('id') id: string) {
    return this.templatesService.extractFields(id, user.clerkId);
  }

  @Post(':id/extract-form-fields')
  extractFormFields(@CurrentUser() user: CurrentUserPayload, @Param('id') id: string) {
    return this.templatesService.extractFormFields(id, user.clerkId);
  }

  @Post(':id/form-fields')
  addFormField(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') id: string,
    @Body() dto: CreateTemplateFormFieldDto,
  ) {
    return this.templatesService.addFormField(id, user.clerkId, dto);
  }

  @Patch(':id/form-fields/:fieldId')
  updateFormField(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') id: string,
    @Param('fieldId') fieldId: string,
    @Body() dto: UpdateTemplateFormFieldDto,
  ) {
    return this.templatesService.updateFormField(id, user.clerkId, fieldId, dto);
  }

  @Delete(':id/form-fields/:fieldId')
  deleteFormField(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') id: string,
    @Param('fieldId') fieldId: string,
  ) {
    return this.templatesService.deleteFormField(id, user.clerkId, fieldId);
  }

  @Get()
  list(@CurrentUser() user: CurrentUserPayload) {
    return this.templatesService.listTemplates(user.clerkId);
  }

  @Get(':id')
  get(@CurrentUser() user: CurrentUserPayload, @Param('id') id: string) {
    return this.templatesService.getTemplate(id, user.clerkId);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') id: string,
    @Body() dto: UpdateTemplateDto,
  ) {
    return this.templatesService.updateTemplate(id, user.clerkId, dto);
  }

  @Delete(':id')
  async remove(@CurrentUser() user: CurrentUserPayload, @Param('id') id: string) {
    await this.templatesService.deleteTemplate(id, user.clerkId);
    return { ok: true };
  }
}
```

- [ ] **Step 2: Verify the API builds and existing tests still pass**

Run: `cd apps/api && npx tsc --noEmit && npx jest`
Expected: build succeeds, all tests pass.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/templates/templates.controller.ts
git commit -m "Add template form field endpoints"
```

---

### Task 8: Frontend — form fields panel in `TemplateEditorClient.tsx`

**Files:**
- Modify: `apps/web/app/templates/[id]/TemplateEditorClient.tsx`

This file does not use the app's i18n system (`useTranslation`) — it's plain hardcoded English strings with Tailwind classes, unlike the document-side `DocumentFormFieldsEditor`. The new panel follows this file's existing style rather than importing `DocumentFormFieldsEditor`, to keep the page visually consistent.

- [ ] **Step 1: Add state for the form-fields mode and local field list**

In `apps/web/app/templates/[id]/TemplateEditorClient.tsx`, add a type import and new state, near the existing `fields`/`addMode` state:

```typescript
import type { PdfFormFieldTemplate, PdfFormFieldType } from '@docflow/shared';
```

```typescript
type EditorMode = 'signatures' | 'form-fields';

const [mode, setMode] = useState<EditorMode>('signatures');
const [formFields, setFormFields] = useState<PdfFormFieldTemplate[]>(template.formFields ?? []);
const [activeFormFieldId, setActiveFormFieldId] = useState<string | null>(null);
const [formFieldPlacementMode, setFormFieldPlacementMode] = useState(false);
const [formFieldBusy, setFormFieldBusy] = useState(false);
const [formFieldError, setFormFieldError] = useState<string | null>(null);
```

- [ ] **Step 2: Add handlers for placing, moving, resizing, updating, deleting, and extracting form fields**

Add these functions inside `TemplateEditorClient`, near `handleExtractFields`:

```typescript
async function onFormFieldPlace(page: number, x: number, y: number) {
  if (!formFieldPlacementMode) return;
  setFormFieldError(null);
  try {
    const res = await api.post<{ formFields: PdfFormFieldTemplate[] }>(
      `/templates/${template._id}/form-fields`,
      {
        label: `Field ${formFields.length + 1}`,
        pageNumber: page,
        x: Number(x.toFixed(2)),
        y: Number(y.toFixed(2)),
      },
    );
    setFormFields(res.formFields);
    setActiveFormFieldId(res.formFields.at(-1)?.id ?? null);
    setFormFieldPlacementMode(false);
  } catch (err) {
    setFormFieldError(err instanceof Error ? err.message : 'Failed to add field');
  }
}

async function onFormFieldMove(fieldId: string, page: number, x: number, y: number) {
  setFormFieldError(null);
  try {
    const res = await api.patch<{ formFields: PdfFormFieldTemplate[] }>(
      `/templates/${template._id}/form-fields/${fieldId}`,
      { pageNumber: page, x: Number(x.toFixed(2)), y: Number(y.toFixed(2)) },
    );
    setFormFields(res.formFields);
  } catch (err) {
    setFormFieldError(err instanceof Error ? err.message : 'Failed to move field');
  }
}

async function onFormFieldResize(fieldId: string, width: number, height: number) {
  setFormFieldError(null);
  try {
    const res = await api.patch<{ formFields: PdfFormFieldTemplate[] }>(
      `/templates/${template._id}/form-fields/${fieldId}`,
      { width: Number(width.toFixed(2)), height: Number(height.toFixed(2)) },
    );
    setFormFields(res.formFields);
  } catch (err) {
    setFormFieldError(err instanceof Error ? err.message : 'Failed to resize field');
  }
}

async function updateFormFieldLabel(fieldId: string, label: string) {
  setFormFieldBusy(true);
  setFormFieldError(null);
  try {
    const res = await api.patch<{ formFields: PdfFormFieldTemplate[] }>(
      `/templates/${template._id}/form-fields/${fieldId}`,
      { label },
    );
    setFormFields(res.formFields);
  } catch (err) {
    setFormFieldError(err instanceof Error ? err.message : 'Failed to update field');
  } finally {
    setFormFieldBusy(false);
  }
}

async function updateFormFieldType(fieldId: string, type: PdfFormFieldType) {
  setFormFieldBusy(true);
  setFormFieldError(null);
  try {
    const res = await api.patch<{ formFields: PdfFormFieldTemplate[] }>(
      `/templates/${template._id}/form-fields/${fieldId}`,
      { type },
    );
    setFormFields(res.formFields);
  } catch (err) {
    setFormFieldError(err instanceof Error ? err.message : 'Failed to update field');
  } finally {
    setFormFieldBusy(false);
  }
}

async function deleteFormField(fieldId: string) {
  setFormFieldBusy(true);
  setFormFieldError(null);
  try {
    const res = await api.delete<{ formFields: PdfFormFieldTemplate[] }>(
      `/templates/${template._id}/form-fields/${fieldId}`,
    );
    setFormFields(res.formFields);
    setActiveFormFieldId(null);
  } catch (err) {
    setFormFieldError(err instanceof Error ? err.message : 'Failed to delete field');
  } finally {
    setFormFieldBusy(false);
  }
}

async function handleExtractFormFields() {
  setFormFieldBusy(true);
  setFormFieldError(null);
  try {
    const res = await api.post<{ fields: PdfFormFieldTemplate[] }>(
      `/templates/${template._id}/extract-form-fields`,
    );
    setFormFields(res.fields);
  } catch (err) {
    setFormFieldError(err instanceof Error ? err.message : 'Failed to extract form fields');
  } finally {
    setFormFieldBusy(false);
  }
}
```

Note: `/templates/:id/form-fields` (POST) and `/templates/:id/form-fields/:fieldId` (PATCH/DELETE) return the full `PdfTemplateDto` per Task 4's implementation, not a bare `{ formFields }`. Adjust the response type and unwrap to `res.formFields` directly — `res` IS the `PdfTemplateDto`, so `const res = await api.post<PdfTemplateDto>(...)` then `setFormFields(res.formFields)` is correct as written above (the inline type annotations `{ formFields: PdfFormFieldTemplate[] }` in the snippets above are structurally compatible with `PdfTemplateDto` since only the `formFields` property is read).

- [ ] **Step 3: Add the mode toggle and conditionally pass form-field props to `PDFViewer`**

Modify the `PDFViewer` render block:

```typescript
{template.fileUrl ? (
  <PDFViewer
    pdfUrl={template.fileUrl}
    templateEditMode={mode === 'signatures'}
    templateEditFields={mode === 'signatures' ? fields : undefined}
    selectedTemplateFieldId={mode === 'signatures' ? selectedId : null}
    onTemplateFieldSelect={mode === 'signatures' ? setSelectedId : undefined}
    onTemplateFieldAdd={mode === 'signatures' && addMode ? handleFieldAdd : undefined}
    onTemplateFieldMove={mode === 'signatures' ? handleFieldMove : undefined}
    onTemplateFieldResize={mode === 'signatures' ? handleFieldResize : undefined}
    formFields={mode === 'form-fields' ? formFields : undefined}
    formFieldPlacementMode={mode === 'form-fields' && formFieldPlacementMode}
    formFieldEditMode={mode === 'form-fields' && !formFieldPlacementMode}
    editableFormFieldIds={mode === 'form-fields' ? formFields.map((f) => f.id) : undefined}
    onFormFieldPlace={mode === 'form-fields' ? onFormFieldPlace : undefined}
    onFormFieldMove={mode === 'form-fields' ? onFormFieldMove : undefined}
    onFormFieldResize={mode === 'form-fields' ? onFormFieldResize : undefined}
    onFormFieldSelect={mode === 'form-fields' ? setActiveFormFieldId : undefined}
  />
) : (
  <div className="flex items-center justify-center py-32 text-sm text-gray-400">
    No PDF uploaded for this template.
  </div>
)}
```

Add the toggle above the `PDFViewer`, inside the same `addMode` banner area:

```tsx
<div className="mb-3 flex gap-2">
  <button
    onClick={() => setMode('signatures')}
    className={`rounded-md border px-3 py-1.5 text-sm font-medium ${
      mode === 'signatures'
        ? 'border-black bg-black text-white'
        : 'border-gray-300 text-gray-700 hover:bg-gray-50'
    }`}
  >
    Signature fields
  </button>
  <button
    onClick={() => setMode('form-fields')}
    className={`rounded-md border px-3 py-1.5 text-sm font-medium ${
      mode === 'form-fields'
        ? 'border-black bg-black text-white'
        : 'border-gray-300 text-gray-700 hover:bg-gray-50'
    }`}
  >
    Form fields
  </button>
</div>
```

- [ ] **Step 4: Add the form-fields side panel**

In the right panel, wrap the existing signature-field controls (the "+ Add field" button through the fields list) in `{mode === 'signatures' && ( ... )}`, and add a sibling block for `mode === 'form-fields'`:

```tsx
{mode === 'form-fields' && (
  <>
    <button
      onClick={() => setFormFieldPlacementMode((v) => !v)}
      disabled={formFieldBusy}
      className={`w-full rounded-md border px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50 ${
        formFieldPlacementMode
          ? 'border-indigo-300 bg-indigo-50 text-indigo-700'
          : 'border-gray-300 hover:bg-gray-50'
      }`}
    >
      {formFieldPlacementMode ? 'Click on PDF to place…' : '+ Add form field'}
    </button>

    <button
      onClick={handleExtractFormFields}
      disabled={formFieldBusy}
      className="w-full rounded-md border border-purple-200 bg-purple-50 px-4 py-2 text-sm font-medium text-purple-700 transition-colors hover:bg-purple-100 disabled:opacity-50"
    >
      {formFieldBusy ? 'AI is extracting…' : 'AI extract form fields'}
    </button>
    {formFieldError && <p className="text-xs text-red-600">{formFieldError}</p>}

    <div className="flex-1">
      <p className="mb-2 text-xs font-medium text-gray-700">
        Form fields ({formFields.length})
      </p>
      {formFields.length === 0 ? (
        <p className="text-xs text-gray-400">
          No form fields yet. Click &ldquo;+ Add form field&rdquo; then click on the PDF.
        </p>
      ) : (
        <div className="space-y-1">
          {formFields.map((f) => (
            <div key={f.id}>
              <button
                onClick={() => setActiveFormFieldId(f.id === activeFormFieldId ? null : f.id)}
                className={`w-full rounded border px-3 py-2 text-left text-xs transition-colors ${
                  f.id === activeFormFieldId
                    ? 'border-blue-300 bg-blue-50 text-blue-700'
                    : 'border-gray-200 hover:bg-gray-50'
                }`}
              >
                <span className="font-medium">{f.label || 'Untitled'}</span>
                <span className="ml-2 text-gray-400">p.{f.pageNumber}</span>
              </button>
              {f.id === activeFormFieldId && (
                <div className="mt-1 space-y-2 rounded-md border border-blue-200 bg-blue-50 p-3">
                  <input
                    type="text"
                    defaultValue={f.label}
                    disabled={formFieldBusy}
                    onBlur={(e) => {
                      const next = e.target.value.trim();
                      if (next && next !== f.label) void updateFormFieldLabel(f.id, next);
                    }}
                    className="w-full rounded border border-gray-300 px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
                  />
                  <select
                    value={f.type}
                    disabled={formFieldBusy}
                    onChange={(e) => void updateFormFieldType(f.id, e.target.value as PdfFormFieldType)}
                    className="w-full rounded border border-gray-300 px-2 py-1 text-sm"
                  >
                    <option value="text">Text</option>
                    <option value="textarea">Long text</option>
                    <option value="date">Date</option>
                  </select>
                  <button
                    onClick={() => void deleteFormField(f.id)}
                    disabled={formFieldBusy}
                    className="w-full rounded border border-red-200 px-3 py-1 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
                  >
                    Remove field
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  </>
)}
```

- [ ] **Step 5: Manual verification**

Run: `npm run dev` (from repo root, or whichever workspace script starts both apps)

In the browser:
1. Open an existing saved template at `/templates/:id`.
2. Click "Form fields" toggle — the signature-field controls disappear, the new panel shows.
3. Click "+ Add form field", click on the PDF — a field appears in the list and on the PDF.
4. Click the field, change its label and type, confirm it persists (`GET /templates/:id` via network tab shows `formFields` updated).
5. Click "AI extract form fields" — confirm fields populate (or an error message displays gracefully if `OPENAI_API_KEY`/Anthropic key is not configured locally).
6. Toggle back to "Signature fields" — confirm the existing signature-placement editor still works unchanged.

- [ ] **Step 6: Commit**

```bash
git add apps/web/app/templates/[id]/TemplateEditorClient.tsx
git commit -m "Add form fields editor panel to TemplateEditorClient"
```

---

### Task 9: End-to-end manual verification of document creation

**Files:** none (verification only)

- [ ] **Step 1: Create a document from a template with form fields**

In the browser:
1. On a saved template with at least one form field (from Task 8's verification), go to `/documents/new`, pick "use a saved template" with that template, create the document.
2. Check the network tab response for `POST /documents` (or `GET /documents/:id` right after) — confirm `formFields` on the new document matches the template's `formFields`.

This confirms Task 6's copy-on-create works end-to-end. There is intentionally no form-fill UI step to see yet for `'saved_pdf'` documents — that wiring is out of scope for this plan (see header).

- [ ] **Step 2: Report result**

No commit needed — this is a verification-only task confirming Tasks 1-7 work together.

---

## Self-Review Notes

- **Spec coverage:** Data model (Task 1-2), backend API (Tasks 3-5, 7), document creation integration (Task 6), frontend editor (Task 8) all covered. Testing section of the spec covered by Tasks 4-6 (unit/integration) and Task 8-9 (manual).
- **Explicitly out of scope, confirmed not silently included:** the `'saved_pdf'` form-fill step in `NewDocumentClient.tsx`'s `progressOrder`, and all contract-attachment/autofill behavior — both deferred to the separate spec/plan already referenced in the header.
- **Type consistency check:** `formFields` is `PdfFormFieldTemplate[]` everywhere (schema via `DocumentFormFieldSchema`, shared `PdfTemplateDto`, DTOs use the same field names as `documents.dto.ts`'s `CreateDocumentFormFieldDto`/`UpdateDocumentFormFieldDto`). Method names (`addFormField`/`updateFormField`/`deleteFormField`/`extractFormFields`) match between `TemplatesService` (Tasks 4-5) and `TemplatesController` (Task 7).
