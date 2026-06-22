# Contract Attachment Before Form-Fill Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a mandatory "attach a contract" wizard step before form-fill/details in the Haknasot blank-template flow and the saved-PDF-template flow, so the attached contract drives AI summarization and AI form-value auto-fill — mirroring the upload flow's existing behavior.

**Architecture:** A new `sourceContractKey` field on `Document` stores an attached contract PDF that is used purely as an AI text-extraction source (never rendered/stamped, unlike `fileKey`). Two new endpoints (`POST :id/source-contract`, `POST :id/source-contract/confirm`) issue a presigned upload URL and confirm the upload, mirroring the existing `createUpload`/`confirmUpload` pattern. `summarizeDocument` and `extractFormValues` are generalized to read text from `sourceContractKey` when present, falling back to `fileKey`. On the frontend, a new `'attach-contract'` wizard step is inserted between `'start'` and `'form'`/`'details'` for the `template` and `saved_pdf` doc sources; it uploads the contract, then triggers summarize + extract-form-values automatically.

**Tech Stack:** NestJS (Mongoose), Next.js/React, Playwright e2e tests, Jest unit tests.

---

### Task 1: Add `sourceContractKey` to the Document schema and a new audit event type

**Files:**
- Modify: `apps/api/src/documents/document.schema.ts`
- Modify: `packages/shared/src/index.ts:68-84`

- [ ] **Step 1: Add the schema field**

In `apps/api/src/documents/document.schema.ts`, find the `fileKey` prop declaration (near the top of the `Document` class, alongside `fileSize`, `pageCount`, `completedFileKey`). Add a new prop right after `completedFileKey`:

```ts
/** Storage key for an attached contract used as an AI text-extraction source. Never rendered/stamped — distinct from fileKey. */
@Prop({ type: String, default: null })
sourceContractKey!: string | null;
```

- [ ] **Step 2: Add the audit event type**

In `packages/shared/src/index.ts`, update the `AuditEventType` enum (lines 68-84):

```ts
export enum AuditEventType {
  DocumentCreated = 'document_created',
  DocumentUploaded = 'document_uploaded',
  DocumentSourceContractAttached = 'document_source_contract_attached',
  DocumentViewed = 'document_viewed',
  DocumentDeleted = 'document_deleted',
  StatusChanged = 'status_changed',
  StepStarted = 'step_started',
  StepCompleted = 'step_completed',
  StepSkipped = 'step_skipped',
  SignerAdded = 'signer_added',
  SignerInvited = 'signer_invited',
  SignerSkipped = 'signer_skipped',
  Signed = 'signed',
  Rejected = 'rejected',
  Commented = 'commented',
  CommentResolved = 'comment_resolved',
}
```

- [ ] **Step 3: Verify the API project still builds**

Run: `npm run --workspace apps/api build`
Expected: exits 0, no TypeScript errors.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/documents/document.schema.ts packages/shared/src/index.ts
git commit -m "feat: add sourceContractKey field and audit event type for contract attachments"
```

---

### Task 2: Add `attachSourceContract`/`confirmSourceContract` service methods and controller endpoints

**Files:**
- Modify: `apps/api/src/documents/documents.service.ts`
- Modify: `apps/api/src/documents/documents.controller.ts`
- Test: `apps/api/src/documents/documents.service.spec.ts`

- [ ] **Step 1: Read the existing test helpers**

`apps/api/src/documents/documents.service.spec.ts` already has a `buildDoc(overrides)` fixture and a `buildService(doc)` helper that constructs `DocumentsService` with stub collaborators, passing `{}` for `auditService` (constructor position 7 of 10: `documentModel, signatureModel, commentModel, signerProfileModel, invitesService, storageService, auditService, aiService, workflowService, templatesService`). Update `buildService` so `auditService` is `{ log: jest.fn() }` instead of `{}`, and have it return `auditService` alongside the other returned mocks, e.g.:

```ts
function buildService(doc: ReturnType<typeof buildDoc>) {
  const documentModel = { findById: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(doc) }) };
  const storageService = {
    downloadObject: jest.fn().mockResolvedValue(Buffer.from('pdf-bytes')),
    getUploadUrl: jest.fn().mockResolvedValue('https://upload.example/signed-url'),
    objectExists: jest.fn().mockResolvedValue(true),
  };
  const auditService = { log: jest.fn() };
  const aiService = {
    extractPdfText: jest.fn().mockResolvedValue('contract text'),
    extractFormFieldValues: jest.fn().mockResolvedValue({}),
    summarizeDocumentText: jest.fn().mockResolvedValue('a summary'),
  };
  const service = new DocumentsService(
    documentModel as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    storageService as never,
    auditService as never,
    aiService as never,
    {} as never,
    {} as never,
  );
  return { service, documentModel, storageService, auditService, aiService };
}
```

(Keep whatever the existing literal shape of `documentModel`/`storageService`/`aiService` already is in the file — only add `auditService.log` and thread it through the constructor call and return value. Do not remove existing mock behavior.)

- [ ] **Step 2: Write the failing tests for `attachSourceContract`**

Add a new `describe` block to `apps/api/src/documents/documents.service.spec.ts`:

```ts
describe('DocumentsService.attachSourceContract', () => {
  it('generates a fileKey, persists it, and returns an upload URL', async () => {
    const doc = buildDoc({ sourceContractKey: null });
    const { service, storageService } = buildService(doc);

    const result = await service.attachSourceContract(doc._id.toString(), doc.ownerId);

    expect(doc.sourceContractKey).toMatch(
      new RegExp(`^docs/${doc._id.toString()}/source-contract/`),
    );
    expect(doc.save).toHaveBeenCalled();
    expect(storageService.getUploadUrl).toHaveBeenCalledWith(
      doc.sourceContractKey,
      'application/pdf',
    );
    expect(result).toEqual({
      uploadUrl: 'https://upload.example/signed-url',
      fileKey: doc.sourceContractKey,
    });
  });
});
```

This assumes `buildDoc` already mocks `save` as `jest.fn().mockResolvedValue(undefined)` (matching the pattern used by other mutation tests in this file — check the existing `buildDoc` implementation and reuse its `save` mock instead of redefining it).

- [ ] **Step 3: Run the test to verify it fails**

Run: `npm run --workspace apps/api test -- documents.service.spec.ts -t "attachSourceContract"`
Expected: FAIL with `service.attachSourceContract is not a function`.

- [ ] **Step 4: Implement `attachSourceContract`**

In `apps/api/src/documents/documents.service.ts`, add this method near `createUpload`/`confirmUpload` (the existing methods around line 162-226). Check the top of the file for the existing `uuidv4` import used by `createUpload`/`confirmUpload` and reuse it:

```ts
async attachSourceContract(
  documentId: string,
  clerkId: string,
): Promise<{ uploadUrl: string; fileKey: string }> {
  const doc = await this.findOwnedDocument(documentId, clerkId);
  const fileKey = `docs/${documentId}/source-contract/${uuidv4()}.pdf`;
  doc.sourceContractKey = fileKey;
  await doc.save();
  const uploadUrl = await this.storageService.getUploadUrl(
    fileKey,
    'application/pdf',
  );
  return { uploadUrl, fileKey };
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm run --workspace apps/api test -- documents.service.spec.ts -t "attachSourceContract"`
Expected: PASS

- [ ] **Step 6: Write the failing tests for `confirmSourceContract`**

Add another `describe` block:

```ts
describe('DocumentsService.confirmSourceContract', () => {
  it('throws when no contract attachment is pending', async () => {
    const doc = buildDoc({ sourceContractKey: null });
    const { service } = buildService(doc);

    await expect(
      service.confirmSourceContract(doc._id.toString(), doc.ownerId, 'owner@example.com'),
    ).rejects.toThrow('No source contract attachment pending');
  });

  it('throws when the uploaded object is missing from storage', async () => {
    const doc = buildDoc({ sourceContractKey: 'docs/abc/source-contract/c.pdf' });
    const { service, storageService } = buildService(doc);
    storageService.objectExists.mockResolvedValue(false);

    await expect(
      service.confirmSourceContract(doc._id.toString(), doc.ownerId, 'owner@example.com'),
    ).rejects.toThrow('Contract upload was not found in storage. Please upload the file again.');
  });

  it('logs an audit event and returns the document DTO when the object exists', async () => {
    const doc = buildDoc({ sourceContractKey: 'docs/abc/source-contract/c.pdf' });
    const { service, auditService } = buildService(doc);

    const result = await service.confirmSourceContract(
      doc._id.toString(),
      doc.ownerId,
      'owner@example.com',
    );

    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        documentId: doc._id,
        actorEmail: 'owner@example.com',
        eventType: AuditEventType.DocumentSourceContractAttached,
      }),
    );
    expect(result._id).toBe(doc._id.toString());
  });
});
```

(Check how other tests in this file assert on the returned DTO's `_id` shape — `toDocumentDto` stringifies `_id` — match that existing convention if it differs.)

- [ ] **Step 7: Run the tests to verify they fail**

Run: `npm run --workspace apps/api test -- documents.service.spec.ts -t "confirmSourceContract"`
Expected: FAIL with `service.confirmSourceContract is not a function`.

- [ ] **Step 8: Implement `confirmSourceContract`**

Add this method right after `attachSourceContract`. Check the top of `documents.service.ts` for how `toDocumentDto` is imported/used by `confirmUpload` and reuse the same import:

```ts
async confirmSourceContract(
  documentId: string,
  clerkId: string,
  actorEmail: string,
): Promise<DocumentDto> {
  const doc = await this.findOwnedDocument(documentId, clerkId);
  if (!doc.sourceContractKey) {
    throw new BadRequestException('No source contract attachment pending');
  }
  if (!(await this.storageService.objectExists(doc.sourceContractKey))) {
    throw new BadRequestException(
      'Contract upload was not found in storage. Please upload the file again.',
    );
  }
  this.auditService.log({
    documentId: doc._id,
    actorId: clerkId,
    actorEmail,
    eventType: AuditEventType.DocumentSourceContractAttached,
    metadata: { fileKey: doc.sourceContractKey },
  });
  return toDocumentDto(doc);
}
```

- [ ] **Step 9: Run the tests to verify they pass**

Run: `npm run --workspace apps/api test -- documents.service.spec.ts -t "confirmSourceContract"`
Expected: PASS (3 tests)

- [ ] **Step 10: Add the controller endpoints**

In `apps/api/src/documents/documents.controller.ts`, add these two handlers right after the existing `confirm` handler (before `summarize`):

```ts
@Post(':id/source-contract')
attachSourceContract(
  @CurrentUser() user: CurrentUserPayload,
  @Param('id') id: string,
) {
  return this.documentsService.attachSourceContract(id, user.clerkId);
}

@Post(':id/source-contract/confirm')
confirmSourceContract(
  @CurrentUser() user: CurrentUserPayload,
  @Param('id') id: string,
) {
  if (!user.email) throw new BadRequestException('No email on token');
  return this.documentsService.confirmSourceContract(id, user.clerkId, user.email);
}
```

- [ ] **Step 11: Run the full API test suite**

Run: `npm run --workspace apps/api test`
Expected: PASS, no failures.

- [ ] **Step 12: Commit**

```bash
git add apps/api/src/documents/documents.service.ts apps/api/src/documents/documents.controller.ts apps/api/src/documents/documents.service.spec.ts
git commit -m "feat: add source-contract attach/confirm endpoints"
```

---

### Task 3: Generalize text-source resolution for summarize and extract-form-values

**Files:**
- Modify: `apps/api/src/documents/documents.service.ts`
- Test: `apps/api/src/documents/documents.service.spec.ts`

- [ ] **Step 1: Write the failing test for `summarizeDocument` preferring `sourceContractKey`**

Add to the existing `describe('DocumentsService.summarizeDocument', ...)` block (or create one if it doesn't exist — check first) in `documents.service.spec.ts`:

```ts
it('reads text from sourceContractKey when present, even if fileKey is also set', async () => {
  const doc = buildDoc({
    description: null,
    fileKey: 'docs/abc/original.pdf',
    sourceContractKey: 'docs/abc/source-contract/c.pdf',
  });
  const { service, storageService } = buildService(doc);

  await service.summarizeDocument(doc._id.toString(), doc.ownerId);

  expect(storageService.downloadObject).toHaveBeenCalledWith('docs/abc/source-contract/c.pdf');
});

it('falls back to fileKey when sourceContractKey is absent', async () => {
  const doc = buildDoc({
    description: null,
    fileKey: 'docs/abc/original.pdf',
    sourceContractKey: null,
  });
  const { service, storageService } = buildService(doc);

  await service.summarizeDocument(doc._id.toString(), doc.ownerId);

  expect(storageService.downloadObject).toHaveBeenCalledWith('docs/abc/original.pdf');
});
```

- [ ] **Step 2: Run the tests to verify they fail or pass for the wrong reason**

Run: `npm run --workspace apps/api test -- documents.service.spec.ts -t "summarizeDocument"`
Expected: the first test FAILS (currently calls `downloadObject` with `'docs/abc/original.pdf'`, not the source contract key); the second test passes already.

- [ ] **Step 3: Add the `resolveTextSourceKey` helper and use it in `summarizeDocument`**

In `apps/api/src/documents/documents.service.ts`, add this private method near `docFormFieldSnapshot`/`toFormFieldTemplates`:

```ts
private resolveTextSourceKey(doc: DocumentDocument): string | null {
  return doc.sourceContractKey ?? doc.fileKey ?? null;
}
```

Update `summarizeDocument` (currently around line 228) — replace:

```ts
    let text = '';
    if (doc.fileKey) {
      const pdfBuffer = await this.storageService.downloadObject(doc.fileKey);
      text = await this.aiService.extractPdfText(pdfBuffer);
    }
```

with:

```ts
    let text = '';
    const sourceKey = this.resolveTextSourceKey(doc);
    if (sourceKey) {
      const pdfBuffer = await this.storageService.downloadObject(sourceKey);
      text = await this.aiService.extractPdfText(pdfBuffer);
    }
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm run --workspace apps/api test -- documents.service.spec.ts -t "summarizeDocument"`
Expected: PASS

- [ ] **Step 5: Write the failing test for `extractFormValues` using the resolved source key and full Haknasot field list**

Add to the existing `describe('DocumentsService.extractFormValues', ...)` block:

```ts
it('uses sourceContractKey as the text source when fileKey is null', async () => {
  const doc = buildDoc({
    fileKey: null,
    sourceContractKey: 'docs/abc/source-contract/c.pdf',
    formTemplateId: HAKNASOT_FORM_TEMPLATE_ID,
    formFields: [],
  });
  const { service, storageService, aiService } = buildService(doc);

  await service.extractFormValues(doc._id.toString(), doc.ownerId);

  expect(storageService.downloadObject).toHaveBeenCalledWith('docs/abc/source-contract/c.pdf');
  const [, fields] = aiService.extractFormFieldValues.mock.calls[0];
  expect(fields.length).toBe(getHaknasotFormFields().length);
});

it('throws when there is no fileKey and no sourceContractKey', async () => {
  const doc = buildDoc({ fileKey: null, sourceContractKey: null });
  const { service } = buildService(doc);

  await expect(
    service.extractFormValues(doc._id.toString(), doc.ownerId),
  ).rejects.toThrow('Document has no contract to extract values from');
});
```

Add the import at the top of the spec file if not already present:

```ts
import { HAKNASOT_FORM_TEMPLATE_ID, getHaknasotFormFields } from '@docflow/shared';
```

(Check the existing import block first — `@docflow/shared` may already be imported in this file; merge into the existing import statement rather than duplicating it.)

- [ ] **Step 6: Run the tests to verify they fail**

Run: `npm run --workspace apps/api test -- documents.service.spec.ts -t "extractFormValues"`
Expected: the first new test FAILS because `docFormFieldSnapshot` returns `[]` for a doc with no custom `formFields`, so `aiService.extractFormFieldValues` is never called; the second new test FAILS with the old message `'Document has no uploaded PDF'`.

- [ ] **Step 7: Update `extractFormValues`**

In `apps/api/src/documents/documents.service.ts`, replace the current body of `extractFormValues` (around line 344):

```ts
  async extractFormValues(
    documentId: string,
    clerkId: string,
  ): Promise<{ values: Record<string, string> }> {
    const doc = await this.findOwnedDocument(documentId, clerkId);
    if (!doc.fileKey) {
      throw new BadRequestException('Document has no uploaded PDF');
    }
    const fields = this.docFormFieldSnapshot(doc).map((f) => ({ id: f.id, label: f.label }));
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

with:

```ts
  async extractFormValues(
    documentId: string,
    clerkId: string,
  ): Promise<{ values: Record<string, string> }> {
    const doc = await this.findOwnedDocument(documentId, clerkId);
    const sourceKey = this.resolveTextSourceKey(doc);
    if (!sourceKey) {
      throw new BadRequestException('Document has no contract to extract values from');
    }
    const fields = this.toFormFieldTemplates(doc).map((f) => ({ id: f.id, label: f.label }));
    if (fields.length === 0) {
      return { values: doc.formValues ?? {} };
    }
    const pdfBuffer = await this.storageService.downloadObject(sourceKey);
    const text = await this.aiService.extractPdfText(pdfBuffer);
    const extracted = await this.aiService.extractFormFieldValues(text, fields);
    doc.formValues = { ...(doc.formValues ?? {}), ...extracted };
    doc.markModified('formValues');
    await doc.save();
    return { values: doc.formValues };
  }
```

- [ ] **Step 8: Run the tests to verify they pass**

Run: `npm run --workspace apps/api test -- documents.service.spec.ts -t "extractFormValues"`
Expected: PASS (all tests in this describe block, old and new)

- [ ] **Step 9: Run the full API test suite**

Run: `npm run --workspace apps/api test`
Expected: PASS, no failures.

- [ ] **Step 10: Commit**

```bash
git add apps/api/src/documents/documents.service.ts apps/api/src/documents/documents.service.spec.ts
git commit -m "feat: prefer sourceContractKey over fileKey as AI text source, resolve full Haknasot field list"
```

---

### Task 4: Frontend — insert the `attach-contract` wizard step

**Files:**
- Modify: `apps/web/app/documents/new/NewDocumentClient.tsx`
- Modify: `apps/web/lib/i18n/locales/en.ts`
- Modify: `apps/web/lib/i18n/locales/he.ts`

- [ ] **Step 1: Add i18n keys**

In `apps/web/lib/i18n/locales/en.ts`, in the `newDocument` block, add these keys near the other `step*` keys (after `stepReview` at line 222):

```ts
    stepAttachContract: 'Attach contract',
```

And near `dropPdf`/`supportedFormats` (after line 225's `supportedFormats` entry), add:

```ts
    attachContractTitle: 'Attach the contract',
    attachContractBody:
      'Upload the signed contract or agreement this document is based on. We use it to write a summary and pre-fill the form for you.',
```

In `apps/web/lib/i18n/locales/he.ts`, in the matching `newDocument` block, add the Hebrew equivalents at the same relative positions:

```ts
    stepAttachContract: 'צירוף חוזה',
```

```ts
    attachContractTitle: 'צרפו את החוזה',
    attachContractBody:
      'העלו את החוזה או ההסכם החתום שעליו מבוסס המסמך. נשתמש בו כדי לכתוב תקציר ולמלא את הטופס באופן אוטומטי.',
```

- [ ] **Step 2: Extend the `Step` union and `progressOrder`**

In `apps/web/app/documents/new/NewDocumentClient.tsx`, update the `Step` type (lines 45-52):

```ts
type Step =
  | 'start'
  | 'attach-contract'
  | 'form'
  | 'form-setup'
  | 'form-fill'
  | 'details'
  | 'workflow'
  | 'review';
```

Update `progressOrder` (lines 839-847):

```ts
function progressOrder(docSource: DocSource | null): Step[] {
  if (docSource === 'template') {
    return ['start', 'attach-contract', 'form', 'details', 'workflow', 'review'];
  }
  if (docSource === 'upload') {
    return ['start', 'form-setup', 'form-fill', 'details', 'workflow', 'review'];
  }
  if (docSource === 'saved_pdf') {
    return ['start', 'attach-contract', 'details', 'workflow', 'review'];
  }
  return ['start', 'details', 'workflow', 'review'];
}
```

Update `ProgressIndicator`'s `stepLabels` (lines 858-866):

```ts
  const stepLabels: Record<Step, string> = {
    start: t('newDocument.stepStart'),
    'attach-contract': t('newDocument.stepAttachContract'),
    form: t('newDocument.stepForm'),
    'form-setup': t('newDocument.stepFormSetup'),
    'form-fill': t('newDocument.stepFormFill'),
    details: t('newDocument.stepDetails'),
    workflow: t('newDocument.stepWorkflow'),
    review: t('newDocument.stepReview'),
  };
```

- [ ] **Step 3: Add the `attachSourceContract` handler function**

In `apps/web/app/documents/new/NewDocumentClient.tsx`, add this function right after `startUploadedDocument` (after line 300, before `signerNamesFromTemplateFields`):

```ts
  async function attachSourceContract(file: File) {
    if (!documentId) return;
    if (!isSupportedDocumentUpload(file)) {
      setError(t('newDocument.unsupportedFile'));
      return;
    }
    setError(null);
    setBusy(true);
    setUploadPhase(isWordFile(file) ? 'converting' : 'uploading');
    try {
      let pdfFile = file;
      if (isWordFile(file)) {
        const pdfBlob = await convertWordToPdf(file, api.postFormData);
        pdfFile = pdfFileFromBlob(pdfBlob, file.name);
        setUploadPhase('uploading');
      }

      const { uploadUrl } = await api.post<{ uploadUrl: string; fileKey: string }>(
        `/documents/${documentId}/source-contract`,
      );
      const uploadRes = await fetch(uploadUrl, {
        method: 'PUT',
        body: pdfFile,
        headers: { 'Content-Type': 'application/pdf' },
      });
      if (!uploadRes.ok) {
        throw new Error(t('newDocument.uploadFailed'));
      }

      setUploadPhase('processing');
      await api.post(`/documents/${documentId}/source-contract/confirm`);

      try {
        await api.post(`/documents/${documentId}/summarize`);
      } catch {
        // Description stays blank — same fallback behavior as the upload flow.
      }
      try {
        await api.post(`/documents/${documentId}/extract-form-values`);
      } catch {
        // Leave form values blank — same fallback behavior as the upload flow.
      }

      const latestDoc = await api.get<DocumentDto>(`/documents/${documentId}`);
      setDoc(latestDoc);
      setDescription(latestDoc.description ?? '');
      setFormValues(latestDoc.formValues ?? {});
      setStep(docSource === 'template' ? 'form' : 'details');
    } catch (err) {
      setError(err instanceof Error ? err.message : t('newDocument.uploadFailed'));
    } finally {
      setBusy(false);
      setUploadPhase('idle');
    }
  }
```

- [ ] **Step 4: Wire `startHaknasotDocument` and `startFromSavedTemplate` to land on `attach-contract`**

In `startHaknasotDocument`, change line 165 from:

```ts
      setStep('form');
```

to:

```ts
      setStep('attach-contract');
```

In `startFromSavedTemplate`, change lines 389-391 from:

```ts
      setSteps(hydrated);
      setStep('details');
      void requestSummarize(doc._id);
```

to:

```ts
      setSteps(hydrated);
      setStep('attach-contract');
```

- [ ] **Step 5: Add the `AttachContractStep` component**

Add this new component in `apps/web/app/documents/new/NewDocumentClient.tsx` right after the `StartStep` component's closing brace (find where `StartStep` ends, before `FormSetupStep` or whichever component follows it):

```tsx
function AttachContractStep({
  busy,
  uploadPhase,
  onAttach,
  onBack,
}: {
  busy: boolean;
  uploadPhase: UploadPhase;
  onAttach: (file: File) => void;
  onBack: () => void;
}) {
  const { t } = useTranslation();
  const fileInputEl = useRef<HTMLInputElement | null>(null);
  const [dragOver, setDragOver] = useState(false);

  function handleFile(file: File | undefined) {
    if (!file || busy) return;
    onAttach(file);
  }

  const uploadStatusMessage =
    uploadPhase === 'converting'
      ? t('newDocument.convertingToPdf')
      : uploadPhase === 'uploading'
        ? t('newDocument.uploadingDocument')
        : uploadPhase === 'processing'
          ? t('newDocument.processingDocument')
          : null;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-medium">{t('newDocument.attachContractTitle')}</h2>
        <p className="mt-1 text-sm text-gray-600">{t('newDocument.attachContractBody')}</p>
      </div>
      {uploadPhase !== 'idle' ? (
        <div
          className="rounded-lg border border-gray-200 bg-gray-50 px-6 py-8"
          aria-busy="true"
          aria-live="polite"
        >
          <PdfLoadingSkeleton />
          {uploadStatusMessage && (
            <p className="mt-4 text-center text-sm text-gray-600">{uploadStatusMessage}</p>
          )}
        </div>
      ) : (
        <div
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') fileInputEl.current?.click();
          }}
          onClick={() => !busy && fileInputEl.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            handleFile(e.dataTransfer.files[0]);
          }}
          className={`flex min-h-[200px] cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed px-6 py-10 text-center transition-colors ${
            dragOver
              ? 'border-black bg-gray-50'
              : 'border-gray-300 bg-white hover:border-gray-400'
          } ${busy ? 'pointer-events-none opacity-50' : ''}`}
        >
          <p className="text-sm text-gray-600">{t('newDocument.dropPdf')}</p>
          <p className="mt-2 text-xs text-gray-400">{t('newDocument.supportedFormats')}</p>
        </div>
      )}
      <input
        ref={fileInputEl}
        type="file"
        accept={DOCUMENT_UPLOAD_ACCEPT}
        className="sr-only"
        onChange={(e) => {
          const file = e.target.files?.[0];
          handleFile(file);
          e.target.value = '';
        }}
      />
      <div className="flex justify-start">
        <button
          type="button"
          onClick={onBack}
          disabled={busy}
          className="rounded border border-gray-300 bg-white px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          {t('common.back')}
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Add the render branch**

In the render switch (around line 717-726), add a new branch right after the `step === 'start'` block:

```tsx
      {step === 'attach-contract' && (
        <AttachContractStep
          busy={busy}
          uploadPhase={uploadPhase}
          onAttach={attachSourceContract}
          onBack={() => setStep('start')}
        />
      )}
```

- [ ] **Step 7: Update the `form` step's `onBack` and the `details` step's `onBack`**

Update the `step === 'form' && docSource === 'template'` render block (lines 736-745) to pass `onBack`:

```tsx
      {step === 'form' && docSource === 'template' && formFields.length > 0 && (
        <FormFillStep
          formTemplateId={HAKNASOT_FORM_TEMPLATE_ID}
          fields={formFields}
          values={formValues}
          busy={busy}
          onNext={handleFormNext}
          onSkip={goToDetails}
          onBack={() => setStep('attach-contract')}
        />
      )}
```

Update the `DetailsStep`'s `onBack` (lines 793-802):

```tsx
          onBack={() => {
            if (docSource === 'template') {
              setStep('form');
            } else if (docSource === 'upload') {
              const fields = doc ? resolveDocumentFormFields(doc) : [];
              setStep(fields.length > 0 ? 'form-fill' : 'form-setup');
            } else if (docSource === 'saved_pdf') {
              setStep('attach-contract');
            } else {
              setStep('start');
            }
          }}
```

- [ ] **Step 8: Type-check and build the web app**

Run: `npm run --workspace apps/web build`
Expected: exits 0, no TypeScript errors.

- [ ] **Step 9: Commit**

```bash
git add apps/web/app/documents/new/NewDocumentClient.tsx apps/web/lib/i18n/locales/en.ts apps/web/lib/i18n/locales/he.ts
git commit -m "feat: add mandatory attach-contract wizard step before form-fill/details"
```

---

### Task 5: Fix e2e tests broken by the new mandatory step

**Files:**
- Modify: `tests/e2e/new-document.spec.ts`
- Modify: `tests/e2e/send-sign-download.spec.ts`

- [ ] **Step 1: Confirm the sample PDF fixture exists**

Run: `ls apps/web/public/samples/haknasot.pdf`
Expected: file exists (this is the real local PDF used as the attached contract in tests; it is already used as a fixture by `installPdfMock` in `new-document.spec.ts`).

- [ ] **Step 2: Add new mock branches to `installApiMocks` in `tests/e2e/new-document.spec.ts`**

In the `installApiMocks(page, calls)` function (lines 96-178), inside the route handler's branch chain, add new branches right after the existing `POST /documents` branch and before the catch-all 404. Match the file's existing style (reading `pathname`/`method` from the request and calling `route.fulfill`):

```ts
    if (method === 'POST' && pathname === '/documents/doc-e2e/source-contract') {
      calls.push({ method, pathname });
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          uploadUrl: 'http://127.0.0.1:3001/storage/local/mock-source-contract-upload',
          fileKey: 'docs/doc-e2e/source-contract/mock.pdf',
        }),
      });
      return;
    }
    if (method === 'PUT' && pathname === '/storage/local/mock-source-contract-upload') {
      calls.push({ method, pathname });
      await route.fulfill({ status: 200, body: '' });
      return;
    }
    if (method === 'POST' && pathname === '/documents/doc-e2e/source-contract/confirm') {
      calls.push({ method, pathname });
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockDocument()),
      });
      return;
    }
    if (method === 'POST' && pathname === '/documents/doc-e2e/extract-form-values') {
      calls.push({ method, pathname });
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ values: {} }),
      });
      return;
    }
    if (method === 'GET' && pathname === '/documents/doc-e2e') {
      calls.push({ method, pathname });
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockDocument()),
      });
      return;
    }
```

(The mock `PUT` URL uses `127.0.0.1:3001` so it's intercepted by the same `page.route` matcher that already covers `http://(127.0.0.1|localhost):3001/.*` — check the matcher pattern at the top of `installApiMocks` to confirm this URL falls inside it; if the matcher is scoped differently, adjust the mock `uploadUrl` host/port to match exactly what the existing matcher intercepts.)

- [ ] **Step 3: Add the attach-contract step to the first affected test**

In the test `'creates a Haknasot document through the mocked wizard flow'` (starts at line 258), find where it clicks "Start form" and currently proceeds straight to form-step assertions. Insert this block immediately after the "Start form" click and before the first form-step assertion:

```ts
    await page.locator('input[type="file"]').setInputFiles(
      path.join(process.cwd(), 'apps/web/public/samples/haknasot.pdf'),
    );
```

Then keep the test's existing next assertion unchanged — it now lands on the form step after the mocked attach+confirm+summarize+extract-form-values round trip completes. Add the `path` import at the top of the file if not already present:

```ts
import path from 'node:path';
```

(Check the existing imports at the top of `tests/e2e/new-document.spec.ts` first — `path` may already be imported for another reason; do not duplicate the import.)

- [ ] **Step 4: Add the attach-contract step to the second affected test**

In the test `'Haknasot form step exposes checkbox fields and saves them'` (starts at line 357), apply the identical fix: after the "Start form" click, insert:

```ts
    await page.locator('input[type="file"]').setInputFiles(
      path.join(process.cwd(), 'apps/web/public/samples/haknasot.pdf'),
    );
```

before the test's existing first form-step assertion.

- [ ] **Step 5: Run the new-document e2e suite**

Run: `npx playwright test tests/e2e/new-document.spec.ts`
Expected: PASS, all tests green.

- [ ] **Step 6: Update `createHaknasotDocAsSelfSigner` in `tests/e2e/send-sign-download.spec.ts`**

In the helper `createHaknasotDocAsSelfSigner(page)` (lines 58-141), find the click on `"Start form"` (line 77) and the subsequent expectation of `"Skip for now"` (line 86). Insert the attach step between them:

```ts
  await page.getByRole('button', { name: 'Start form' }).click();
  await page.locator('input[type="file"]').setInputFiles(
    path.join(process.cwd(), 'apps/web/public/samples/haknasot.pdf'),
  );
  await expect(page.getByRole('button', { name: 'Skip for now' })).toBeVisible({
    timeout: 20_000,
  });
```

(This test hits the real dev API, so the attach → confirm → summarize → extract-form-values round trip takes real network time — use a generous timeout like the `20_000` above rather than the default. Check the file's existing timeout conventions for real-API waits and match them if a different value is already standard in this file.) Add the `path` import at the top of the file if not already present:

```ts
import path from 'node:path';
```

(Check existing imports first — do not duplicate.)

- [ ] **Step 7: Run the send-sign-download e2e suite against the real dev stack**

Start the dev stack if not already running: `npm run dev` (in a separate terminal/background process), then run:

Run: `npx playwright test tests/e2e/send-sign-download.spec.ts`
Expected: PASS, all tests green. (If the API isn't reachable, the test's own `beforeEach` skip-guard will skip rather than fail — confirm this still behaves correctly.)

- [ ] **Step 8: Commit**

```bash
git add tests/e2e/new-document.spec.ts tests/e2e/send-sign-download.spec.ts
git commit -m "test: update e2e wizard flows for the new mandatory attach-contract step"
```

---

### Task 6: Full verification pass

- [ ] **Step 1: Run the full API unit test suite**

Run: `npm run --workspace apps/api test`
Expected: PASS, 0 failures.

- [ ] **Step 2: Run the full web build**

Run: `npm run --workspace apps/web build`
Expected: exits 0.

- [ ] **Step 3: Run the full Playwright e2e suite**

Run: `npx playwright test`
Expected: PASS, 0 failures (API-dependent tests skip cleanly if the dev stack isn't running).

- [ ] **Step 4: Manually verify in the browser**

Start the dev stack (`npm run dev`), open `/documents/new`, click "Start form" on the Haknasot card, confirm the new "Attach the contract" step appears with a dropzone, attach `apps/web/public/samples/haknasot.pdf`, confirm it proceeds to the form-fill step with the description/summary populated. Repeat by selecting a saved PDF template and confirming the attach step appears before "Details" with the same behavior.
