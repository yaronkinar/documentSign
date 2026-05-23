/**
 * Converts the haknasot Word source (.doc/.docx) to a PDF that the existing
 * generate-haknasot-pdf pipeline picks up as the canonical source.
 *
 * Run: npm run convert:haknasot-doc
 *
 * Input  (override with HAKNASOT_DOC_PATH): %USERPROFILE%\Downloads\haknasot (3).doc
 * Output: apps/web/public/samples/haknasot-source.pdf
 *
 * Requires Microsoft Word installed (Windows-only — uses Word.Application COM).
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

const defaultInput = path.join(process.env.USERPROFILE ?? '', 'Downloads', 'haknasot (3).doc');
const inputPath = path.resolve(process.env.HAKNASOT_DOC_PATH || defaultInput);
const outputPath = path.join(root, 'apps', 'web', 'public', 'samples', 'haknasot-source.pdf');

if (process.platform !== 'win32') {
  console.error('convert-haknasot-doc: only Windows is supported (uses MS Word COM).');
  process.exit(1);
}

if (!fs.existsSync(inputPath)) {
  console.error(`convert-haknasot-doc: input not found: ${inputPath}`);
  console.error('Set HAKNASOT_DOC_PATH to override the default path.');
  process.exit(1);
}

fs.mkdirSync(path.dirname(outputPath), { recursive: true });

// PowerShell single-quoted strings: escape embedded single quotes by doubling them.
const psEscape = (s) => s.replace(/'/g, "''");

const psScript = `
$ErrorActionPreference = 'Stop'
$inputPath  = '${psEscape(inputPath)}'
$outputPath = '${psEscape(outputPath)}'
$word = $null
$doc = $null
try {
  $word = New-Object -ComObject Word.Application
  $word.Visible = $false
  $word.DisplayAlerts = 0
  $doc = $word.Documents.Open($inputPath, $false, $true)
  $wdFormatPDF = 17
  $doc.SaveAs([ref] $outputPath, [ref] $wdFormatPDF)
} finally {
  if ($doc -ne $null) { $doc.Close($false) | Out-Null }
  if ($word -ne $null) { $word.Quit() | Out-Null }
  if ($doc  -ne $null) { [System.Runtime.InteropServices.Marshal]::ReleaseComObject($doc)  | Out-Null }
  if ($word -ne $null) { [System.Runtime.InteropServices.Marshal]::ReleaseComObject($word) | Out-Null }
  [GC]::Collect()
  [GC]::WaitForPendingFinalizers()
}
`;

const result = spawnSync(
  'powershell.exe',
  ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', psScript],
  { stdio: ['ignore', 'inherit', 'inherit'] },
);

if (result.error) {
  console.error('convert-haknasot-doc: failed to spawn PowerShell:', result.error.message);
  process.exit(1);
}

if (result.status !== 0) {
  console.error(`convert-haknasot-doc: PowerShell exited with status ${result.status}.`);
  console.error('Make sure Microsoft Word is installed and accessible via COM.');
  process.exit(result.status ?? 1);
}

if (!fs.existsSync(outputPath)) {
  console.error(`convert-haknasot-doc: expected output not produced at ${outputPath}`);
  process.exit(1);
}

console.log(`Converted ${inputPath}`);
console.log(`     -> ${outputPath}`);
