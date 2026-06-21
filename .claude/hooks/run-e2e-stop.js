#!/usr/bin/env node
/**
 * Claude Code Stop hook: run Playwright E2E when a turn ends.
 * On failure, blocks the stop and feeds the failures back so the agent keeps
 * fixing — up to MAX_LOOPS times per session, then lets it stop.
 *
 * Migrated from the Cursor stop hook (.cursor/hooks/run-playwright-tests.js).
 * Cursor used `{ followup_message }` + an input `loop_count`; Claude Code uses
 * `{ decision: "block", reason }` and gives no loop counter, so we persist one
 * per session_id under the OS temp dir.
 */
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const MAX_LOOPS = 3;
const MAX_OUTPUT_CHARS = 12_000;

function readStdin() {
  try {
    return fs.readFileSync(0, 'utf8');
  } catch {
    return '';
  }
}

function emit(payload) {
  process.stdout.write(`${JSON.stringify(payload)}\n`);
}

function truncate(text, max = MAX_OUTPUT_CHARS) {
  if (!text || text.length <= max) return text;
  return `…(truncated)\n${text.slice(-max)}`;
}

function main() {
  let input = {};
  const raw = readStdin().trim();
  if (raw) {
    try {
      input = JSON.parse(raw);
    } catch {
      // Ignore malformed stdin; still run tests.
    }
  }

  const sessionId = String(input.session_id ?? 'default').replace(/[^\w.-]/g, '_');
  const counterFile = path.join(os.tmpdir(), `claude-e2e-loop-${sessionId}.txt`);
  let loops = 0;
  try {
    loops = parseInt(fs.readFileSync(counterFile, 'utf8'), 10) || 0;
  } catch {
    // no prior loop for this session
  }

  const result = spawnSync('npm run test:e2e', {
    cwd: path.resolve(__dirname, '..', '..'),
    encoding: 'utf8',
    shell: true,
    env: process.env,
    maxBuffer: 20 * 1024 * 1024,
  });
  const exitCode = result.status ?? 1;

  if (exitCode === 0) {
    try {
      fs.unlinkSync(counterFile);
    } catch {}
    emit({}); // allow stop
    return;
  }

  if (loops >= MAX_LOOPS) {
    try {
      fs.unlinkSync(counterFile);
    } catch {}
    emit({
      systemMessage: `Playwright E2E still failing after ${MAX_LOOPS} attempts; letting the turn end. Run \`npm run test:e2e\` to debug.`,
    });
    return;
  }

  fs.writeFileSync(counterFile, String(loops + 1));
  const output = truncate(
    [result.stdout ?? '', result.stderr ?? ''].filter(Boolean).join('\n'),
  );
  emit({
    decision: 'block',
    reason: [
      'Playwright E2E tests failed after your last changes. Fix the failures and verify again.',
      '',
      'Command: npm run test:e2e',
      `Exit code: ${exitCode}`,
      `Attempt: ${loops + 1} of ${MAX_LOOPS}`,
      '',
      'Test output (tail):',
      '```',
      output || '(no output captured)',
      '```',
    ].join('\n'),
  });
}

main();
