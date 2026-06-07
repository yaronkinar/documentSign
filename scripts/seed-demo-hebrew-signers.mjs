/**
 * Seed Hebrew demo signer profiles for the haknasot form template.
 * Used before recording the product demo so workflow steps show pre-filled roles.
 *
 * Requires API with BYPASS_AUTH=true (default dev-bypass-token-local).
 *
 * Usage:
 *   node scripts/seed-demo-hebrew-signers.mjs
 *   API_URL=http://127.0.0.1:3001 node scripts/seed-demo-hebrew-signers.mjs
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const SIGNERS_PATH = path.join(ROOT, 'scripts', 'demo-hebrew-signers.json');
const TEMPLATE_ID = 'haknasot';

const API = process.env.API_URL ?? 'http://127.0.0.1:3001';
const TOKEN = process.env.BYPASS_TOKEN ?? 'dev-bypass-token-local';

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

async function main() {
  const signers = JSON.parse(fs.readFileSync(SIGNERS_PATH, 'utf8'));
  const existing = await api(
    'GET',
    `/signer-profiles?templateId=${encodeURIComponent(TEMPLATE_ID)}`,
  );
  const byTitle = new Map(existing.map((p) => [p.title.trim(), p]));

  let created = 0;
  let updated = 0;

  for (const signer of signers) {
    const title = signer.title.trim();
    const name = signer.name.trim();
    const email = signer.email.trim().toLowerCase();
    const current = byTitle.get(title);

    if (current) {
      if (current.name !== name || (current.email ?? '') !== email) {
        await api('PATCH', `/signer-profiles/${current._id}`, { name, email });
        updated += 1;
        console.log(`  updated  ${title} → ${name} <${email}>`);
      } else {
        console.log(`  ok       ${title}`);
      }
      continue;
    }

    await api('POST', '/signer-profiles', {
      templateId: TEMPLATE_ID,
      title,
      name,
      email,
    });
    created += 1;
    console.log(`  created  ${title} → ${name} <${email}>`);
  }

  console.log(
    `\nDone. ${signers.length} roles (${created} created, ${updated} updated).`,
  );
}

main().catch((err) => {
  console.error(err.message ?? err);
  console.error(
    '\nEnsure API is running with BYPASS_AUTH=true (npm run dev:api).',
  );
  process.exit(1);
});
