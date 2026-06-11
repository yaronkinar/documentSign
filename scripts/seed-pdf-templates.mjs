/**
 * Seed PDF templates from apps/web/public/samples into the current user's account.
 *
 * Requires API with BYPASS_AUTH=true (default dev-bypass-token-local).
 *
 * Usage:
 *   node scripts/seed-pdf-templates.mjs
 *   node scripts/seed-pdf-templates.mjs --replace
 *   API_URL=http://127.0.0.1:3001 node scripts/seed-pdf-templates.mjs
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const DEFINITIONS_PATH = path.join(ROOT, 'scripts', 'pdf-template-definitions.json');
const SAMPLES_DIR = path.join(ROOT, 'apps', 'web', 'public', 'samples');

const API = process.env.API_URL ?? 'http://127.0.0.1:3001';
const TOKEN = process.env.BYPASS_TOKEN ?? 'dev-bypass-token-local';
const REPLACE = process.argv.includes('--replace');

async function api(method, pathname, body) {
  const res = await fetch(`${API}${pathname}`, {
    method,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!res.ok) {
    const msg =
      data && typeof data === 'object' && 'message' in data
        ? String(data.message)
        : text || res.statusText;
    throw new Error(`${method} ${pathname} → ${res.status}: ${msg}`);
  }
  return data;
}

async function seedTemplate(def, existingByName) {
  const pdfPath = path.join(SAMPLES_DIR, def.filename);
  if (!fs.existsSync(pdfPath)) {
    throw new Error(`PDF not found: ${pdfPath}`);
  }

  const pdfBytes = fs.readFileSync(pdfPath);
  const current = existingByName.get(def.name);

  if (current) {
    if (!REPLACE) {
      console.log(`  skip     ${def.name} (already exists)`);
      return { action: 'skipped' };
    }
    await api('DELETE', `/templates/${current._id}`);
    console.log(`  replaced ${def.name}`);
  }

  const { uploadUrl, templateId } = await api('POST', '/templates', {
    name: def.name,
  });

  const uploadRes = await fetch(uploadUrl, {
    method: 'PUT',
    body: pdfBytes,
    headers: { 'Content-Type': 'application/pdf' },
  });
  if (!uploadRes.ok) {
    throw new Error(`Upload failed for ${def.name}: ${uploadRes.status}`);
  }

  await api('POST', `/templates/${templateId}/confirm`, {
    fileSize: pdfBytes.length,
    pageCount: def.pageCount,
  });

  await api('PATCH', `/templates/${templateId}`, {
    fields: def.fields,
  });

  console.log(
    `  created  ${def.name} (${def.fields.length} fields, ${def.pageCount} page${def.pageCount === 1 ? '' : 's'})`,
  );
  return { action: current ? 'replaced' : 'created', templateId };
}

async function main() {
  const definitions = JSON.parse(fs.readFileSync(DEFINITIONS_PATH, 'utf8'));
  const existing = await api('GET', '/templates');
  const existingByName = new Map(existing.map((t) => [t.name.trim(), t]));

  let created = 0;
  let skipped = 0;
  let replaced = 0;

  for (const def of definitions) {
    const result = await seedTemplate(def, existingByName);
    if (result.action === 'skipped') skipped += 1;
    else if (result.action === 'replaced') replaced += 1;
    else created += 1;
  }

  console.log(
    `\nDone. ${definitions.length} templates (${created} created, ${replaced} replaced, ${skipped} skipped).`,
  );
  console.log('Open /templates in the app to review signature field positions.');
}

main().catch((err) => {
  console.error(err.message ?? err);
  console.error(
    '\nEnsure API is running with BYPASS_AUTH=true (npm run dev:api).',
  );
  process.exit(1);
});
