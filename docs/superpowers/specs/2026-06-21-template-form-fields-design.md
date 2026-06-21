# Fillable Form Fields for Saved PDF Templates — Design

## Context

Documents created from the Haknasot blank-form template, and documents created by uploading a PDF, both have a concept of fillable data-entry fields (`Document.formFields` / `formValues`), with an editor UI (`DocumentFormFieldsEditor`), AI-driven extraction (`extractFormFields`/`extractFormValues`), and a dedicated form-fill step in `/documents/new`.

Saved PDF templates (`PdfTemplate`) have no equivalent. Their `fields` array only stores signature/signer-role stamp placements (`label`, `pageNumber`, `x/y/width/height` — no `type`, no `section`, no value storage). A document created from a saved template (`docSource === 'saved_pdf'`) therefore has zero data-entry fields and no form-fill step in its creation flow.

This is a prerequisite for a follow-on project (contract attachment + AI summary/autofill across all template-based document-creation paths) that assumes saved templates have a fillable-field concept to autofill into — they currently don't. This spec covers only building that missing subsystem. The contract-attachment/autofill layering is a separate, later spec.

## Goal

Let saved PDF templates define a list of fillable data-entry fields (same shape as `Document.formFields`), editable in the template editor (manual placement + AI extraction), and have those fields copied onto any document created from that template.

Out of scope: showing a form-fill step in the saved-template document-creation flow (`NewDocumentClient.tsx`'s `progressOrder` for `'saved_pdf'`), and any contract-attachment/AI-autofill behavior. Both are handled by the later spec.

## Data model

Reuse the existing `PdfFormFieldTemplate` shared type (`packages/shared/src/pdf-form.types.ts`) and the existing `DocumentFormField` Mongoose subdocument schema — no new types.

- `PdfTemplate` schema (`apps/api/src/templates/template.schema.ts`) gains `formFields: DocumentFormFieldSchema[]`, default `[]`. This sits alongside the existing `fields` array (signature placements) — the two are independent lists on the same document.
- `PdfTemplateDto` (`packages/shared/src/index.ts`) gains `formFields: PdfFormFieldTemplate[]`.
- `TemplatesService.toDto` includes `formFields: template.formFields ?? []`.

Rejected alternative: a separate `TemplateFormField` type/schema decoupled from `DocumentFormField`. Rejected because the shapes are identical and nothing currently differs between a template's and a document's data-entry field — a second type would be pure duplication.

## Backend API

New DTOs in `apps/api/src/templates/templates.dto.ts`, mirroring `CreateDocumentFormFieldDto`/`UpdateDocumentFormFieldDto` in `documents.dto.ts:69-153` field-for-field:

```typescript
export class CreateTemplateFormFieldDto {
  @IsString() @MaxLength(200) label!: string;
  @IsOptional() @IsIn(['text', 'textarea', 'date']) type?: 'text' | 'textarea' | 'date';
  @IsOptional() @IsString() @MaxLength(64) section?: string;
  @IsInt() @Min(1) pageNumber!: number;
  @IsNumber() @Min(0) @Max(100) x!: number;
  @IsNumber() @Min(0) @Max(100) y!: number;
  @IsOptional() @IsNumber() @Min(0) @Max(100) width?: number;
  @IsOptional() @IsNumber() @Min(0) @Max(100) height?: number;
}

export class UpdateTemplateFormFieldDto {
  @IsOptional() @IsString() @MaxLength(200) label?: string;
  @IsOptional() @IsIn(['text', 'textarea', 'date']) type?: 'text' | 'textarea' | 'date';
  @IsOptional() @IsString() @MaxLength(64) section?: string;
  @IsOptional() @IsInt() @Min(1) pageNumber?: number;
  @IsOptional() @IsNumber() @Min(0) @Max(100) x?: number;
  @IsOptional() @IsNumber() @Min(0) @Max(100) y?: number;
  @IsOptional() @IsNumber() @Min(0) @Max(100) width?: number;
  @IsOptional() @IsNumber() @Min(0) @Max(100) height?: number;
}
```

New endpoints on `TemplatesController`, mirroring `documents.controller.ts:138-206`:

```
POST   /templates/:id/extract-form-fields   → TemplatesService.extractFormFields
POST   /templates/:id/form-fields            → TemplatesService.addFormField
PATCH  /templates/:id/form-fields/:fieldId   → TemplatesService.updateFormField
DELETE /templates/:id/form-fields/:fieldId   → TemplatesService.deleteFormField
```

`TemplatesService.extractFormFields(templateId, clerkId)`:

1. Load the owned template; download its PDF via `storageService.downloadObject(template.fileKey)`.
2. Call `aiService.extractTemplateFieldsFromPdf(buffer, template.pageCount, [], 'saved_template')` — same AI call `TemplatesService.extractFields` already uses for signature placements, just interpreted differently downstream. No signer hints needed (those are specific to signature-field extraction).
3. Run results through `buildPdfFormFieldsFromExtracted` (existing shared helper) to get `PdfFormFieldTemplate[]` with stable slugified ids.
4. Merge with `template.formFields ?? []`, deduping by id and by `(pageNumber, label)` placement key — same merge logic as `documents.service.ts:312-336`.
5. Save, return `{ fields: merged }`.

`addFormField`/`updateFormField`/`deleteFormField` are direct ports of the equivalent `DocumentsService` methods (`documents.service.ts:419-` onward), operating on `template.formFields` instead of `doc.formFields`. Templates have no Haknasot-style built-in base fields, so the "materialize an override from a built-in field" branch in `DocumentsService.updateFormField` does not apply here — every template form field is a plain, directly-stored entry.

## Document creation integration

`DocumentsService.createFromPdfTemplate` (`documents.service.ts:119-159`): immediately after copying the template's PDF bytes into the new document's `fileKey`, add:

```typescript
doc.formFields = (template.formFields ?? []) as never;
```

The new document's `formTemplateId` remains unset (saved_pdf documents are not Haknasot), so `resolveDocumentFormFields` (`packages/shared/src/document-form-fields.ts:90-114`) takes its plain fallback path and returns `doc.formFields` deduped as-is — no changes needed to that function or to `isEditableDocumentFormField`/`allowedDocumentFormFieldIds`.

## Frontend: `TemplateEditorClient.tsx`

- Add local state `formFieldEditorMode: 'signatures' | 'form-fields'`, default `'signatures'`. A small toggle control sits above the `PDFViewer`.
- In `'form-fields'` mode, the same `PDFViewer` instance is driven with `formFields` / `formFieldPlacementMode` / `formFieldEditMode` instead of `fields` / `templateEditMode`. `PDFViewer` already supports both prop sets independently (`PDFViewer.tsx:60-76`, lines 1265 and 1478 render the two overlay layers separately) — no viewer changes needed.
- `DocumentFormFieldsEditor` is reused below the viewer in this mode. It currently takes a `doc: DocumentDto` prop but only uses two things from it: `doc.hasPdfFile` (button gating) and `isEditableDocumentFormField(doc, fieldId)` (row filtering, which itself only reads `formTemplateId` and `formFields`). Its prop type narrows from `doc: DocumentDto` to `doc: { hasPdfFile: boolean; formTemplateId?: string | null; formFields?: PdfFormFieldTemplate[] }` so it can be driven by a template (`{ hasPdfFile: true, formTemplateId: null, formFields: template.formFields }`) without a fake `DocumentDto` stub.
- New handlers in `TemplateEditorClient.tsx`: `handleAddFormField`, `handleUpdateFormField`, `handleDeleteFormField`, `handleExtractFormFields` — thin wrappers over the new endpoints, mirroring the file's existing `handleFieldAdd`/`handleExtractFields` patterns for signature fields.

## Testing

- Backend unit tests for `TemplatesService.addFormField` / `updateFormField` / `deleteFormField` / `extractFormFields`, mirroring the existing `DocumentsService` form-field test suite.
- Backend integration test: creating a document from a template with non-empty `formFields` copies them onto the new document, and `GET /documents/:id` reflects them via `resolveDocumentFormFields`.
- Manual frontend verification: in the template editor, extract/add form fields and confirm they persist; create a document from that template and confirm `GET /documents/:id` returns the same fields in `formFields`. Confirming an actual form-fill *step* appears in the document-creation UI is out of scope here (see Out of scope above) — that UI wiring belongs to the follow-on contract-attachment spec.
