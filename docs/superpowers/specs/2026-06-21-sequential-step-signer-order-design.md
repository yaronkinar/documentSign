# Sequential signing within a step — design

## Problem

`WorkflowStep.executionMode` can be `'sequential'` or `'parallel'` (see
[document.schema.ts](../../../apps/api/src/documents/document.schema.ts)) but
the value is never read anywhere in the signing flow. Today, regardless of
`executionMode`:

- `InvitesService.sendStepInvites` emails **every** pending signer in a step
  at once.
- `WorkflowService.recordSignature` lets any signer whose own status is
  `'pending'` sign, with no check on other signers in the step.

So "sequential" is a no-op. This design makes it real: when a step is
`'sequential'`, signers must act in `signers[]` array order — signer N can't
be invited or sign until signer N-1 has signed or been skipped by the owner.

## Goals

- Enforce in-step signer order for `executionMode: 'sequential'`.
- Reuse the exact same "whose turn is it" logic on both backend (enforcement)
  and frontend (display), so they can't drift apart.
- Leave `'parallel'` steps and cross-step ordering (`currentStep`/
  `stepNumber`) untouched.

## Non-goals

- No new `order` field on `Signer` — array position **is** the order.
- No change to how steps advance relative to each other.
- No retry/auto-resume logic for rejected signers — a rejection halts the
  chain until the owner resolves it (see below).

## Behavior decisions (confirmed with user)

- **Order source:** `signers[]` array order.
- **Invite timing:** invites are sent one at a time, in order — signer N+1's
  invite is only sent once signer N has signed or been skipped.
- **Rejection:** if signer N rejects, the chain halts. Signer N+1 is *not*
  invited until the owner skips the rejected signer (existing `skipSigner`
  flow) or otherwise resolves it. This matches current behavior, where a
  rejection alone doesn't auto-resolve anything.
- **Frontend:** included in this design (not backend-only) — show whose turn
  it is and disable signing for out-of-turn signers.

## Design

### 1. Shared helper — `packages/shared`

Add a pure function, exported from `packages/shared/src/index.ts`:

```ts
export function getActiveSequentialSigner<
  S extends { status: SignerStatus },
>(signers: S[]): S | null {
  for (const signer of signers) {
    if (signer.status === 'signed' || signer.status === 'skipped') continue;
    if (signer.status === 'rejected') return null; // chain halted
    return signer; // first 'pending' signer in order
  }
  return null; // all resolved
}
```

This is the single source of truth for "whose turn is it in a sequential
step," used by both the API (enforcement) and the web app (display). It only
needs `status`, so it works against both the Mongoose `Signer` subdocument
and the `SignerDto` shape.

### 2. Backend enforcement

**`InvitesService.sendStepInvites`** (`apps/api/src/invites/invites.service.ts`):
- If `step.executionMode === 'sequential'`, restrict the set of signers to
  invite to `getActiveSequentialSigner(step.signers)` (a single signer, or
  none). For `'parallel'`, behavior is unchanged (invite all pending).

**`WorkflowService.recordSignature`** (`apps/api/src/workflow/workflow.service.ts`):
- After locating the signer (existing logic), if `step.executionMode ===
  'sequential'`, also require that the located signer is
  `getActiveSequentialSigner(step.signers)`. If not, throw
  `BadRequestException('Not your turn to sign yet')`.
  - This check is necessary in addition to invite-gating: registered (Clerk)
    users can call `/sign` via Bearer auth without an invite token, so a
    logged-in signer #2 could otherwise sign out of turn.
- After marking the signer `'signed'`, if the step is not yet `allDone` and
  is sequential, call `sendStepInvites(doc, step)` again so the new active
  signer (signer N+1) gets invited.

**`WorkflowService.recordRejection`**:
- Same active-signer check as `recordSignature` — a signer can only reject
  while it's their turn in a sequential step.
- No change to what happens after rejection (no auto-advance), per the halt
  decision above.

**`WorkflowService.skipSigner`** (owner action):
- No turn-gating change — the owner can already skip any `'pending'` signer
  regardless of order, and this remains the escape hatch for a halted
  (rejected) chain.
- After marking `'skipped'`, if the step is not yet `allDone` and is
  sequential, call `sendStepInvites(doc, step)` again, same as
  `recordSignature`.

**`WorkflowService.addSigner`**:
- No change needed. It appends to the end of `signers[]` and already calls
  `sendStepInvites(doc, step)` when the step is `in_progress`. Since that
  call now respects `executionMode`, a newly added signer in a sequential
  step is naturally invited only once their turn comes up.

### 3. Frontend

**`DocumentViewerClient.tsx`** (`apps/web/app/documents/[id]/DocumentViewerClient.tsx`):
- `canSign` (currently `!!mySignerInActiveStep && doc.status ===
  'pending_signature'`) gains an extra condition for sequential steps:
  `mySignerInActiveStep` must equal
  `getActiveSequentialSigner(activeStep.signers)`. For `'parallel'` steps,
  unchanged.

**Sidebar signer list / `SignerRow`** (same file, around the
`WorkflowSidebar`/`SignerRow` components):
- For a sequential step, a `'pending'` signer who is *not* the active signer
  gets a distinct "waiting" indicator (e.g. a muted "Waiting for {previous
  signer's name/email}" label) instead of the normal pending icon. The
  active signer keeps the existing pending look.
- No new API fields required — the frontend already receives the full
  `signers[]` array with statuses per step, so it computes the active signer
  client-side via the same shared helper.

## Testing

- Unit tests for `getActiveSequentialSigner` (shared package): empty array,
  all signed, first pending, pending after a skip, halts on rejected.
- `WorkflowService` tests (extending `workflow.service.spec.ts`):
  - Sequential step: second signer cannot sign before the first
    (`BadRequestException`).
  - Sequential step: signing the first signer triggers an invite to the
    second (assert `invitesService.sendStepInvites` called again / second
    signer's `inviteSentAt` set).
  - Sequential step: rejecting the first signer does *not* invite/enable the
    second; skipping the rejected signer then does.
  - Parallel step: behavior unchanged (all signers invited up front, any can
    sign in any order).
- Frontend: a small test or manual check (per `verify`/`run` skill) that
  `canSign` is false for a non-active signer in a sequential step, and that
  the waiting label renders.
