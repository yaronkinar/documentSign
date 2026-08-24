# Template Field Reference Values Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a template's form fields are AI-extracted from a filled example PDF, capture each field's exact source value (from the PDF's text layer) as a `referenceValue`, and surface it as copyable reference text on the document fill screen.

**Architecture:** Extend the existing vision-extraction pipeline (`AiService.extractTemplateFieldsFromPdf`) to read a per-field `value` from the model, then override it with the *exact* text found in the PDF's positioned text layer (`loadPdfTextLines`) wherever a field's box overlaps real text — vision decides *what/where*, the text layer supplies the *exact string*. That value flows through `PdfFormFieldTemplate.referenceValue` (shared type), gets persisted on `PdfTemplate.formFields` and copied onto `Document.formFields` at document-creation time, and is rendered in the fill panel as click-to-copy helper text.

**Tech Stack:** NestJS (Mongoose schemas), shared TS package (`@docflow/shared`), Next.js/React frontend, Jest (API), Vitest (shared package).

---

## File Structure

| File | Responsibility |
|---|---|
| `packages/shared/src/pdf-form.types.ts` | Add `referenceValue?: string \| null` to `PdfFormFieldTemplate` |
| `packages/shared/src/document-form-fields.ts` | `ExtractedPdfFormFieldInput.value` → `PdfFormFieldTemplate.referenceValue` mapping in `buildPdfFormFieldsFromExtracted` |
| `apps/api/src/ai/extracted-template-field.ts` | Add `value?: string` to `ExtractedTemplateField` |
| `apps/api/src/ai/pdf-field-anchors.ts` | New `resolveFieldReferenceValues()`: position-overlap match against `PdfTextLine[]` to fill/override `value` |
| `apps/api/src/ai/ai.service.ts` | Wire `resolveFieldReferenceValues` into `extractTemplateFieldsFromPdf`; pass `value` through `normalizeExtractedTemplateFields`; extend the `'saved_template'` extraction prompt for per-cell table fields + values |
| `apps/api/src/documents/document.schema.ts` | Add `referenceValue: string \| null` to `DocumentFormField` schema |
| `apps/api/src/templates/templates.service.ts` | Propagate `referenceValue` through `extractFormFields` (with refresh-on-re-extract), `readTemplatePdf`, `toDto` |
| `apps/api/src/documents/documents.service.ts` | Propagate `referenceValue` through `toFormFieldTemplates` |
| `apps/api/src/documents/documents.mapper.ts` | Propagate `referenceValue` through `toFormFieldsDto` |
| `apps/web/components/documents/DocumentFormFillPanel.tsx` | Show `referenceValue` as copyable helper text per field |
| `apps/web/app/templates/[id]/TemplateEditorClient.tsx` | Show `referenceValue` preview in the form-fields list |

---

### Task 1: Shared type + `buildPdfFormFieldsFromExtracted` value mapping

**Files:**
- Modify: `packages/shared/src/pdf-form.types.ts`
- Modify: `packages/shared/src/document-form-fields.ts:4-18, 41-59`
- Test: `packages/shared/src/document-form-fields.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `packages/shared/src/document-form-fields.test.ts` (add the import alongside the existing one on line 3-6):

```ts
import {
  buildPdfFormFieldsFromExtracted,
  isEditableDocumentFormField,
  resolveDocumentFormFields,
} from './document-form-fields.js';
```

Add a new `describe` block at the end of the file:

```ts
describe('buildPdfFormFieldsFromExtracted — reference values', () => {
  it('carries the extracted value through as referenceValue', () => {
    const fields = buildPdfFormFieldsFromExtracted([
      {
        label: 'מספר בקשה',
        pageNumber: 1,
        x: 10,
        y: 10,
        width: 20,
        height: 4,
        value: '2026-0847',
      },
    ]);

    expect(fields[0]!.referenceValue).toBe('2026-0847');
  });

  it('leaves referenceValue unset when no value was extracted', () => {
    const fields = buildPdfFormFieldsFromExtracted([
      { label: 'תאריך חתימה', pageNumber: 1, x: 10, y: 10, width: 20, height: 4 },
    ]);

    expect(fields[0]!.referenceValue).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run (from `packages/shared`): `npm test -- document-form-fields.test.ts`
Expected: FAIL — `Object literal may only specify known properties, and 'value' does not exist in type 'ExtractedPdfFormFieldInput'` (or `referenceValue` is `undefined`-vs-missing-property TS error), since `value`/`referenceValue` don't exist yet.

- [ ] **Step 3: Add `referenceValue` to the shared type**

In `packages/shared/src/pdf-form.types.ts`, change the interface to:

```ts
export type PdfFormFieldType = 'text' | 'textarea' | 'date' | 'checkbox';

/** Static template field mapped to a region on a PDF (% of page). */
export interface PdfFormFieldTemplate {
  id: string;
  label: string;
  type: PdfFormFieldType;
  section: string;
  pageNumber: number;
  x: number;
  y: number;
  width: number;
  height: number;
  /** Exact value found at this field's location in the source PDF, if any — shown as copyable reference text when filling a new document. */
  referenceValue?: string | null;
}
```

- [ ] **Step 4: Map `value` → `referenceValue` in `buildPdfFormFieldsFromExtracted`**

In `packages/shared/src/document-form-fields.ts`, update the input interface and the mapping function:

```ts
export interface ExtractedPdfFormFieldInput {
  label: string;
  pageNumber: number;
  x: number;
  y: number;
  width: number;
  height: number;
  value?: string;
}
```

```ts
/** Turn vision-extracted boxes into stable form field definitions for a document. */
export function buildPdfFormFieldsFromExtracted(
  extracted: ExtractedPdfFormFieldInput[],
): PdfFormFieldTemplate[] {
  const used = new Set<string>();
  return extracted.map((field) => {
    const id = slugifyFieldId(field.label, used);
    return {
      id,
      label: field.label,
      type: inferFieldType(field.label),
      section: `page_${field.pageNumber}`,
      pageNumber: field.pageNumber,
      x: field.x,
      y: field.y,
      width: field.width,
      height: field.height,
      referenceValue: field.value,
    };
  });
}
```

- [ ] **Step 5: Run test to verify it passes**

Run (from `packages/shared`): `npm test -- document-form-fields.test.ts`
Expected: PASS (all tests in the file, including the two new ones)

- [ ] **Step 6: Commit**

```bash
git add packages/shared/src/pdf-form.types.ts packages/shared/src/document-form-fields.ts packages/shared/src/document-form-fields.test.ts
git commit -m "Add referenceValue to PdfFormFieldTemplate and extraction mapping"
```

---

### Task 2: Position-based reference value resolution from the PDF text layer

**Files:**
- Modify: `apps/api/src/ai/extracted-template-field.ts`
- Modify: `apps/api/src/ai/pdf-field-anchors.ts`
- Test: `apps/api/src/ai/pdf-field-anchors.spec.ts` (new)

- [ ] **Step 1: Add `value` to `ExtractedTemplateField`**

Replace the full contents of `apps/api/src/ai/extracted-template-field.ts`:

```ts
export interface ExtractedTemplateField {
  label: string;
  pageNumber: number;
  x: number;
  y: number;
  width: number;
  height: number;
  /** Value read at this field's location — from vision, later overridden with exact PDF text where available. */
  value?: string;
}
```

- [ ] **Step 2: Write the failing test for `resolveFieldReferenceValues`**

Create `apps/api/src/ai/pdf-field-anchors.spec.ts`:

```ts
import { resolveFieldReferenceValues } from './pdf-field-anchors';
import type { PdfTextLine } from './pdf-field-anchors';
import type { ExtractedTemplateField } from './extracted-template-field';

describe('resolveFieldReferenceValues', () => {
  const lines: PdfTextLine[] = [
    { pageNumber: 1, str: '2026-0847', xPct: 20, yTopPct: 10, widthPct: 15 },
    { pageNumber: 1, str: 'מספר בקשה', xPct: 60, yTopPct: 10, widthPct: 15 },
    { pageNumber: 2, str: 'ignored other page', xPct: 20, yTopPct: 10, widthPct: 15 },
  ];

  it('overrides the field value with exact text overlapping its box', () => {
    const fields: ExtractedTemplateField[] = [
      {
        label: 'מספר בקשה',
        pageNumber: 1,
        x: 18,
        y: 8,
        width: 20,
        height: 4,
        value: 'guessed-by-vision',
      },
    ];

    const result = resolveFieldReferenceValues(fields, lines);

    expect(result[0]!.value).toBe('2026-0847');
  });

  it('falls back to the vision-provided value when no text line overlaps', () => {
    const fields: ExtractedTemplateField[] = [
      { label: 'חתימה', pageNumber: 1, x: 70, y: 80, width: 20, height: 4, value: 'from-vision' },
    ];

    const result = resolveFieldReferenceValues(fields, lines);

    expect(result[0]!.value).toBe('from-vision');
  });

  it('leaves value unset when nothing overlaps and vision gave nothing', () => {
    const fields: ExtractedTemplateField[] = [
      { label: 'חתימה', pageNumber: 1, x: 70, y: 80, width: 20, height: 4 },
    ];

    const result = resolveFieldReferenceValues(fields, lines);

    expect(result[0]!.value).toBeUndefined();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run (from `apps/api`): `npx jest src/ai/pdf-field-anchors.spec.ts`
Expected: FAIL — `resolveFieldReferenceValues` is not exported / does not exist.

- [ ] **Step 4: Implement `resolveFieldReferenceValues`**

Add to `apps/api/src/ai/pdf-field-anchors.ts`, after `anchorFieldsToPdfText` (after the closing brace that currently ends at line 133):

```ts
/**
 * Fills/overrides each field's `value` with the exact text of PDF lines whose
 * position overlaps the field's box. Vision decides what/where a field is;
 * this supplies the exact printed string, falling back to vision's own
 * reading when no text line overlaps.
 */
export function resolveFieldReferenceValues(
  fields: ExtractedTemplateField[],
  lines: PdfTextLine[],
): ExtractedTemplateField[] {
  return fields.map((field) => {
    const overlapping = lines
      .filter((line) => {
        if (line.pageNumber !== field.pageNumber) return false;
        const lineXEnd = line.xPct + line.widthPct;
        const fieldXEnd = field.x + field.width;
        const xOverlap = line.xPct < fieldXEnd && lineXEnd > field.x;
        const yOverlap =
          line.yTopPct >= field.y - 1 && line.yTopPct <= field.y + field.height + 1;
        return xOverlap && yOverlap;
      })
      .sort((a, b) => a.xPct - b.xPct);

    const text = overlapping
      .map((line) => line.str)
      .join(' ')
      .trim();

    if (!text) return field;
    return { ...field, value: text };
  });
}
```

- [ ] **Step 5: Run test to verify it passes**

Run (from `apps/api`): `npx jest src/ai/pdf-field-anchors.spec.ts`
Expected: PASS (3/3)

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/ai/extracted-template-field.ts apps/api/src/ai/pdf-field-anchors.ts apps/api/src/ai/pdf-field-anchors.spec.ts
git commit -m "Add resolveFieldReferenceValues for exact PDF text-layer field values"
```

---

### Task 3: Wire value extraction + resolution into `extractTemplateFieldsFromPdf`, extend the prompt

**Files:**
- Modify: `apps/api/src/ai/ai.service.ts:58-92, 139-163, 625-637`
- Test: `apps/api/src/ai/ai.service.spec.ts`

- [ ] **Step 1: Write the failing test**

`normalizeExtractedTemplateFields` is currently a module-private function in `ai.service.ts`. Step 3 below exports it so it can be tested directly, which is cleaner than exercising it indirectly through the full vision-API call path.

Add to the top of `apps/api/src/ai/ai.service.spec.ts`:

```ts
import { normalizeExtractedTemplateFields } from './ai.service';
```

(This import will fail to resolve until Step 3 exports the function — that's the expected failing state.)

Add the test:

```ts
describe('normalizeExtractedTemplateFields', () => {
  it('carries the value field through when present', () => {
    const fields = normalizeExtractedTemplateFields(
      [
        {
          label: 'מספר בקשה',
          pageNumber: 1,
          x: 10,
          y: 10,
          width: 20,
          height: 4,
          value: '2026-0847',
        },
      ],
      1,
    );

    expect(fields[0]!.value).toBe('2026-0847');
  });

  it('omits value when not present or not a string', () => {
    const fields = normalizeExtractedTemplateFields(
      [{ label: 'חתימה', pageNumber: 1, x: 10, y: 10, width: 20, height: 4, value: 42 }],
      1,
    );

    expect(fields[0]!.value).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run (from `apps/api`): `npx jest src/ai/ai.service.spec.ts`
Expected: FAIL — `normalizeExtractedTemplateFields` is not exported from `./ai.service`.

- [ ] **Step 3: Export the function and pass `value` through**

In `apps/api/src/ai/ai.service.ts`, change the function signature at line 58 from `function normalizeExtractedTemplateFields(` to `export function normalizeExtractedTemplateFields(`, and update its body (lines 58-92) to:

```ts
export function normalizeExtractedTemplateFields(
  rawFields: unknown,
  pageCount: number,
): ExtractedTemplateField[] {
  if (!Array.isArray(rawFields)) return [];

  return rawFields
    .map((field): ExtractedTemplateField | null => {
      if (!field || typeof field !== 'object') return null;
      const record = field as Record<string, unknown>;
      const label =
        typeof record.label === 'string' && record.label.trim()
          ? record.label.trim()
          : null;
      const pageNumber = Math.trunc(Number(record.pageNumber));
      const x = clampPercent(record.x, 0, 99);
      const y = clampPercent(record.y, 0, 99);
      const width = clampPercent(record.width, 1, 100);
      const height = clampPercent(record.height, 1, 100);
      const value =
        typeof record.value === 'string' && record.value.trim() ? record.value.trim() : undefined;

      if (!label || !Number.isInteger(pageNumber) || pageNumber < 1) return null;
      if (pageCount > 0 && pageNumber > pageCount) return null;
      if (x == null || y == null || width == null || height == null) return null;

      return normalizeExtractedFieldCoords({
        label,
        pageNumber,
        x: Number(x.toFixed(2)),
        y: Number(y.toFixed(2)),
        width: Number(width.toFixed(2)),
        height: Number(height.toFixed(2)),
        ...(value ? { value } : {}),
      });
    })
    .filter((field): field is ExtractedTemplateField => field !== null);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run (from `apps/api`): `npx jest src/ai/ai.service.spec.ts`
Expected: PASS

- [ ] **Step 5: Wire `resolveFieldReferenceValues` into `extractTemplateFieldsFromPdf`**

In `apps/api/src/ai/ai.service.ts`, update the import at line 18-25 to include the new function:

```ts
import {
  anchorFieldsToPdfText,
  deriveSignatureFieldsFromPdfLines,
  loadPdfTextLines,
  normalizeExtractedFieldCoords,
  remapExtractedPageNumbers,
  resolveFieldReferenceValues,
  type PdfTextLine,
} from './pdf-field-anchors';
```

Then update the block at (originally) lines 625-637:

```ts
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as { fields?: unknown };
        let fields = normalizeExtractedTemplateFields(parsed.fields, maxPage);
        fields = remapExtractedPageNumbers(fields, pagesToInspect);
        if (textLines.length > 0) {
          fields = anchorFieldsToPdfText(fields, textLines);
          fields = resolveFieldReferenceValues(fields, textLines);
        }
        if (fields.length > 0) return fields;
      } catch {
        // Vision JSON invalid — fall through to text-based detection
      }
    }
```

- [ ] **Step 6: Extend the `'saved_template'` extraction prompt for table cells and values**

In `apps/api/src/ai/ai.service.ts`, replace the `base` prompt fragment and the `'saved_template'` branch (currently lines 139-163) with:

```ts
function fieldExtractionSystemPrompt(context: PdfFieldExtractionContext): string {
  const base =
    'Return ONLY a JSON object with key "fields". Each field must have: ' +
    'label, pageNumber, x, y, width, height, and an optional "value". ' +
    'Coordinates are percentages 0–100 ' +
    '(not 0–1) from the top-left corner of that PDF page. Put the box over the blank ' +
    'line or dash area where the user signs, not over the printed label text. ' +
    'Typical signature box: width 15–40, height 4–8. Use the exact pageNumber given for each image. ' +
    'Keep labels in the document language. Remove duplicates.';

  if (context === 'uploaded_document') {
    return (
      'You detect fillable or signable fields in uploaded PDF page images. ' +
      base +
      ' Include ONLY fields you can see on these pages. Each label must be taken from text printed on the document (e.g. next to a blank line). ' +
      'Never invent fields or reuse role names from outside this document. Do not add municipal approval rows unless they appear on these pages.'
    );
  }

  return (
    'You detect fillable data-entry fields in PDF template page images. ' +
    base +
    ' Include ONLY fields visible on these pages. Each label must come from text printed on the document. ' +
    'Never invent fields or reuse names from outside this PDF. ' +
    'If a page contains a table with repeating rows/columns (e.g. an area breakdown, a checklist, a signature-block table), ' +
    'emit ONE field per individual data cell — never one field per row or per whole table. ' +
    'Skip pure header/label cells (column titles, row category names are not fields). ' +
    'Label each cell field by combining its row label and column header, e.g. "מרתף – שטח שירות (מ״ר)", so cells never collide. ' +
    'For every field, also set "value" to the literal text visible at that location, or omit "value" if the cell is blank.'
  );
}
```

- [ ] **Step 7: Run the full AI service test suite**

Run (from `apps/api`): `npx jest src/ai/ai.service.spec.ts`
Expected: PASS (all tests, including pre-existing ones)

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/ai/ai.service.ts apps/api/src/ai/ai.service.spec.ts
git commit -m "Extract per-cell table fields with exact reference values from filled PDFs"
```

---

### Task 4: Persist `referenceValue` on the template + propagate through template APIs

**Files:**
- Modify: `apps/api/src/documents/document.schema.ts:125-155`
- Modify: `apps/api/src/templates/templates.service.ts:95-120, 225-276, 400-435`
- Test: `apps/api/src/templates/templates.service.spec.ts`

- [ ] **Step 1: Write the failing test**

Update the `aiService.extractTemplateFieldsFromPdf` mock in `apps/api/src/templates/templates.service.spec.ts` (currently lines 31-33) to include a value:

```ts
    extractTemplateFieldsFromPdf: jest.fn().mockResolvedValue([
      { label: 'שם ספק', pageNumber: 1, x: 10, y: 10, width: 20, height: 6, value: 'חברת דוגמה' },
    ]),
```

Add a new test inside the existing `describe('TemplatesService.extractFormFields', ...)` block (after the test at line 157-172):

```ts
  it('carries the extracted value through as referenceValue', async () => {
    const template = buildTemplate();
    const { service } = buildService(template);

    const result = await service.extractFormFields(String(template._id), 'owner1');

    expect(result.fields[0]).toMatchObject({ label: 'שם ספק', referenceValue: 'חברת דוגמה' });
  });

  it('refreshes referenceValue on an existing field when re-extracted', async () => {
    const template = buildTemplate({
      formFields: [
        {
          id: 'existing',
          label: 'שם ספק',
          type: 'text',
          section: 'page_1',
          pageNumber: 1,
          x: 10,
          y: 10,
          width: 20,
          height: 6,
          referenceValue: 'old value',
        },
      ],
    });
    const { service } = buildService(template);

    const result = await service.extractFormFields(String(template._id), 'owner1');

    expect(result.fields).toHaveLength(1);
    expect(result.fields[0]).toMatchObject({ id: 'existing', referenceValue: 'חברת דוגמה' });
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run (from `apps/api`): `npx jest src/templates/templates.service.spec.ts`
Expected: FAIL — `referenceValue` is `undefined` on the result (not yet mapped through).

- [ ] **Step 3: Add `referenceValue` to the `DocumentFormField` schema**

In `apps/api/src/documents/document.schema.ts`, add a new `@Prop` inside the `DocumentFormField` class, after the `height` prop (the class spans lines 125-155; insert before the closing brace, alongside the other props):

```ts
  @Prop({ type: String, default: null })
  referenceValue!: string | null;
```

- [ ] **Step 4: Propagate `referenceValue` in `extractFormFields`**

In `apps/api/src/templates/templates.service.ts`, replace the body of `extractFormFields` (lines 225-276) with:

```ts
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
    const extractedByPlacementKey = new Map(
      extractedFields.map((f) => [`${f.pageNumber}:${f.label.trim().toLowerCase()}`, f]),
    );

    const existing = (template.formFields ?? []).map((f) => {
      const key = `${f.pageNumber}:${f.label.trim().toLowerCase()}`;
      const rematch = extractedByPlacementKey.get(key);
      return {
        id: f.id,
        label: f.label,
        type: f.type,
        section: f.section,
        pageNumber: f.pageNumber,
        x: f.x,
        y: f.y,
        width: f.width,
        height: f.height,
        referenceValue: rematch?.referenceValue ?? f.referenceValue ?? null,
      };
    });
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

- [ ] **Step 5: Propagate `referenceValue` in `readTemplatePdf` and `toDto`**

In `apps/api/src/templates/templates.service.ts`, update the `formFields` mapping in `readTemplatePdf` (lines 108-118):

```ts
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
        referenceValue: f.referenceValue,
      })),
```

And the `formFields` mapping in `toDto` (lines 421-431):

```ts
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
        referenceValue: f.referenceValue,
      })),
```

- [ ] **Step 6: Run test to verify it passes**

Run (from `apps/api`): `npx jest src/templates/templates.service.spec.ts`
Expected: PASS (all tests in the file)

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/documents/document.schema.ts apps/api/src/templates/templates.service.ts apps/api/src/templates/templates.service.spec.ts
git commit -m "Persist and propagate referenceValue through template APIs"
```

---

### Task 5: Propagate `referenceValue` into created documents

**Files:**
- Modify: `apps/api/src/documents/documents.service.ts:732-749`
- Modify: `apps/api/src/documents/documents.mapper.ts:4-19`
- Test: `apps/api/src/documents/documents.service.spec.ts`

- [ ] **Step 1: Find the existing document-creation-from-template test to extend**

Read `apps/api/src/documents/documents.service.spec.ts` and locate the test(s) covering `createFromPdfTemplate` (search for `createFromPdfTemplate` and `readTemplatePdf`). Confirm how `templatesService.readTemplatePdf` is mocked there — the mock's resolved `formFields` array is what Task 4's `readTemplatePdf` now returns with `referenceValue` included.

- [ ] **Step 2: Write the failing test**

Add a test (in the same `describe` block as the other `createFromPdfTemplate` tests) asserting the created document's `formFields` carry `referenceValue` through from the mocked `readTemplatePdf` result — mock `templatesService.readTemplatePdf` to resolve a `formFields` entry that includes `referenceValue: '2026-0847'`, call `documentsService.createFromPdfTemplate(...)`, and assert the returned DTO's `formFields[0].referenceValue` is `'2026-0847'`. Match the exact mocking/assertion style already used by the neighboring test in that file (same `documentModel`/`storageService` mock setup) rather than introducing a new pattern.

- [ ] **Step 3: Run test to verify it fails**

Run (from `apps/api`): `npx jest src/documents/documents.service.spec.ts`
Expected: FAIL — `referenceValue` is `undefined` in the returned DTO.

- [ ] **Step 4: Propagate `referenceValue` in `toFormFieldTemplates`**

In `apps/api/src/documents/documents.service.ts`, update `toFormFieldTemplates` (lines 732-749):

```ts
  private toFormFieldTemplates(
    doc: DocumentDocument,
  ): PdfFormFieldTemplate[] {
    return resolveDocumentFormFields({
      formTemplateId: doc.formTemplateId,
      formFields: doc.formFields?.map((f) => ({
        id: f.id,
        label: f.label,
        type: f.type,
        section: f.section,
        pageNumber: f.pageNumber,
        x: f.x,
        y: f.y,
        width: f.width,
        height: f.height,
        referenceValue: f.referenceValue,
      })),
    });
  }
```

- [ ] **Step 5: Propagate `referenceValue` in the document DTO mapper**

In `apps/api/src/documents/documents.mapper.ts`, update `toFormFieldsDto` (lines 4-19):

```ts
function toFormFieldsDto(
  fields: DocumentDocument['formFields'] | undefined,
): PdfFormFieldTemplate[] {
  if (!fields?.length) return [];
  return fields.map((f) => ({
    id: f.id,
    label: f.label,
    type: f.type,
    section: f.section,
    pageNumber: f.pageNumber,
    x: f.x,
    y: f.y,
    width: f.width,
    height: f.height,
    referenceValue: f.referenceValue,
  }));
}
```

- [ ] **Step 6: Run test to verify it passes**

Run (from `apps/api`): `npx jest src/documents/documents.service.spec.ts`
Expected: PASS (all tests in the file)

- [ ] **Step 7: Run the full API test suite to check for regressions**

Run (from `apps/api`): `npx jest`
Expected: PASS (all suites)

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/documents/documents.service.ts apps/api/src/documents/documents.mapper.ts apps/api/src/documents/documents.service.spec.ts
git commit -m "Propagate referenceValue from templates onto created documents"
```

---

### Task 6: Fill panel — copyable reference value UI

**Files:**
- Modify: `apps/web/components/documents/DocumentFormFillPanel.tsx`

- [ ] **Step 1: Add the copy-to-clipboard helper and icon import**

At the top of `apps/web/components/documents/DocumentFormFillPanel.tsx`, update the imports (currently lines 1-4):

```tsx
'use client';

import { useEffect, useMemo, useState } from 'react';
import { Copy } from 'lucide-react';
import type { PdfFormFieldTemplate } from '@docflow/shared';
```

Add a small helper component above `DocumentFormFillPanel` (after the `sectionLabel` function, before the `Props` interface):

```tsx
function ReferenceValueHint({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <button
      type="button"
      onClick={() => void handleCopy()}
      className="mt-0.5 flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600"
      title="העתק מהמסמך המקורי"
    >
      <Copy className="h-3 w-3" />
      <span className="truncate">{copied ? 'הועתק!' : value}</span>
    </button>
  );
}
```

- [ ] **Step 2: Render the hint under each text/textarea/date input**

In the field-rendering block (originally lines 102-123), add the hint after each input/textarea, still inside the `<label>`:

```tsx
              <label key={field.id} className="block">
                <span className="text-xs font-medium text-gray-700">{field.label}</span>
                {field.type === 'textarea' ? (
                  <textarea
                    className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
                    rows={3}
                    value={draft[field.id] ?? ''}
                    disabled={readOnly || saving}
                    onChange={(e) => updateField(field.id, e.target.value)}
                  />
                ) : (
                  <input
                    className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
                    type={field.type === 'date' ? 'date' : 'text'}
                    value={draft[field.id] ?? ''}
                    disabled={readOnly || saving}
                    onChange={(e) => updateField(field.id, e.target.value)}
                  />
                )}
                {field.referenceValue && <ReferenceValueHint value={field.referenceValue} />}
              </label>
```

- [ ] **Step 3: Verify manually in the browser**

Run the web app dev server (`npm run dev` in `apps/web`, or the project's existing dev script), open a document created from a template whose fields have `referenceValue` set (from Task 4/5's extraction), and confirm each field with a source value shows the greyed-out hint with a copy icon, and clicking it copies the value to the clipboard and briefly shows "הועתק!".

- [ ] **Step 4: Commit**

```bash
git add apps/web/components/documents/DocumentFormFillPanel.tsx
git commit -m "Show copyable reference values in the document fill panel"
```

---

### Task 7: Template editor — reference value preview

**Files:**
- Modify: `apps/web/app/templates/[id]/TemplateEditorClient.tsx:538-550`

- [ ] **Step 1: Show the extracted value next to each field in the list**

In `apps/web/app/templates/[id]/TemplateEditorClient.tsx`, update the field-list button (originally lines 538-550):

```tsx
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
                          {f.referenceValue && (
                            <span className="block truncate text-gray-400">
                              {f.referenceValue}
                            </span>
                          )}
                        </button>
```

- [ ] **Step 2: Verify manually in the browser**

Open a template's form-fields editor after running "AI extract form fields" on a filled example PDF, and confirm each extracted field shows its captured source value under the label/page-number line in the sidebar list.

- [ ] **Step 3: Commit**

```bash
git add apps/web/app/templates/\[id\]/TemplateEditorClient.tsx
git commit -m "Preview extracted reference values in the template editor field list"
```

---

## Self-Review Notes

- **Spec coverage:** data model (Task 1, 4), extraction pipeline prompt + anchoring (Task 2, 3), template API propagation (Task 4), document-creation propagation (Task 5), fill-panel copy UX (Task 6), template-editor preview (Task 7) — all four design sections have a corresponding task.
- **Type consistency:** `PdfFormFieldTemplate.referenceValue?: string | null` (shared) ↔ `DocumentFormField.referenceValue!: string | null` (Mongoose schema) ↔ `ExtractedTemplateField.value?: string` / `ExtractedPdfFormFieldInput.value?: string` (internal extraction-only, always plain `string | undefined`, converted to `referenceValue` once at the `buildPdfFormFieldsFromExtracted` boundary in Task 1) — verified consistent across every task that touches these names.
- **Out of scope, confirmed:** the signature-placement `fields`/`TemplateField` flow is untouched in every task above.
