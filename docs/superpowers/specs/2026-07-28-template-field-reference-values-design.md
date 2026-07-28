# Template field reference values (copy-from-source-PDF)

## Problem

Templates today are created by AI-extracting `formFields` (data-entry regions) from an
uploaded PDF via `extractTemplateFieldsFromPdf`. For densely-filled reference documents —
e.g. a building-permit application with dozens of table cells across multiple pages — two
things fall short:

1. Extraction targets simple key→value fields and signature/date lines; it doesn't reliably
   walk table rows/columns to emit one field per cell.
2. The values already printed in the source PDF (e.g. `2026-0847`, `172 מ״ר`) are discarded.
   When a user later fills a new document from this template, they have to retype everything
   by eye from the original PDF instead of copying it.

## Goal

When creating a template from a filled example PDF:
- Extract every data field, including one field per individual table cell.
- Capture the value found at each field's location in the source PDF, and carry it through
  to the document-fill screen as copyable reference text (not as a pre-filled value).

Out of scope: the signature-placement (`fields`) flow is untouched — reference values only
apply to `formFields` (data-entry fields), since signatures don't have a "value" to copy.

## Design

### 1. Data model

Add an optional `referenceValue` to the field shapes that carry data:

- `packages/shared/src/pdf-form.types.ts` — `PdfFormFieldTemplate.referenceValue?: string`
- `apps/api/src/documents/document.schema.ts` — `DocumentFormField` gets
  `referenceValue!: string | null` (default `null`). This schema is shared by both
  `PdfTemplate.formFields` and `Document.formFields`, so both get it.
- `apps/api/src/ai/extracted-template-field.ts` — `ExtractedTemplateField.value?: string`,
  the raw value as read during extraction, before text-layer anchoring.

No new collections; existing documents are unaffected (new field defaults to `null`).

### 2. Extraction pipeline (backend)

Reuses the existing AI-vision extraction call
(`AiService.extractTemplateFieldsFromPdf` → `anthropicVisionExtract` / OpenAI vision) with
two changes:

**a) Prompt update** (`fieldExtractionSystemPrompt`, `'saved_template'` context used by
`extractFormFields`): instruct the model to —
- For any table with repeating rows/columns (area breakdowns, appendix checklists,
  signature-block tables), emit **one field per individual data cell**, never one field per
  row or per whole table. Skip pure header/label cells (column titles, row category names).
- Label each cell field uniquely by combining row label + column header, e.g.
  `"מרתף – שטח שירות (מ״ר)"`, so cells never collide.
- For every field, also return the literal value visible at that location (`value`), omitted
  if the cell is blank.

**b) Anchoring step upgrade** (`apps/api/src/ai/pdf-field-anchors.ts` →
`anchorFieldsToPdfText`): today this re-anchors a field's *position* to the nearest matching
text line from `loadPdfTextLines` (pdfjs positioned text, exact per-character). Extend it to
also capture that matched line's text as `referenceValue` — this is the real PDF text layer,
not a vision "read," so it's exact. If no confident text-line match exists (checkbox, blank
field), fall back to the vision-reported `value`, or leave `referenceValue` unset.

Vision remains responsible for *deciding what's a field and roughly where*; the text layer
supplies the *exact value and precise position*, matching the existing division of labor in
this pipeline.

**c) Wiring** (`apps/api/src/templates/templates.service.ts` → `extractFormFields`): map
`ExtractedTemplateField.value` → `PdfFormFieldTemplate.referenceValue` through
`buildPdfFormFieldsFromExtracted`. On merge with existing fields, update `referenceValue` on
already-present fields too (re-extraction should refresh reference text, not just add new
fields).

### 3. Propagating values into a filled document

When a document is created from a template, `resolveDocumentFormFields`
(`packages/shared/src/document-form-fields.ts`) copies `referenceValue` straight from the
template field onto the document's `formFields` snapshot — no re-extraction at
document-creation time.

### 4. UI

**Fill panel** (`apps/web/components/documents/DocumentFormFillPanel.tsx`): for each field
with a `referenceValue`, render it as small greyed-out helper text near the input (e.g.
`מקור: 2026-0847`) with a copy-icon button that calls
`navigator.clipboard.writeText(referenceValue)`.

**Template editor** (`apps/web/app/templates/[id]/TemplateEditorClient.tsx`, form-fields
mode): show each field's `referenceValue` next to its label in the field list, so the
template author can sanity-check what was captured. Read-only there; editing happens at fill
time via the fill panel.

## Testing

- Unit test `anchorFieldsToPdfText`'s new value-capture behavior (matched line → exact
  `referenceValue`; no match → vision `value` fallback; neither → unset).
- Unit test `extractFormFields` merge logic refreshes `referenceValue` on existing fields.
- Unit test `resolveDocumentFormFields` propagates `referenceValue` onto document snapshots.
- Manual verification: run extraction against a multi-page table-heavy PDF (e.g. the
  building-permit example) and confirm per-cell fields + copyable values appear in both the
  template editor and the fill panel.
