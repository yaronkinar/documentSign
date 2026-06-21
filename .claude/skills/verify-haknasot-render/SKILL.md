---
name: verify-haknasot-render
description: >-
  Verify changes to the Haknasot form PDF output end-to-end by driving the live
  API and visually inspecting the rendered pages. Use this whenever you touch
  Haknasot rendering, signature/approval-row placement, form-field stamping,
  checkbox/contract-type drawing, or the template — i.e. anything under
  apps/api/src/documents/haknasot-renderer.ts, the MUNICIPAL_APPROVAL_*/
  HAKNASOT_FORM_FIELDS layout in packages/shared, or renderHaknasotDocument —
  and you want to confirm the actual PDF looks right (not just that tests pass).
  Also use it to simply render/inspect a Haknasot PDF when there is no
  pdftoppm/ghostscript/ImageMagick available.
---

# Verify Haknasot PDF rendering

Tests and typecheck prove the logic; they do **not** prove the flattened PDF
looks right. The Haknasot signature/field placement is geometric and only
trustworthy when you actually look at the rendered pages. This skill drives the
real download endpoint and rasterizes the result.

## The two gotchas that waste the most time

1. **The API runs in Docker, serving a baked image.** `docker-compose.yml`
   syncs `apps/api/src` into the container but uses `action: rebuild` for
   `packages/shared/src` — and *both* only apply while `docker compose watch`
   is running. If you edited shared code (e.g. `approval-template.ts`,
   `template-signature-fields.ts`, `haknasot-form.ts`) and just hit the
   endpoint, **you are verifying stale code.** Always rebuild the `api`
   container first (Step 1). Symptom of staleness: your fix has no effect even
   though unit tests pass.

2. **There is no PDF rasterizer on this box.** `pdftoppm`, `ghostscript`, and
   ImageMagick are absent; the `convert` on PATH is the Windows builtin and
   will error on `-density`. The Read tool also can't rasterize (it shells out
   to `pdftoppm`). Use the bundled `scripts/render-pdf-pages.mjs` instead
   (Step 4).

## Workflow

### Step 1 — Make the running API serve your code

If you changed anything under `packages/shared/src` (or you're unsure), rebuild
the api image; mongo/redis/web keep running and the dev DB (a mongo volume)
persists, so existing test documents survive:

```bash
docker compose up -d --build api
# wait for health
for i in $(seq 1 30); do curl -s -m3 http://localhost:3001/health && break; sleep 2; done
```

If you only touched `apps/api/src` and `docker compose watch` is actively
running, the file sync + in-container `nest start --watch` may already have
reloaded — but a rebuild is the reliable guarantee. When in doubt, rebuild.

### Step 2 — Create + sign a document that exercises the change

`scripts/create-document.mjs` creates a Haknasot doc, fills the sample values,
adds the signers, submits, and dev-signs everyone (bypass-auth dev endpoint;
default bearer `dev-bypass-token-local`). Choose signers that hit your case.

```bash
node scripts/create-document.mjs \
  --template haknasot \
  --title "VERIFY $(date +%H%M%S)" \
  --form-file scripts/haknasot-sample-values.json \
  --signer 'אישור מנהל האגף <row0@docflow-test.local>' \
  --signer 'אישור מנכ"ל העירייה <ceo@docflow-test.local>' \
  --dev-sign-all
```

It prints the new document id. Notes that matter for approval-row work:

- A signer's **name is matched to an approval role by title**
  (`resolveApprovalRowIndices` / `signerLabelsMatch`). To land a signer on a
  specific row, name them with that role's title from
  `MUNICIPAL_APPROVAL_SIGNER_TITLES` (e.g. `אישור מנכ"ל העירייה` → row 11).
- For all 11 rows at once, `scripts/create-approved-haknasot.mjs` seeds the full
  canonical chain.
- The **partial / out-of-order** approver set (e.g. just rows 1 and 11) is the
  high-value case — it's where sequential-vs-role bugs surface. Prefer it over a
  full ordered set.

### Step 3 — Download the *rendered* PDF from the live endpoint

This is the surface that real downloads use (`renderHaknasotDocument`):

```bash
ID=<document-id-from-step-2>
curl -s -H "Authorization: Bearer dev-bypass-token-local" \
  "http://localhost:3001/documents/$ID/rendered.pdf" -o scripts/.out/_verify.pdf
```

To re-check an existing doc after a rebuild, skip Step 2 and just re-download by
its id — the document persists in mongo.

### Step 4 — Rasterize and look

```bash
# one-time, does not modify package.json:
npm i --no-save @napi-rs/canvas

node .claude/skills/verify-haknasot-render/scripts/render-pdf-pages.mjs \
  scripts/.out/_verify.pdf 3,4 2.0 scripts/.out
```

Then Read the produced `scripts/.out/_page3.png` / `_page4.png`. Signature/
approval rows are pages **3–4**; form fields are pages **1–2**.

Reading the result:
- Judge placement by the **Hebrew** text (names, role labels) — embedded Noto
  renders correctly.
- **Latin dates render as blank white boxes here** (standard Helvetica glyph
  outlines aren't in pdfjs; you'll see `getPathGenerator ignoring character`
  warnings). The box marks where the date sits; it IS in the real PDF. Don't
  report a missing date as a bug from this rasterizer — confirm in a real viewer
  if it matters.

## What to check, and probe

Confirm the happy path, then push on it (this is verification, not a replay):

- Each signer's name sits in its **correct role row** on the right page (rows
  1–7 → page 3, rows 8–11 → page 4).
- The role label, name (שם), signature (חתימה), and date (תאריך) columns line up
  within the row.
- Re-run with a **different / partial** signer set — that's the case that broke
  before. Out-of-order titles should still land on their role rows.

## Cleanup

Leftovers from a session: scratch PNGs and `_verify*.pdf` under `scripts/.out/`,
and `VERIFY …` test documents in the dev mongo. Harmless, but remove the scratch
files when done if you want a clean tree (`scripts/.out` is for throwaway output).
