/**
 * Smoke-test PDF text extraction + AI signer-role extraction (same pipeline as the API).
 *
 * Usage:
 *   node scripts/test-extract-signers.mjs [--pdf path.pdf]
 *
 * Requires OPENAI_API_KEY in apps/api/.env or the environment.
 * Default PDF: apps/web/public/samples/mock-signers-extraction.pdf
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const DEFAULT_PDF = path.join(
  root,
  'apps',
  'web',
  'public',
  'samples',
  'mock-signers-extraction.pdf',
);

function getArg(flag) {
  const i = process.argv.indexOf(flag);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : null;
}

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  for (const line of fs.readFileSync(filePath, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

async function extractPdfText(buffer) {
  const { PDFParse } = await import('pdf-parse');
  const parser = new PDFParse({ data: buffer });
  try {
    const result = await parser.getText();
    return result.text.replace(/\s+/g, ' ').trim();
  } finally {
    await parser.destroy();
  }
}

async function extractSignerRoles(text) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is not set (check apps/api/.env)');
  }

  const trimmed = text.slice(0, 12_000);
  if (!trimmed) return [];

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
        {
          role: 'system',
          content:
            'You extract the list of signer/approver roles from a document. ' +
            'Look for signature blocks, approval lines, or signatory sections. ' +
            'Return ONLY a JSON object with a single key "signers" whose value is an array of role/title strings. ' +
            'Keep the original language of the document. Remove duplicates. ' +
            'Example: {"signers": ["מנהל האגף", "יועץ משפטי", "גזבר העירייה"]}',
        },
        {
          role: 'user',
          content: `Document text:\n${trimmed}`,
        },
      ],
    }),
  });

  if (!res.ok) {
    const errBody = await res.text().catch(() => '');
    throw new Error(`AI signer extraction failed (${res.status}): ${errBody.slice(0, 300)}`);
  }

  const data = await res.json();
  const raw = data.choices?.[0]?.message?.content?.trim();
  if (!raw) return [];

  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed.signers)) return [];
  return parsed.signers
    .filter((s) => typeof s === 'string' && s.trim().length > 0)
    .map((s) => s.trim());
}

async function main() {
  loadEnvFile(path.join(root, 'apps', 'api', '.env'));

  const pdfPath = path.resolve(getArg('--pdf') ?? DEFAULT_PDF);
  if (!fs.existsSync(pdfPath)) {
    console.error(`PDF not found: ${pdfPath}`);
    console.error('Run: node scripts/generate-mock-signers-pdf.mjs');
    process.exit(1);
  }

  const buffer = fs.readFileSync(pdfPath);
  console.log(`PDF: ${pdfPath} (${buffer.length} bytes)\n`);

  const text = await extractPdfText(buffer);
  console.log('--- Extracted text (first 800 chars) ---');
  console.log(text.slice(0, 800) || '(empty — pdf-parse may not read embedded Hebrew fonts)');
  console.log(`\nTotal extracted length: ${text.length} chars\n`);

  if (!text) {
    console.error(
      'No text extracted. Signer AI extraction will return []. Try the English mock: --locale en when generating.',
    );
    process.exit(1);
  }

  console.log('--- AI signer roles ---');
  const signers = await extractSignerRoles(text);
  if (signers.length === 0) {
    console.log('(none)');
    process.exit(1);
  }
  for (const s of signers) console.log(`  • ${s}`);
  console.log(`\nOK: ${signers.length} signer role(s) detected`);
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
