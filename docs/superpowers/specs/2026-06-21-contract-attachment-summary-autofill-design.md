# Mandatory contract attachment with AI summary + form auto-fill

**Date:** 2026-06-21

## Problem

Today, starting a new document (`/documents/new`) offers three paths with no
attachment requirement: upload a PDF, click "Start form" for the blank
Haknasot template, or pick a saved template. Only the upload path produces a
contract whose text the AI can read — and even there, AI extraction
(`extract-signers`, `extract-form-fields`, `summarize`) only detects *where*
fields are and writes a short (2-4 sentence) summary. It never fills in the
field *values* themselves; users type every value by hand on the
`form-fill` step.

## Goal

1. Require a contract file on every new-document path, including the
   template-based ones that previously needed no upload at all.
2. Generate a ~5 sentence AI summary of the attached contract (was 2-4).
3. Auto-fill form field *values* (not just positions) by reading them out of
   the attached contract's text, pre-populating the form-fill/template step
   so the user reviews/edits real data instead of starting from blank
   inputs.

## Out of scope

- Changing what the *final signed document* looks like. Template flows still
  render the template's own PDF (`renderHaknasotDocument`, saved template
  PDF) — the attached contract is never stamped on; it is a data source only.
- Vision-based field detection for template flows — Haknasot and saved
  templates already have fixed, known field labels
  (`HAKNASOT_FORM_FIELDS` in `packages/shared`, `template.fields`), so no new
  vision call is needed there.
- Auto-filling signature/initial/"sign here"/"date signed" fields. Those stay
  blank for the signer to fill at signing time — only values that are
  actually stated in the contract text get extracted.
- Removing the "Start form" or saved-templates UI options. They stay, but now
  require an attachment before they're usable.

## Design

### 1. Schema: a new field distinct from `fileKey`

[`document.schema.ts`](../../../apps/api/src/documents/document.schema.ts)
gains `sourceContractKey: string | null`. For the upload path this stays
`null` (the existing `fileKey` already *is* the contract). For template
flows, `fileKey` holds the copied template PDF (the thing that gets
rendered/signed) and `sourceContractKey` holds the attached contract used
only for extraction.

### 2. Attaching a contract: new endpoints, mirroring existing upload pattern

- `POST /documents/:id/source-contract` — returns a presigned upload URL,
  same shape as the existing `createUpload`.
- `POST /documents/:id/source-contract/confirm` — validates the file landed
  in storage and records it on `sourceContractKey`, mirroring `confirmUpload`.

### 3. Text source resolution: prefer the attachment, fall back to the upload

Both `summarizeDocumentText` and the new value-extraction read from
`sourceContractKey` when present, otherwise `fileKey`
([`ai.service.ts`](../../../apps/api/src/ai/ai.service.ts)). This single rule
covers all three start-step paths without branching per `docSource`.

### 4. Summary: bump to ~5 sentences

In `ai.service.ts`, change the summarize system prompt (Claude path, line
~229, and the OpenAI fallback, line ~263) from "Write 2-4 concise sentences"
to "Write about 5 concise sentences." No other change to `summarizeDocumentText`.

### 5. New extraction: form field *values*

New `AiService.extractFormFieldValues(text, fields)`:

- Input: the contract text, and the full list of field labels already known
  for this document (from `doc.formFields` on the upload path, or the fixed
  `HAKNASOT_FORM_FIELDS` / `template.fields` list on template paths).
- Output: a `fieldId -> value` map.
- System prompt instructs the model to only return a value when it is
  explicitly stated in the document text — never invent or default a value —
  and to skip signature/initial/"sign here"/"date signed" style fields
  entirely.
- Implementation mirrors `extractSignerRoles`'s pattern (Claude
  `anthropicCompleteText` call, JSON-object response, OpenAI JSON-mode
  fallback) — text-only, no vision call needed since values are textual
  content, not layout.

New endpoint `POST /documents/:id/extract-form-values`, which loads the
resolved text source (see #3), calls `extractFormFieldValues`, and persists
the result into `doc.formValues` (merging with any already-set values).

### 6. Sequencing per path

- **Upload path** (`docSource === 'upload'`): unchanged trigger point — once
  `extract-form-fields` resolves (so field labels/positions are known), kick
  off `extract-form-values` using those labels. Runs automatically as part of
  the existing post-confirm batch in
  [`NewDocumentClient.tsx`](../../../apps/web/app/documents/new/NewDocumentClient.tsx)
  (currently `extract-signers` + `extract-form-fields`, around lines 228-231).
- **Haknasot blank-start / saved template** (`docSource === 'template'` /
  `'saved_pdf'`): no `extract-form-fields` call needed (fields are fixed).
  Once the contract attachment is confirmed, automatically call `summarize`
  and `extract-form-values` (using the fixed field list for that template),
  then proceed into the wizard with `doc.formValues` pre-filled.

### 7. Start-step UX: attachment becomes mandatory on every path

In [`StartStep`](../../../apps/web/app/documents/new/NewDocumentClient.tsx#L876):

- **Upload dropzone**: unchanged — already requires a file.
- **"Start form" button** (blank Haknasot) and **"Use this template" button**
  (saved templates): both become disabled until a contract file has been
  attached via a new required attachment control shown alongside those
  options. Attaching: create the document first (as today, via
  `startHaknasotDocument` / `startFromSavedTemplate`), then immediately
  require attachment confirmation before the wizard leaves the `start` step
  — mirroring how the upload path already blocks progress until
  `confirmUpload` succeeds.
- Failure handling: if extraction fails or finds nothing, the form-fill /
  template step just shows blank inputs, same as today when there's no AI
  data — no new error UI.

## Data flow summary

```
attach contract (any path)
        |
        v
sourceContractKey set & confirmed
        |
        +--> summarize (~5 sentences) --> doc.description
        |
        +--> [upload path only] extract-form-fields --> doc.formFields
        |                                                     |
        +--> extract-form-values (using known/extracted field list)
                    |
                    v
              doc.formValues (pre-filled, editable)
```
