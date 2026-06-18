# Haknasot field position overrides (per document)

**Date:** 2026-06-17

## Problem

The Haknasot form template's text-field positions are hardcoded in
[`packages/shared/src/haknasot-form.ts`](../../../packages/shared/src/haknasot-form.ts)
(`HAKNASOT_FORM_FIELDS`, auto-generated from `scripts/extract-haknasot-fields.py`).
When a field lands in the wrong spot on the PDF, there is no way to correct it —
the base fields are explicitly marked non-editable
([`document-form-fields.ts`](../../../packages/shared/src/document-form-fields.ts)),
the form-setup tab is hidden for template documents, and the server-side renderer
([`haknasot-renderer.ts`](../../../apps/api/src/documents/haknasot-renderer.ts))
stamps values using the raw hardcoded coordinates.

## Goal

Let the document owner drag/resize the built-in Haknasot **text** fields to fix
their positioning, saved as a **per-document override**. Other Haknasot documents
keep the defaults. Both the on-screen preview and the downloaded/flattened PDF
reflect the override. A per-field "reset to default" reverts a field.

## Out of scope

- Signature/municipal-approval rows (`MUNICIPAL_APPROVAL_SIGNATURE_ROWS`) and the
  contract-type ellipse marker as *editable* targets. (The ellipse anchor still
  follows the `contract_type` field's resolved position — see layer 4.)
- Font-size changes.
- Global / template-wide editing (the override is per document only).
- Other form templates — there is only Haknasot in the catalog today; behaviour
  for non-template and uploaded-PDF documents is unchanged.

## Design

Overrides are stored in the existing `doc.formFields` array, keyed by the same
`id` as the base field. A base field with no matching `formFields` entry uses its
hardcoded default; an entry with a matching `id` overrides geometry/label.

### Layer 1 — Shared resolution ([`document-form-fields.ts`](../../../packages/shared/src/document-form-fields.ts))

- `resolveDocumentFormFields`: for Haknasot, merge `doc.formFields` entries onto
  the base fields **by matching `id`** (override `x/y/width/height/label`).
  Custom fields with brand-new ids still append as today. (Currently custom
  fields sharing a base id/key are discarded — invert that for matching ids.)
- `isEditableDocumentFormField`: for Haknasot, return `true` for any resolved
  field id (base + custom), not just ids present in `doc.formFields`.

### Layer 2 — API edit/override materialization ([`documents.service.ts`](../../../apps/api/src/documents/documents.service.ts))

- `updateFormField`: if `fieldId` is a valid resolved Haknasot field that is not
  yet in `doc.formFields`, **materialize an override copy** from the base
  definition into `doc.formFields`, then apply the patch. Existing behaviour for
  fields already in `formFields` is unchanged.
- `assertCanEditFormFields`: allow editing existing/base fields on a Haknasot
  document **without** an uploaded PDF (Haknasot uses the static template asset,
  so `doc.fileKey` is empty). Keep the uploaded-PDF requirement only for *adding
  brand-new* custom fields.
- Reset: `deleteFormField` on a Haknasot **base** field id removes the override
  entry from `doc.formFields` (reverting to default) rather than being rejected.
  Deleting a genuinely custom field keeps today's behaviour.

### Layer 3 — Web edit UI ([`DocumentViewerClient.tsx`](../../../apps/web/app/documents/[id]/DocumentViewerClient.tsx))

- Add an owner + draft-only **"Adjust field positions"** toggle surfaced for
  Haknasot documents (which currently show no form-setup affordance).
- When on: pass `formFieldEditMode = true` and
  `editableFormFieldIds = <all resolved field ids>` to `PDFViewer`. The existing
  `onFormFieldMove` / `onFormFieldResize` handlers already persist via
  `PATCH /documents/:id/form-fields/:fieldId`.
- Surface a per-field **"Reset to default"** action (calls the existing
  `DELETE /documents/:id/form-fields/:fieldId`) for the selected field.
- The viewer already renders the Haknasot template PDF via `templatePdfUrl`, so
  no new PDF plumbing is needed; only the edit gating that assumed an uploaded
  PDF must be relaxed for Haknasot.

### Layer 4 — Server-side PDF renderer ([`haknasot-renderer.ts`](../../../apps/api/src/documents/haknasot-renderer.ts) + call site)

- `RenderHaknasotPdfOpts` gains an optional `fields` array (defaults to
  `HAKNASOT_FORM_FIELDS`). `renderHaknasotPdf` stamps values using the passed
  `fields` and resolves the `contract_type` field (ellipse anchor) from them, so
  overridden positions apply to the flattened PDF.
- `renderHaknasotDocument` in `documents.service.ts` passes
  `resolveDocumentFormFields(doc)` as `fields`.

## Data flow

```
owner drags field
  -> PATCH /documents/:id/form-fields/:id  (override materialized in doc.formFields)
  -> resolveDocumentFormFields merges override over base
  -> preview (PDFViewer) + download (renderHaknasotPdf) both read resolved fields
reset
  -> DELETE /documents/:id/form-fields/:id (removes override)  -> back to default
```

## Testing

- **Shared (unit):** `resolveDocumentFormFields` applies an override onto the
  matching base field; non-matching custom fields still append;
  `isEditableDocumentFormField` is `true` for a base Haknasot id.
- **API (unit/e2e):** `updateFormField` materializes an override on first edit of
  a base field; `deleteFormField` on a base id removes the override; editing a
  base field with no uploaded PDF is allowed for Haknasot, still rejected for
  non-Haknasot.
- **Renderer (unit):** `renderHaknasotPdf` honours a passed override position
  (e.g. stamped text x/y differs from default).
- **Manual:** on a draft Haknasot doc, toggle adjust mode, drag a field, reload —
  position persists; download PDF reflects the new position; reset reverts it;
  a second Haknasot doc is unaffected.

## Risks

- Inverting the "discard custom fields with base ids" rule must not change
  behaviour for non-Haknasot documents (guard on `formTemplateId`).
- The static Haknasot asset has fixed page dimensions; overrides are stored as
  percentages, so they remain resolution-independent.
