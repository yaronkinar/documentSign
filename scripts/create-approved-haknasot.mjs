/**
 * Creates a fully approved haknasot document with all 11 municipal signers.
 * Requires bypass auth (BYPASS_AUTH=true in .env files).
 *
 * Usage: node scripts/create-approved-haknasot.mjs [--title "..."] [--api url] [--token tok]
 */
import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

const titleArg = process.argv.find((a, i) => process.argv[i - 1] === '--title');
const title = titleArg ?? `חוזה הכנסות – ${new Date().toLocaleDateString('he-IL')}`;

const apiArg = process.argv.find((a, i) => process.argv[i - 1] === '--api');
const tokenArg = process.argv.find((a, i) => process.argv[i - 1] === '--token');
const apiFlag = apiArg ? `--api "${apiArg}"` : '';
const tokenFlag = tokenArg ? `--token "${tokenArg}"` : '';

const SIGNERS = [
  'דוד כהן <row0@docflow-test.local>',
  'רחל לוי <row1@docflow-test.local>',
  'אבי שפירא <row2@docflow-test.local>',
  'מיכל אברהם <row3@docflow-test.local>',
  'יוסי מזרחי <row4@docflow-test.local>',
  'שרה ביטון <row5@docflow-test.local>',
  'רונן פרץ <row6@docflow-test.local>',
  'ליאת אזולאי <row7@docflow-test.local>',
  'אורי דהן <row8@docflow-test.local>',
  'תמר חדד <row9@docflow-test.local>',
  'איתן אוחנה <row10@docflow-test.local>',
];

const signerFlags = SIGNERS.map((s) => `--signer "${s}"`).join(' ');

const cmd = [
  'node scripts/create-document.mjs',
  `--template haknasot`,
  `--title "${title}"`,
  `--form-file scripts/haknasot-sample-values.json`,
  signerFlags,
  '--dev-sign-all',
  apiFlag,
  tokenFlag,
].filter(Boolean).join(' ');

console.log('Running:', cmd, '\n');
execSync(cmd, { cwd: root, stdio: 'inherit' });
