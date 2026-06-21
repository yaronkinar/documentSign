# Sequential Step Signer Order Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `WorkflowStep.executionMode === 'sequential'` actually enforce in-order signing within a step — signer N can't be invited or sign until signer N-1 has signed or been skipped — on both backend and frontend.

**Architecture:** Add one pure helper, `getActiveSequentialSigner`, to `packages/shared` as the single source of truth for "whose turn is it." The API enforces it in `InvitesService.sendStepInvites` (who gets emailed) and `WorkflowService.recordSignature`/`recordRejection` (who's allowed to act). The web app uses the same helper to disable the sign button and label out-of-turn signers as "waiting" — no new API fields needed since the frontend already has the full `signers[]` array.

**Tech Stack:** NestJS + Mongoose (apps/api), Next.js + React (apps/web), shared TS package (packages/shared), Jest (api tests), Vitest (shared package tests).

**Spec:** `docs/superpowers/specs/2026-06-21-sequential-step-signer-order-design.md`

---

## Task 1: Shared helper — `getActiveSequentialSigner`

**Files:**
- Create: `packages/shared/src/signer-order.ts`
- Create: `packages/shared/src/signer-order.test.ts`
- Modify: `packages/shared/src/index.ts` (add re-export)

- [ ] **Step 1: Write the failing test**

Create `packages/shared/src/signer-order.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { getActiveSequentialSigner } from './signer-order.js';

function signer(status: 'pending' | 'signed' | 'rejected' | 'skipped', email: string) {
  return { status, email };
}

describe('getActiveSequentialSigner', () => {
  it('returns null for an empty list', () => {
    expect(getActiveSequentialSigner([])).toBeNull();
  });

  it('returns the first signer when all are pending', () => {
    const signers = [signer('pending', 'a@test.com'), signer('pending', 'b@test.com')];
    expect(getActiveSequentialSigner(signers)).toBe(signers[0]);
  });

  it('skips signed and skipped signers to find the next pending one', () => {
    const signers = [
      signer('signed', 'a@test.com'),
      signer('skipped', 'b@test.com'),
      signer('pending', 'c@test.com'),
    ];
    expect(getActiveSequentialSigner(signers)).toBe(signers[2]);
  });

  it('returns null when a rejected signer blocks the chain', () => {
    const signers = [
      signer('signed', 'a@test.com'),
      signer('rejected', 'b@test.com'),
      signer('pending', 'c@test.com'),
    ];
    expect(getActiveSequentialSigner(signers)).toBeNull();
  });

  it('returns null when every signer is resolved', () => {
    const signers = [signer('signed', 'a@test.com'), signer('skipped', 'b@test.com')];
    expect(getActiveSequentialSigner(signers)).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run from `packages/shared`: `npx vitest run src/signer-order.test.ts`
Expected: FAIL — cannot find module `./signer-order.js`

- [ ] **Step 3: Write the implementation**

Create `packages/shared/src/signer-order.ts`:

```ts
import type { SignerStatus } from './index.js';

/**
 * In a sequential workflow step, signers must act in array order. Returns
 * the signer whose turn it currently is, or null if the chain is halted
 * (a signer ahead rejected) or every signer is already resolved.
 */
export function getActiveSequentialSigner<S extends { status: SignerStatus }>(
  signers: S[],
): S | null {
  for (const signer of signers) {
    if (signer.status === 'signed' || signer.status === 'skipped') continue;
    if (signer.status === 'rejected') return null;
    return signer;
  }
  return null;
}
```

- [ ] **Step 4: Re-export from the package entrypoint**

In `packages/shared/src/index.ts`, after the `ExecutionMode` type (around line 58), add:

```ts
export type ExecutionMode = 'sequential' | 'parallel';

export { getActiveSequentialSigner } from './signer-order.js';
```

- [ ] **Step 5: Run test to verify it passes**

Run from `packages/shared`: `npx vitest run src/signer-order.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 6: Build the shared package so dist/ picks up the change**

Run from `packages/shared`: `npm run build`
Expected: exits 0, `dist/signer-order.js` and `dist/signer-order.d.ts` are created/updated.

- [ ] **Step 7: Commit**

```bash
git add packages/shared/src/signer-order.ts packages/shared/src/signer-order.test.ts packages/shared/src/index.ts packages/shared/dist
git commit -m "feat: add getActiveSequentialSigner shared helper for in-step signer order"
```

---

## Task 2: Enforce sequential invites in `InvitesService.sendStepInvites`

**Files:**
- Modify: `apps/api/src/invites/invites.service.ts:56-87`

- [ ] **Step 1: Write the failing test**

There is no existing test file for `InvitesService`. Add a focused one.

Create `apps/api/src/invites/invites.service.spec.ts`:

```ts
import { InvitesService } from './invites.service';

function buildStep(executionMode: 'sequential' | 'parallel') {
  return {
    _id: 'step1',
    executionMode,
    signers: [
      { _id: 's1', email: 'a@test.com', name: null, status: 'pending', inviteTokenHash: null, inviteExpiry: null, inviteSentAt: null },
      { _id: 's2', email: 'b@test.com', name: null, status: 'pending', inviteTokenHash: null, inviteExpiry: null, inviteSentAt: null },
    ],
  } as never;
}

function buildDoc() {
  return {
    _id: 'doc1',
    title: 'Test doc',
    save: jest.fn().mockResolvedValue(undefined),
  } as never;
}

function buildService() {
  const documentModel = {};
  const notifications = { enqueueInviteEmail: jest.fn().mockResolvedValue(undefined) };
  process.env.INVITE_TOKEN_SECRET = 'test-secret';
  const service = new InvitesService(documentModel as never, notifications as never);
  return { service, notifications };
}

describe('InvitesService.sendStepInvites - sequential gating', () => {
  it('invites only the first signer when executionMode is sequential', async () => {
    const step = buildStep('sequential');
    const doc = buildDoc();
    const { service, notifications } = buildService();

    await service.sendStepInvites(doc, step);

    expect(notifications.enqueueInviteEmail).toHaveBeenCalledTimes(1);
    expect(notifications.enqueueInviteEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'a@test.com' }),
    );
    expect(step.signers[1].inviteSentAt).toBeNull();
  });

  it('invites every pending signer when executionMode is parallel', async () => {
    const step = buildStep('parallel');
    const doc = buildDoc();
    const { service, notifications } = buildService();

    await service.sendStepInvites(doc, step);

    expect(notifications.enqueueInviteEmail).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run from `apps/api`: `npx jest invites.service.spec.ts`
Expected: FAIL — first test fails because `enqueueInviteEmail` is called twice, not once (sequential mode not yet enforced).

- [ ] **Step 3: Implement the gating**

In `apps/api/src/invites/invites.service.ts`, add the import (after the existing `findSignerOnStep` import on line 13):

```ts
import { findSignerOnStep } from '../documents/signer.utils';
import { getActiveSequentialSigner } from '@docflow/shared';
```

Then replace the `sendStepInvites` body (lines 56-87):

```ts
  async sendStepInvites(
    doc: DocumentDocument,
    step: WorkflowStep,
  ): Promise<void> {
    const pending =
      step.executionMode === 'sequential'
        ? [getActiveSequentialSigner(step.signers)].filter(
            (s): s is NonNullable<typeof s> => s !== null,
          )
        : step.signers.filter((s) => s.status === 'pending');
    if (pending.length === 0) return;

    const jobs: SendInviteEmailJob[] = [];
    for (const signer of pending) {
      const { token, tokenHash, expiry } = await this.generateInviteToken(
        String(doc._id),
        signer.email,
        String(step._id),
      );
      signer.inviteTokenHash = tokenHash;
      signer.inviteExpiry = expiry;
      signer.inviteSentAt = new Date();
      jobs.push({
        to: signer.email,
        signerName: signer.name ?? signer.email,
        documentTitle: doc.title,
        documentId: String(doc._id),
        token,
      });
    }

    await doc.save();

    for (const job of jobs) {
      await this.notifications.enqueueInviteEmail(job);
    }
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run from `apps/api`: `npx jest invites.service.spec.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/invites/invites.service.ts apps/api/src/invites/invites.service.spec.ts
git commit -m "feat: only invite the active signer for sequential workflow steps"
```

---

## Task 3: Gate `recordSignature` and `recordRejection` on turn order, and advance the chain

**Files:**
- Modify: `apps/api/src/workflow/workflow.service.ts:92-267`
- Modify: `apps/api/src/workflow/workflow.service.spec.ts` (extend)

- [ ] **Step 1: Write the failing tests**

Extend `apps/api/src/workflow/workflow.service.spec.ts`. First, update the shared `FakeStep`/`buildFinalStepDoc` helpers to support `executionMode` and multiple signers, then add new describe blocks.

Replace the top of the file (the `FakeStep` interface and `buildFinalStepDoc` function, lines 6-54) with:

```ts
import { BadRequestException } from '@nestjs/common';
import { Types } from 'mongoose';

import { WorkflowService } from './workflow.service';

interface FakeSigner {
  _id: string;
  email: string;
  status: string;
  clerkId: string | null;
  signedAt: Date | null;
}

interface FakeStep {
  _id: string;
  stepNumber: number;
  status: string;
  completedAt: Date | null;
  executionMode: 'sequential' | 'parallel';
  signers: FakeSigner[];
}

interface FakeWorkflowSteps extends Array<FakeStep> {
  id: (id: string) => FakeStep | undefined;
}

function buildFinalStepDoc(
  signers: FakeSigner[] = [
    {
      _id: 's1',
      email: 'a@test.com',
      status: 'pending',
      clerkId: null,
      signedAt: null,
    },
  ],
  executionMode: 'sequential' | 'parallel' = 'parallel',
) {
  const steps: FakeStep[] = [
    {
      _id: 'step1',
      stepNumber: 1,
      status: 'in_progress',
      completedAt: null,
      executionMode,
      signers,
    },
  ];
  const workflowSteps = steps as FakeWorkflowSteps;
  workflowSteps.id = (id: string) =>
    workflowSteps.find((s) => String(s._id) === String(id));

  return {
    _id: new Types.ObjectId(),
    ownerId: 'owner1',
    status: 'pending_signature',
    workflowSteps,
    participantClerkIds: [] as string[],
    save: jest.fn().mockResolvedValue(undefined),
  };
}
```

This keeps the existing two `describe` blocks working unchanged (they call `buildFinalStepDoc()` with no args, which still defaults to a single pending parallel signer).

Then add two new `describe` blocks at the end of the file:

```ts
describe('WorkflowService.recordSignature - sequential turn order', () => {
  it('rejects a sign attempt from a signer who is not yet active', async () => {
    const doc = buildFinalStepDoc(
      [
        { _id: 's1', email: 'a@test.com', status: 'pending', clerkId: null, signedAt: null },
        { _id: 's2', email: 'b@test.com', status: 'pending', clerkId: null, signedAt: null },
      ],
      'sequential',
    );
    const { service } = buildService({ commentCount: 0, doc });

    await expect(
      service.recordSignature(String(doc._id), 'step1', 'b@test.com', null, null),
    ).rejects.toThrow(BadRequestException);

    expect(doc.workflowSteps[0].signers[1].status).toBe('pending');
  });

  it('invites the next signer once the active signer signs', async () => {
    const doc = buildFinalStepDoc(
      [
        { _id: 's1', email: 'a@test.com', status: 'pending', clerkId: null, signedAt: null },
        { _id: 's2', email: 'b@test.com', status: 'pending', clerkId: null, signedAt: null },
      ],
      'sequential',
    );
    const { service, invitesService } = buildService({ commentCount: 0, doc });

    await service.recordSignature(String(doc._id), 'step1', 'a@test.com', null, null);

    expect(doc.workflowSteps[0].signers[0].status).toBe('signed');
    expect(invitesService.sendStepInvites).toHaveBeenCalledWith(doc, doc.workflowSteps[0]);
  });

  it('allows any pending signer to sign in parallel mode', async () => {
    const doc = buildFinalStepDoc(
      [
        { _id: 's1', email: 'a@test.com', status: 'pending', clerkId: null, signedAt: null },
        { _id: 's2', email: 'b@test.com', status: 'pending', clerkId: null, signedAt: null },
      ],
      'parallel',
    );
    const { service } = buildService({ commentCount: 0, doc });

    await service.recordSignature(String(doc._id), 'step1', 'b@test.com', null, null);

    expect(doc.workflowSteps[0].signers[1].status).toBe('signed');
  });
});

describe('WorkflowService.recordRejection - sequential turn order', () => {
  it('rejects a rejection attempt from a signer who is not yet active', async () => {
    const doc = buildFinalStepDoc(
      [
        { _id: 's1', email: 'a@test.com', status: 'pending', clerkId: null, signedAt: null },
        { _id: 's2', email: 'b@test.com', status: 'pending', clerkId: null, signedAt: null },
      ],
      'sequential',
    );
    const { service } = buildService({ commentCount: 0, doc });

    await expect(
      service.recordRejection(String(doc._id), 'step1', 'b@test.com', 'no', null, null),
    ).rejects.toThrow(BadRequestException);
  });

  it('does not advance the chain when the active signer rejects', async () => {
    const doc = buildFinalStepDoc(
      [
        { _id: 's1', email: 'a@test.com', status: 'pending', clerkId: null, signedAt: null },
        { _id: 's2', email: 'b@test.com', status: 'pending', clerkId: null, signedAt: null },
      ],
      'sequential',
    );
    const { service, invitesService } = buildService({ commentCount: 0, doc });

    await service.recordRejection(String(doc._id), 'step1', 'a@test.com', 'no', null, null);

    expect(doc.workflowSteps[0].signers[0].status).toBe('rejected');
    expect(invitesService.sendStepInvites).not.toHaveBeenCalled();
  });
});
```

Update `buildService` to also return `invitesService` (it's already created inside the function, just add it to the returned object):

```ts
function buildService(options: { commentCount: number; doc: unknown }) {
  const documentModel = {
    findById: jest
      .fn()
      .mockReturnValue({ exec: jest.fn().mockResolvedValue(options.doc) }),
  };
  const userModel = {};
  const commentModel = {
    countDocuments: jest.fn().mockResolvedValue(options.commentCount),
  };
  const invitesService = { sendStepInvites: jest.fn() };
  const auditService = { log: jest.fn() };
  const gateway = { emit: jest.fn() };
  const queue = { add: jest.fn() };

  const service = new WorkflowService(
    documentModel as never,
    userModel as never,
    commentModel as never,
    invitesService as never,
    auditService as never,
    gateway as never,
    queue as never,
  );

  return { service, documentModel, commentModel, invitesService, auditService, gateway };
}
```

- [ ] **Step 2: Run tests to verify the new ones fail**

Run from `apps/api`: `npx jest workflow.service.spec.ts`
Expected: the 5 new tests in the two new `describe` blocks FAIL (turn-order isn't enforced yet, so `recordSignature`/`recordRejection` don't throw, and no extra `sendStepInvites` call happens on advance). The 4 pre-existing tests should still PASS.

- [ ] **Step 3: Implement turn-order enforcement and chain advancement**

In `apps/api/src/workflow/workflow.service.ts`, add the import (line 14, alongside the existing `@docflow/shared` import):

```ts
import {
  AuditEventType,
  getActiveSequentialSigner,
  missingTemplateFieldMappings,
  type DocumentStatus,
} from '@docflow/shared';
```

In `recordSignature`, after the existing signer lookup and pending check (lines 107-115), add the turn-order check:

```ts
    const signer = signerDocumentId
      ? findSignerOnStep(step, signerDocumentId, signerEmail)
      : step.signers.find(
          (s) => s.email === signerEmail && s.status === 'pending',
        );
    if (!signer) throw new NotFoundException('Signer not found');
    if (signer.status !== 'pending') {
      throw new BadRequestException('Signer is not pending');
    }
    if (step.executionMode === 'sequential') {
      const active = getActiveSequentialSigner(step.signers);
      if (!active || String(active._id) !== String(signer._id)) {
        throw new BadRequestException('Not your turn to sign yet');
      }
    }
```

Then, in the `else` branch of the `allDone` check at the bottom of `recordSignature` (currently just `await doc.save();` on line 207-209), advance the sequential chain:

```ts
    } else {
      if (step.executionMode === 'sequential') {
        await doc.save();
        await this.invitesService.sendStepInvites(doc, step);
      } else {
        await doc.save();
      }
    }
```

In `recordRejection`, after the existing signer lookup and pending check (lines 224-228), add the same turn-order check:

```ts
    const signer = step.signers.find((s) => s.email === signerEmail);
    if (!signer) throw new NotFoundException('Signer not found');
    if (signer.status !== 'pending') {
      throw new BadRequestException('Signer already responded');
    }
    if (step.executionMode === 'sequential') {
      const active = getActiveSequentialSigner(step.signers);
      if (!active || String(active._id) !== String(signer._id)) {
        throw new BadRequestException('Not your turn to respond yet');
      }
    }
```

No change to `recordRejection` after that — per the design, a rejection halts the chain, so nothing further is invited.

In `skipSigner`, after marking the signer skipped and re-checking `allDone` (the `if (allDone) { ... }` block starting at line 301), add an `else` branch to advance the chain when the step isn't done yet:

```ts
    signer.status = 'skipped';
    await doc.save();

    this.auditService.log({
      documentId: doc._id,
      actorId: ownerClerkId,
      actorEmail,
      eventType: AuditEventType.SignerSkipped,
      metadata: { stepId: String(step._id), signerEmail },
    });

    // Re-check step completion in case this signer was the last blocker
    const allDone = step.signers.every(
      (s) => s.status === 'signed' || s.status === 'skipped',
    );
    if (allDone) {
      // ...existing completion logic unchanged...
    } else if (step.executionMode === 'sequential') {
      await this.invitesService.sendStepInvites(doc, step);
    }
```

(Only the `else if` branch is new — the existing `if (allDone) { ... }` body is unchanged.)

- [ ] **Step 4: Run tests to verify they pass**

Run from `apps/api`: `npx jest workflow.service.spec.ts`
Expected: PASS (9 tests total — 4 pre-existing + 5 new).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/workflow/workflow.service.ts apps/api/src/workflow/workflow.service.spec.ts
git commit -m "feat: enforce sequential signer turn order in recordSignature/recordRejection"
```

---

## Task 4: Frontend — disable sign action and show "waiting" state for out-of-turn signers

**Files:**
- Modify: `apps/web/app/documents/[id]/DocumentViewerClient.tsx:254-262` (canSign)
- Modify: `apps/web/app/documents/[id]/DocumentViewerClient.tsx:1636-1677` (WorkflowSidebar/SignerRow)
- Modify: `apps/web/lib/i18n/locales/en.ts:200-205` (signerStatus block)
- Modify: `apps/web/lib/i18n/locales/he.ts:202-207` (signerStatus block)

- [ ] **Step 1: Add the translation key**

In `apps/web/lib/i18n/locales/en.ts`, update the `signerStatus` block (lines 200-205):

```ts
  signerStatus: {
    pending: 'Pending',
    signed: 'Signed',
    rejected: 'Rejected',
    skipped: 'Skipped',
    waiting: 'Waiting for {{name}}',
  },
```

In `apps/web/lib/i18n/locales/he.ts`, update the `signerStatus` block (lines 202-207):

```ts
  signerStatus: {
    pending: 'ממתין',
    signed: 'נחתם',
    rejected: 'נדחה',
    skipped: 'דולג',
    waiting: 'מחכה ל{{name}}',
  },
```

- [ ] **Step 2: Import the shared helper and gate `canSign`**

In `apps/web/app/documents/[id]/DocumentViewerClient.tsx`, update the `@docflow/shared` import (lines 7-18) to include `getActiveSequentialSigner`:

```ts
import type {
  CommentDto,
  DocumentDto,
  PdfFormFieldType,
  PdfTemplateDto,
  SavedSignatureDto,
  SignatureDto,
  SignatureFieldDto,
  SignerDto,
  SignatureFieldTemplate,
} from '@docflow/shared';
import { getActiveSequentialSigner, resolveDocumentFormFields } from '@docflow/shared';
```

Replace the `canSign` computation (lines 254-262):

```ts
  const activeStep = doc.workflowSteps.find(
    (s) => s.stepNumber === doc.currentStep,
  );
  const mySignerInActiveStep = activeStep?.signers.find(
    (s) =>
      s.status === 'pending' &&
      (s.clerkId === myClerkId || s.email === myEmail),
  );
  const isMySignerActiveTurn =
    !!mySignerInActiveStep &&
    (activeStep?.executionMode !== 'sequential' ||
      getActiveSequentialSigner(activeStep.signers)?._id === mySignerInActiveStep._id);
  const canSign = isMySignerActiveTurn && doc.status === 'pending_signature';
```

- [ ] **Step 3: Run the web typecheck to confirm no breakage**

Run from `apps/web`: `npx tsc --noEmit` (there is no `typecheck` script in `apps/web/package.json`)
Expected: exits 0.

- [ ] **Step 4: Show a "waiting" indicator in the signer list**

In `apps/web/app/documents/[id]/DocumentViewerClient.tsx`, update `WorkflowSidebar` to compute the active signer per step and pass it down (lines 1652-1672):

```tsx
  return (
    <ol className="space-y-4 overflow-auto p-4">
      {doc.workflowSteps.map((step) => {
        const activeSigner =
          step.executionMode === 'sequential'
            ? getActiveSequentialSigner(step.signers)
            : null;
        return (
          <li key={step._id} className="rounded-lg border border-border bg-surface p-3 shadow-sm">
            <div className="mb-2 flex items-center justify-between text-sm font-medium text-fg">
              <span>{step.label}</span>
              <span className="text-xs text-fg-muted">
                {t(`workflowStepStatus.${step.status}`)}
              </span>
            </div>
            <ul className="space-y-1 text-xs">
              {step.signers.map((s) => {
                const isWaiting =
                  step.executionMode === 'sequential' &&
                  s.status === 'pending' &&
                  activeSigner?._id !== s._id;
                return (
                  <SignerRow
                    key={s._id}
                    signer={s}
                    isWaiting={isWaiting}
                    waitingForLabel={activeSigner ? activeSigner.name ?? activeSigner.email : ''}
                    showOwnerControls={isOwner && step.status === 'in_progress' && s.status === 'pending'}
                    resendLoading={resendBusy === s._id}
                    onSkip={() => onSkip(step._id, s._id, s.email)}
                    onResend={() => onResend(step._id, s._id, s.email)}
                  />
                );
              })}
            </ul>
          </li>
        );
      })}
    </ol>
  );
```

- [ ] **Step 5: Update `SignerRow` to render the waiting state**

Replace the `SignerRow` function (lines 1679-1704 plus the props type) with:

```tsx
function SignerRow({
  signer,
  isWaiting,
  waitingForLabel,
  showOwnerControls,
  resendLoading,
  onSkip,
  onResend,
}: {
  signer: SignerDto;
  isWaiting: boolean;
  waitingForLabel: string;
  showOwnerControls: boolean;
  resendLoading: boolean;
  onSkip: () => void;
  onResend: () => void;
}) {
  const { t } = useTranslation();
  const icon = (() => {
    if (isWaiting) return '⏸';
    switch (signer.status) {
      case 'signed':
        return '✓';
      case 'rejected':
        return '✗';
      case 'skipped':
        return '—';
      default:
        return '⏳';
    }
  })();
  const title = isWaiting
    ? t('signerStatus.waiting', { name: waitingForLabel })
    : t(`signerStatus.${signer.status}`);
  return (
    <li className="flex items-center justify-between rounded-md bg-surface-muted px-2 py-1">
      <span title={title}>
        <span className="me-1">{icon}</span>
        {signer.email}
        {isWaiting && (
          <span className="ms-1 text-fg-muted">({title})</span>
        )}
      </span>
      {showOwnerControls && (
```

(Leave the rest of the function — the owner-controls buttons block — unchanged; only the signature, icon logic, and the `<span title=...>` wrapper above change.)

- [ ] **Step 6: Verify `showOwnerControls` for a non-active sequential signer still makes sense**

`showOwnerControls` is already gated on `s.status === 'pending'`, so the owner can still skip a not-yet-active signer directly if they choose — this is intentional (matches `skipSigner`'s existing behavior of allowing any pending signer to be skipped). No code change needed here; just confirmed by re-reading the prop wiring in Step 4.

- [ ] **Step 7: Manual verification**

Per the `run` skill, start the web + api dev servers and manually walk through:
1. Create a document with one sequential step and two signers.
2. Submit it — confirm only signer #1 receives an invite (check the dev email log/queue output).
3. Sign as signer #1 — confirm signer #2 now receives an invite, and the sidebar shows signer #2 transitioning from "Waiting for ..." to the normal pending icon.
4. Log in as signer #2 before signer #1 has signed (or simulate via API call) — confirm the sign button is disabled/hidden and the sidebar shows "Waiting for {signer #1}".

Expected: each step behaves as described above.

- [ ] **Step 8: Commit**

```bash
git add apps/web/app/documents/\[id\]/DocumentViewerClient.tsx apps/web/lib/i18n/locales/en.ts apps/web/lib/i18n/locales/he.ts
git commit -m "feat: show signer turn order and gate signing UI for sequential steps"
```

---

## Task 5: Final verification

- [ ] **Step 1: Run the full API test suite**

Run from `apps/api`: `npx jest`
Expected: all tests pass, including the new `invites.service.spec.ts` and the extended `workflow.service.spec.ts`.

- [ ] **Step 2: Run the full shared package test suite**

Run from `packages/shared`: `npx vitest run`
Expected: all tests pass, including the new `signer-order.test.ts`.

- [ ] **Step 3: Run the web typecheck**

Run from `apps/web`: `npx tsc --noEmit`
Expected: exits 0.

- [ ] **Step 4: Review the spec one more time against the implementation**

Re-read `docs/superpowers/specs/2026-06-21-sequential-step-signer-order-design.md` and confirm every behavior decision (order source, invite timing, reject handling, frontend scope) is reflected in the code changed across Tasks 1-4.
