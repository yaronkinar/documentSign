# Contract Summary Length + Form Value Auto-Fill (Upload Path) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On the existing PDF-upload path of `/documents/new`, lengthen the AI summary to ~5 sentences and add a new AI extraction step that reads field *values* out of the uploaded contract's text and pre-fills `doc.formValues`, so the form-fill step starts populated instead of blank.

**Architecture:** A new `AiService.extractFormFieldValues(text, fields)` mirrors the existing `extractSignerRoles` pattern exactly (Claude `anthropicCompleteText` JSON-object call, OpenAI JSON-mode fallback) — text-only, no vision call. A new `DocumentsService.extractFormValues(documentId, clerkId)` downloads the doc's existing `fileKey` PDF (the upload path's contract already *is* `fileKey` — no new schema field needed), extracts text, calls the AI method with the document's already-detected `formFields`, and merges the result into `doc.formValues`. A new `POST /documents/:id/extract-form-values` endpoint exposes it. The frontend chains this call after the existing `extract-form-fields` call resolves in `startUploadedDocument`, then seeds the `formValues` React state so the form-fill step shows the extracted values.

**Scope note:** This plan covers the **upload path only** (the design doc's items #4 and #5, applied where `docSource === 'upload'`). The design doc's mandatory-attachment requirement for the blank-Haknasot and saved-template paths (`sourceContractKey` schema field, new attachment endpoints, "Start form"/"Use this template" gating UI) is a separate, larger UI rework and is intentionally **not** part of this plan — it should get its own plan once this slice is reviewed.

**Tech Stack:** NestJS (`apps/api`), Mongoose, `@anthropic-ai/sdk` via `anthropic-llm.ts`, Jest (plain, hand-mocked deps, no `TestingModule`), Next.js (`apps/web`).

---

### Task 1: Bump the AI summary to ~5 sentences

**Files:**
- Modify: `apps/api/src/ai/ai.service.ts:229` (Claude path system prompt)
- Modify: `apps/api/src/ai/ai.service.ts:263` (OpenAI fallback system prompt)
- Test: `apps/api/src/ai/ai.service.spec.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/ai/ai.service.spec.ts`:

```ts
import { AiService } from './ai.service';

jest.mock('./anthropic-llm', () => ({
  preferAnthropic: jest.fn(),
  anthropicCompleteText: jest.fn(),
  anthropicVisionExtract: jest.fn(),
}));

import {
  anthropicCompleteText,
  preferAnthropic,
} from './anthropic-llm';

describe('AiService.summarizeDocumentText', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('asks Claude for about 5 sentences', async () => {
    (preferAnthropic as jest.Mock).mockReturnValue(true);
    (anthropicCompleteText as jest.Mock).mockResolvedValue('A summary.');

    const service = new AiService();
    await service.summarizeDocumentText('some contract text');

    const call = (anthropicCompleteText as jest.Mock).mock.calls[0][0];
    expect(call.system).toContain('about 5 concise sentences');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run (from `apps/api`): `npm run test -- ai.service.spec.ts`
Expected: FAIL — `call.system` contains `"2-4 concise sentences"`, not `"about 5 concise sentences"`.

- [ ] **Step 3: Update both system prompts**

In `apps/api/src/ai/ai.service.ts`, line ~229 (Claude path inside `summarizeDocumentText`):

```ts
          system:
            'You summarize documents for a signing workflow. Write about 5 concise sentences covering: document type, parties involved, key terms or obligations, and anything signers should notice. Use BOTH the extracted PDF text AND the structured form values and signer list when present — these are authoritative and may contain details (amounts, dates, parties) that are clearer than the PDF text. Use the same language as the document (Hebrew if the document is in Hebrew). Do not invent facts not present in the inputs.',
```

And line ~263 (OpenAI fallback, same function, identical string):

```ts
            content:
              'You summarize documents for a signing workflow. Write about 5 concise sentences covering: document type, parties involved, key terms or obligations, and anything signers should notice. Use BOTH the extracted PDF text AND the structured form values and signer list when present — these are authoritative and may contain details (amounts, dates, parties) that are clearer than the PDF text. Use the same language as the document (Hebrew if the document is in Hebrew). Do not invent facts not present in the inputs.',
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- ai.service.spec.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/ai/ai.service.ts apps/api/src/ai/ai.service.spec.ts
git commit -m "feat: lengthen AI document summary to about 5 sentences"
```

---

### Task 2: Add `AiService.extractFormFieldValues`

**Files:**
- Modify: `apps/api/src/ai/ai.service.ts` (add `FormFieldHint` interface near `TemplateSignerHint`, add method after `extractSignerRoles`, i.e. after line 387)
- Test: `apps/api/src/ai/ai.service.spec.ts` (extend)

- [ ] **Step 1: Write the failing tests**

Append to `apps/api/src/ai/ai.service.spec.ts`:

```ts
describe('AiService.extractFormFieldValues', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const fields = [
    { id: 'supplier_name', label: 'שם ספק' },
    { id: 'contract_number', label: 'מספר חוזה' },
  ];

  it('returns only values for known field ids from the Claude JSON response', async () => {
    (preferAnthropic as jest.Mock).mockReturnValue(true);
    (anthropicCompleteText as jest.Mock).mockResolvedValue(
      JSON.stringify({
        values: {
          supplier_name: 'חברת דוגמה בע"מ',
          contract_number: 'CN-2026-789',
          unknown_field: 'should be dropped',
        },
      }),
    );

    const service = new AiService();
    const result = await service.extractFormFieldValues(
      'document text mentioning חברת דוגמה בע"מ and CN-2026-789',
      fields,
    );

    expect(result).toEqual({
      supplier_name: 'חברת דוגמה בע"מ',
      contract_number: 'CN-2026-789',
    });
  });

  it('returns an empty object when the model response is not valid JSON', async () => {
    (preferAnthropic as jest.Mock).mockReturnValue(true);
    (anthropicCompleteText as jest.Mock).mockResolvedValue('not json');

    const service = new AiService();
    const result = await service.extractFormFieldValues('some text', fields);

    expect(result).toEqual({});
  });

  it('returns an empty object without calling the model when there are no fields', async () => {
    (preferAnthropic as jest.Mock).mockReturnValue(true);

    const service = new AiService();
    const result = await service.extractFormFieldValues('some text', []);

    expect(result).toEqual({});
    expect(anthropicCompleteText).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test -- ai.service.spec.ts`
Expected: FAIL with `TypeError: service.extractFormFieldValues is not a function`.

- [ ] **Step 3: Implement `extractFormFieldValues`**

In `apps/api/src/ai/ai.service.ts`, add the hint type next to `TemplateSignerHint` (around line 27-30):

```ts
export interface TemplateSignerHint {
  label: string;
  email?: string | null;
}

export interface FormFieldHint {
  id: string;
  label: string;
}
```

Then add the method immediately after `extractSignerRoles` ends (after line 387, before `extractTemplateFieldsFromPdf`):

```ts
  async extractFormFieldValues(
    text: string,
    fields: FormFieldHint[],
  ): Promise<Record<string, string>> {
    const trimmed = text.slice(0, MAX_TEXT_CHARS);
    if (!trimmed || fields.length === 0) return {};

    const fieldList = fields.map((f) => `- ${f.id}: ${f.label}`).join('\n');
    const system =
      'You fill in values for form fields using ONLY information explicitly stated in the document text. ' +
      'Return ONLY a JSON object with a single key "values" whose value is an object mapping field id to the extracted value (string). ' +
      'Only include a field if its value is explicitly stated in the document text — never invent, guess, or default a value. ' +
      'Skip fields that are for signing now rather than data already in the document (e.g. signature, initials, "sign here", "date signed"). ' +
      'Keep values in the original language and format found in the document. ' +
      'Example: {"values": {"contract_number": "CN-2026-789"}}';
    const user = `Fields (id: label):\n${fieldList}\n\nDocument text:\n${trimmed}`;

    if (preferAnthropic()) {
      try {
        const raw = await anthropicCompleteText({
          label: 'form-values',
          system,
          user,
        });
        return this.parseFormFieldValues(raw, fields);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        throw new InternalServerErrorException(
          `AI form-value extraction failed (Claude): ${message.slice(0, 200)}`,
        );
      }
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new ServiceUnavailableException(
        'AI form-value extraction is not configured (set OPENAI_API_KEY or AI_PROVIDER=anthropic with ANTHROPIC_API_KEY)',
      );
    }

    const baseUrl = process.env.OPENAI_BASE_URL ?? 'https://api.openai.com/v1';
    const model = process.env.OPENAI_MODEL ?? 'gpt-4o-mini';
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        temperature: 0,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
      }),
    });

    if (!res.ok) {
      const errBody = await res.text().catch(() => '');
      throw new InternalServerErrorException(
        `AI form-value extraction failed (${res.status}): ${errBody.slice(0, 200)}`,
      );
    }

    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const raw = data.choices?.[0]?.message?.content?.trim();
    if (!raw) return {};
    return this.parseFormFieldValues(raw, fields);
  }

  private parseFormFieldValues(
    raw: string,
    fields: FormFieldHint[],
  ): Record<string, string> {
    const validIds = new Set(fields.map((f) => f.id));
    try {
      const parsed = JSON.parse(raw) as { values?: unknown };
      if (parsed.values && typeof parsed.values === 'object') {
        const out: Record<string, string> = {};
        for (const [key, value] of Object.entries(
          parsed.values as Record<string, unknown>,
        )) {
          if (validIds.has(key) && typeof value === 'string' && value.trim()) {
            out[key] = value.trim();
          }
        }
        return out;
      }
    } catch {
      // fall through
    }
    return {};
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test -- ai.service.spec.ts`
Expected: PASS (all describe blocks)

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/ai/ai.service.ts apps/api/src/ai/ai.service.spec.ts
git commit -m "feat: add AiService.extractFormFieldValues for contract data auto-fill"
```

---

### Task 3: Add `DocumentsService.extractFormValues`

**Files:**
- Modify: `apps/api/src/documents/documents.service.ts` (add method right after `extractFormFields`, i.e. after line 341)
- Test: `apps/api/src/documents/documents.service.spec.ts` (new file)

- [ ] **Step 1: Write the failing tests**

Create `apps/api/src/documents/documents.service.spec.ts`:

```ts
import { BadRequestException } from '@nestjs/common';
import { Types } from 'mongoose';

import { DocumentsService } from './documents.service';

function buildDoc(overrides: Record<string, unknown> = {}) {
  return {
    _id: new Types.ObjectId(),
    ownerId: 'owner1',
    fileKey: 'docs/abc/file.pdf',
    pageCount: 2,
    formFields: [
      { id: 'supplier_name', label: 'שם ספק', type: 'text', section: 'details', pageNumber: 1, x: 0, y: 0, width: 1, height: 1 },
    ],
    formValues: {},
    save: jest.fn().mockResolvedValue(undefined),
    markModified: jest.fn(),
    ...overrides,
  };
}

function buildService(doc: unknown) {
  const documentModel = {
    findById: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(doc) }),
  };
  const storageService = {
    downloadObject: jest.fn().mockResolvedValue(Buffer.from('pdf bytes')),
  };
  const aiService = {
    extractPdfText: jest.fn().mockResolvedValue('contract text mentioning חברת דוגמה'),
    extractFormFieldValues: jest
      .fn()
      .mockResolvedValue({ supplier_name: 'חברת דוגמה בע"מ' }),
  };

  const service = new DocumentsService(
    documentModel as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    storageService as never,
    {} as never,
    aiService as never,
    {} as never,
    {} as never,
  );

  return { service, documentModel, storageService, aiService };
}

describe('DocumentsService.extractFormValues', () => {
  it('throws when the document has no uploaded PDF', async () => {
    const doc = buildDoc({ fileKey: null });
    const { service } = buildService(doc);

    await expect(
      service.extractFormValues(String(doc._id), 'owner1'),
    ).rejects.toThrow(BadRequestException);
  });

  it('merges extracted values into doc.formValues and persists', async () => {
    const doc = buildDoc();
    const { service, storageService, aiService } = buildService(doc);

    const result = await service.extractFormValues(String(doc._id), 'owner1');

    expect(storageService.downloadObject).toHaveBeenCalledWith('docs/abc/file.pdf');
    expect(aiService.extractFormFieldValues).toHaveBeenCalledWith(
      'contract text mentioning חברת דוגמה',
      [{ id: 'supplier_name', label: 'שם ספק' }],
    );
    expect(result).toEqual({ values: { supplier_name: 'חברת דוגמה בע"מ' } });
    expect(doc.formValues).toEqual({ supplier_name: 'חברת דוגמה בע"מ' });
    expect(doc.markModified).toHaveBeenCalledWith('formValues');
    expect(doc.save).toHaveBeenCalled();
  });

  it('returns existing values unchanged when there are no form fields', async () => {
    const doc = buildDoc({ formFields: [] });
    const { service, aiService } = buildService(doc);

    const result = await service.extractFormValues(String(doc._id), 'owner1');

    expect(result).toEqual({ values: {} });
    expect(aiService.extractFormFieldValues).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run (from `apps/api`): `npm run test -- documents.service.spec.ts`
Expected: FAIL with `TypeError: service.extractFormValues is not a function`.

- [ ] **Step 3: Implement `extractFormValues`**

In `apps/api/src/documents/documents.service.ts`, add this method immediately after `extractFormFields` (after line 341, before the `assertDraftForFormFields` comment/method block):

```ts
  async extractFormValues(
    documentId: string,
    clerkId: string,
  ): Promise<{ values: Record<string, string> }> {
    const doc = await this.findOwnedDocument(documentId, clerkId);
    if (!doc.fileKey) {
      throw new BadRequestException('Document has no uploaded PDF');
    }

    const fields = this.docFormFieldSnapshot(doc).map((f) => ({
      id: f.id,
      label: f.label,
    }));
    if (fields.length === 0) {
      return { values: doc.formValues ?? {} };
    }

    const pdfBuffer = await this.storageService.downloadObject(doc.fileKey);
    const text = await this.aiService.extractPdfText(pdfBuffer);
    const extracted = await this.aiService.extractFormFieldValues(text, fields);

    doc.formValues = { ...(doc.formValues ?? {}), ...extracted };
    doc.markModified('formValues');
    await doc.save();
    return { values: doc.formValues };
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test -- documents.service.spec.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/documents/documents.service.ts apps/api/src/documents/documents.service.spec.ts
git commit -m "feat: extract and merge form field values from the uploaded contract"
```

---

### Task 4: Expose `POST /documents/:id/extract-form-values`

**Files:**
- Modify: `apps/api/src/documents/documents.controller.ts:138-141` (insert new endpoint right after `extractFormFields`)

- [ ] **Step 1: Add the endpoint**

In `apps/api/src/documents/documents.controller.ts`, immediately after the existing `extractFormFields` handler (lines 138-141):

```ts
  @Post(':id/extract-form-fields')
  extractFormFields(@CurrentUser() user: CurrentUserPayload, @Param('id') id: string) {
    return this.documentsService.extractFormFields(id, user.clerkId);
  }

  @Post(':id/extract-form-values')
  extractFormValues(@CurrentUser() user: CurrentUserPayload, @Param('id') id: string) {
    return this.documentsService.extractFormValues(id, user.clerkId);
  }
```

- [ ] **Step 2: Run the full API test suite to confirm nothing else broke**

Run (from `apps/api`): `npm run test`
Expected: PASS (all suites, including the two new spec files from Tasks 2 and 3)

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/documents/documents.controller.ts
git commit -m "feat: add POST /documents/:id/extract-form-values endpoint"
```

---

### Task 5: Wire auto-fill into the upload flow's existing extraction batch

**Files:**
- Modify: `apps/web/app/documents/new/NewDocumentClient.tsx:223-280` (inside `startUploadedDocument`)

- [ ] **Step 1: Capture the detected fields and chain the new call**

In `apps/web/app/documents/new/NewDocumentClient.tsx`, replace the body of `startUploadedDocument` from `setExtractingSigners(true);` (line 223) through `setStep('form-setup');` (line 280) with:

```tsx
      setExtractingSigners(true);
      setExtractingFormFields(true);
      let latestDoc = confirmed;
      let detectedFields: ReturnType<typeof resolveFormTemplateFields> = [];
      try {
        const [signersResult, formResult, docWithUrl] = await Promise.all([
          api.post<{ signers: string[] }>(`/documents/${newId}/extract-signers`),
          api
            .post<{ fields: ReturnType<typeof resolveFormTemplateFields> }>(
              `/documents/${newId}/extract-form-fields`,
            )
            .catch(() => ({ fields: [] as ReturnType<typeof resolveFormTemplateFields> })),
          api.get<DocumentDto>(`/documents/${newId}`),
        ]);
        const { signers } = signersResult;
        detectedFields = formResult.fields;
        latestDoc = docWithUrl;
        if (docWithUrl.fileUrl) setUploadPdfUrl(docWithUrl.fileUrl);
        if (signers.length > 0) {
          setSignerRolesSource('file');
          setTemplateRoleNames(signers);
          setSteps([
            {
              label: t('newDocument.signaturesStepLabel'),
              stepType: 'approval',
              signers: signers.map((name) => ({ email: '', name })),
            },
          ]);
        } else {
          setSignerRolesSource('manual');
          setTemplateRoleNames([]);
          setSteps([
            {
              label: t('newDocument.stepLabel', { n: 1 }),
              stepType: 'signature',
              signers: [],
            },
          ]);
        }
      } catch {
        setSignerRolesSource('manual');
        setTemplateRoleNames([]);
        setSteps([
          {
            label: t('newDocument.stepLabel', { n: 1 }),
            stepType: 'signature',
            signers: [],
          },
        ]);
      } finally {
        setExtractingSigners(false);
        setExtractingFormFields(false);
      }

      if (detectedFields.length > 0) {
        try {
          await api.post(`/documents/${newId}/extract-form-values`);
          latestDoc = await api.get<DocumentDto>(`/documents/${newId}`);
        } catch {
          // Leave form values blank — same as today when there's no AI data.
        }
      }

      setDoc(latestDoc);
      setFormValues(latestDoc.formValues ?? {});
      const resolvedFields = resolveDocumentFormFields(latestDoc);
      if (resolvedFields.length > 0) {
        setFormFields(resolvedFields);
      }
      setStep('form-setup');
```

- [ ] **Step 2: Manually verify in the browser**

Run (from `apps/web`, if not already running): `npm run dev`

Navigate to `/documents/new`, upload `apps/web/public/samples/mock-haknasot-source-contract.pdf` (already has Hebrew prose text with embedded field-style values — note it won't have form fields detected since it's not laid out as a fillable form, so for this manual check use any uploaded PDF that has a form-fill step with detectable fields, e.g. a previously-used uploaded-PDF fixture). Confirm: after the "processing" phase, the form-fill step's inputs are pre-populated with values rather than blank, and the description is now ~5 sentences instead of ~2-4.

- [ ] **Step 3: Commit**

```bash
git add apps/web/app/documents/new/NewDocumentClient.tsx
git commit -m "feat: pre-fill form-fill step from AI-extracted contract values"
```

---

## Out of scope (tracked for a follow-up plan)

- `sourceContractKey` schema field and `POST /:id/source-contract` / `/source-contract/confirm` endpoints.
- Mandatory-attachment gating on the blank-Haknasot "Start form" button and the saved-template "Use this template" button.
- Running `extract-form-values` for `docSource === 'template'` / `'saved_pdf'` paths.

These are all covered by the committed design doc at
`docs/superpowers/specs/2026-06-21-contract-attachment-summary-autofill-design.md`
but require a separate plan since they involve new schema, new endpoints, and a UI
gating rework — independent, testable units in their own right.
