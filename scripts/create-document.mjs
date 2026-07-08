/**
 * Automation: create a document with signers and submit it to workflow.
 *
 * Usage:
 *   node scripts/create-document.mjs [options]
 *
 * Options:
 *   --title "..."              Document title (default: "Test Document <timestamp>")
 *   --template haknasot        Use the haknasot form template instead of uploading a PDF
 *   --pdf path/to/file.pdf     Upload this PDF file
 *   --signer "name <email>"    Add a signer (can repeat; at least one required)
 *   --step-label "..."         Label for the first workflow step (default: "חתימה")
 *   --form-file path/to/values.json   Load form values from a JSON file
 *   --form key=value           Set a single form value (can repeat)
 *   --submit                   Submit the document after creation (default: false)
 *   --dev-sign-all             After submitting, sign every signer via the dev endpoint (bypass-auth only)
 *   --api http://...           API base URL (default: http://localhost:3001)
 *   --token "..."              Bearer token (default: dev-bypass-token-local)
 *
 * Examples:
 *   # Haknasot with sample values + two signers, auto-submit
 *   node scripts/create-document.mjs \
 *     --template haknasot \
 *     --title "חוזה הכנסות 2026" \
 *     --form-file scripts/haknasot-sample-values.json \
 *     --signer "יוסי כהן <yossi@example.com>" \
 *     --signer "רחל לוי <rachel@example.com>" \
 *     --submit
 *
 *   # Override individual fields on top of the sample file
 *   node scripts/create-document.mjs \
 *     --template haknasot \
 *     --form-file scripts/haknasot-sample-values.json \
 *     --form supplier_name="חברה אחרת בע\"מ" \
 *     --form contract_number=CN-2026-999 \
 *     --signer "Alice <alice@acme.com>"
 *
 *   # Custom PDF upload
 *   node scripts/create-document.mjs \
 *     --pdf contracts/agreement.pdf \
 *     --title "Service Agreement" \
 *     --signer "Alice <alice@acme.com>" \
 *     --submit
 */

import fs from 'node:fs';
import path from 'node:path';
import { chromium } from '@playwright/test';

// ---------------------------------------------------------------------------
// Argument parsing
// ---------------------------------------------------------------------------

const argv = process.argv.slice(2);

function getArg(flag) {
  const i = argv.indexOf(flag);
  return i !== -1 && argv[i + 1] ? argv[i + 1] : null;
}

function getAllArgs(flag) {
  const results = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === flag && argv[i + 1]) results.push(argv[i + 1]);
  }
  return results;
}

function hasFlag(flag) {
  return argv.includes(flag);
}

const API = getArg('--api') ?? 'http://localhost:3001';
const TOKEN = getArg('--token') ?? 'dev-bypass-token-local';
const TITLE = getArg('--title') ?? `Test Document ${new Date().toISOString().slice(0, 16)}`;
const TEMPLATE = getArg('--template');
const PDF_PATH = getArg('--pdf');
const STEP_LABEL = getArg('--step-label') ?? 'חתימה';
const SHOULD_SUBMIT = hasFlag('--submit') || hasFlag('--dev-sign-all');
const DEV_SIGN_ALL = hasFlag('--dev-sign-all');
const FORM_FILE = getArg('--form-file');

const rawSigners = getAllArgs('--signer');

if (rawSigners.length === 0) {
  console.error('Error: at least one --signer is required.');
  console.error('  e.g. --signer "Alice <alice@example.com>"');
  process.exit(1);
}

if (!TEMPLATE && !PDF_PATH) {
  console.error('Error: provide either --template <id> or --pdf <path>');
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Form values  --form-file + --form overrides
// ---------------------------------------------------------------------------

let formValues = {};

if (FORM_FILE) {
  const resolved = path.resolve(FORM_FILE);
  if (!fs.existsSync(resolved)) {
    console.error(`Error: form file not found: ${resolved}`);
    process.exit(1);
  }
  formValues = JSON.parse(fs.readFileSync(resolved, 'utf8'));
  console.log(`Loaded ${Object.keys(formValues).length} form values from ${FORM_FILE}`);
}

// --form key=value overrides (applied on top of file)
for (const raw of getAllArgs('--form')) {
  const eq = raw.indexOf('=');
  if (eq === -1) { console.warn(`  Warning: ignoring malformed --form "${raw}" (expected key=value)`); continue; }
  const key = raw.slice(0, eq).trim();
  const value = raw.slice(eq + 1);
  formValues[key] = value;
}

// ---------------------------------------------------------------------------
// Signer parsing  "Name <email>" → { name, email }
// ---------------------------------------------------------------------------

function parseSigner(raw) {
  const m = raw.match(/^(.+?)\s*<([^>]+)>$/);
  if (m) return { name: m[1].trim(), email: m[2].trim().toLowerCase() };
  return { name: null, email: raw.trim().toLowerCase() };
}

const signers = rawSigners.map(parseSigner);

// ---------------------------------------------------------------------------
// API helpers
// ---------------------------------------------------------------------------

async function api(method, endpoint, body) {
  const url = `${API}${endpoint}`;
  const opts = {
    method,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  };
  const res = await fetch(url, opts);
  if (!res.ok) {
    let msg;
    try { msg = (await res.json()).message; } catch { msg = await res.text(); }
    throw new Error(`${method} ${endpoint} → ${res.status}: ${msg}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

async function uploadBinary(uploadUrl, fileBuffer) {
  const res = await fetch(uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/pdf' },
    body: fileBuffer,
  });
  if (!res.ok) throw new Error(`S3 upload failed: ${res.status}`);
}

async function uploadPng(uploadUrl, pngBuffer) {
  const res = await fetch(uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': 'image/png' },
    body: pngBuffer,
  });
  if (!res.ok) throw new Error(`PNG upload failed: ${res.status}`);
}

/**
 * Renders a cursive signature PNG for each signer via Playwright canvas,
 * uploads each to storage, and returns { email → imageKey }.
 */
async function generateSignatureImages(signers, docId) {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  const dateStr = new Date().toLocaleDateString('he-IL', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });

  const imageKeys = {};

  for (const signer of signers) {
    const displayName = signer.name ?? signer.email.split('@')[0];

    const html = `<!DOCTYPE html><html><head>
<style>*{margin:0;padding:0}body{background:white}</style>
</head><body>
<canvas id="c" width="300" height="100"></canvas>
<script>
const c = document.getElementById('c');
const ctx = c.getContext('2d');
ctx.fillStyle = 'white';
ctx.fillRect(0, 0, 300, 100);
ctx.font = 'italic bold 26px Georgia, "Times New Roman", serif';
ctx.fillStyle = '#111166';
ctx.textBaseline = 'alphabetic';
ctx.fillText(${JSON.stringify(displayName)}, 10, 52);
ctx.font = '13px Arial, Helvetica, sans-serif';
ctx.fillStyle = '#555555';
ctx.fillText(${JSON.stringify(dateStr)}, 10, 78);
<\/script>
</body></html>`;

    await page.setContent(html, { waitUntil: 'domcontentloaded' });

    const dataUrl = await page.evaluate(() =>
      document.getElementById('c').toDataURL('image/png'),
    );
    const base64 = dataUrl.replace(/^data:image\/png;base64,/, '');
    const pngBuffer = Buffer.from(base64, 'base64');

    // Get a presigned upload URL from the API
    const { uploadUrl, imageKey } = await api('POST', `/documents/${docId}/signatures/upload-url`);
    await uploadPng(uploadUrl, pngBuffer);

    imageKeys[signer.email] = imageKey;
    console.log(`  Signature uploaded for ${displayName} <${signer.email}>`);
  }

  await browser.close();
  return imageKeys;
}

// ---------------------------------------------------------------------------
// Main flow
// ---------------------------------------------------------------------------

console.log('=== DocFlow document automation ===\n');

// STEP 1 – Create document
let doc;
if (TEMPLATE) {
  console.log(`Creating template document (${TEMPLATE}): "${TITLE}" …`);
  doc = await api('POST', '/documents', { title: TITLE, formTemplateId: TEMPLATE });
  console.log(`  Created: ${doc._id}`);
} else {
  const pdfBuffer = fs.readFileSync(path.resolve(PDF_PATH));
  console.log(`Creating document from PDF "${PDF_PATH}": "${TITLE}" …`);
  const { uploadUrl, documentId } = await api('POST', '/documents', { title: TITLE });
  console.log(`  Created: ${documentId}  (uploading ${pdfBuffer.length} bytes …)`);

  await uploadBinary(uploadUrl, pdfBuffer);
  console.log('  PDF uploaded.');

  const pageMatches = pdfBuffer.toString('latin1').match(/\/Type\s*\/Page[^s]/g);
  const pageCount = pageMatches ? pageMatches.length : 1;

  doc = await api('POST', `/documents/${documentId}/confirm`, {
    fileSize: pdfBuffer.length,
    pageCount,
  });
  console.log(`  Confirmed: ${pageCount} page(s).`);
}

const docId = doc._id;

// STEP 2 – Save form values (if any)
if (Object.keys(formValues).length > 0) {
  console.log(`\nSaving ${Object.keys(formValues).length} form values …`);
  doc = await api('PATCH', `/documents/${docId}/form-values`, { values: formValues });
  console.log('  Form values saved.');
}

// STEP 3 – Add workflow step with signers
console.log(`\nAdding workflow step "${STEP_LABEL}" with ${signers.length} signer(s):`);
signers.forEach((s) => console.log(`  • ${s.name ?? '(no name)'}  <${s.email}>`));

doc = await api('POST', `/documents/${docId}/steps`, {
  label: STEP_LABEL,
  stepType: 'signature',
  executionMode: 'parallel',
  signers,
});

const step = doc.workflowSteps?.[0];
console.log(`  Step created: ${step?._id}`);

// STEP 4 – (Optional) Submit
if (SHOULD_SUBMIT) {
  console.log('\nSubmitting document to workflow …');
  doc = await api('PATCH', `/documents/${docId}/submit`);
  console.log(`  Status: ${doc.status}`);
} else {
  console.log('\nDocument is in DRAFT – pass --submit to send invites.');
}

// STEP 5 – (Optional) Dev-sign all pending signers
if (DEV_SIGN_ALL) {
  console.log('\nGenerating signature images …');
  const imageKeys = await generateSignatureImages(signers, docId);

  console.log('\nSigning all signers via dev endpoint …');
  doc = await api('POST', `/documents/${docId}/dev/sign-all`, { imageKeys });
  console.log(`  Status: ${doc.status}`);
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

console.log('\n=== Done ===');
console.log(`  Document ID : ${docId}`);
console.log(`  Title       : ${doc.title}`);
console.log(`  Status      : ${doc.status}`);
if (Object.keys(formValues).length > 0) {
  console.log(`  Form values : ${Object.keys(formValues).length} fields`);
}
console.log(`  Signers     :`);
for (const s of (step?.signers ?? doc.workflowSteps?.[0]?.signers ?? [])) {
  console.log(`    • ${s.name ?? s.email}  (${s.status})`);
}
console.log(`\n  View: http://localhost:3000/documents/${docId}`);
