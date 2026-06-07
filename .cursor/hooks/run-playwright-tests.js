#!/usr/bin/env node
/**
 * Cursor stop hook: run Playwright E2E after each agent turn.
 * On failure, returns followup_message so the agent can fix issues.
 * On success or aborted runs, returns {}.
 */

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const MAX_OUTPUT_CHARS = 12_000;
const MAX_FOLLOWUP_LOOPS = 3;

function readStdin() {
  try {
    return fs.readFileSync(0, 'utf8');
  } catch {
    return '';
  }
}

function projectRoot() {
  return path.resolve(__dirname, '..', '..');
}

function truncate(text, max = MAX_OUTPUT_CHARS) {
  if (!text || text.length <= max) return text;
  return `…(truncated)\n${text.slice(-max)}`;
}

function emit(payload) {
  process.stdout.write(`${JSON.stringify(payload)}\n`);
}

function runPlaywrightTests(cwd) {
  return spawnSync('npm run test:e2e', {
    cwd,
    encoding: 'utf8',
    shell: true,
    env: process.env,
    maxBuffer: 20 * 1024 * 1024,
  });
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

  const status = input.status ?? 'completed';
  const loopCount = Number(input.loop_count ?? 0);

  if (status === 'aborted') {
    emit({});
    return;
  }

  const cwd = projectRoot();
  const result = runPlaywrightTests(cwd);
  const output = truncate(
    [result.stdout ?? '', result.stderr ?? ''].filter(Boolean).join('\n'),
  );
  const exitCode = result.status ?? 1;

  if (exitCode === 0) {
    emit({});
    return;
  }

  if (loopCount >= MAX_FOLLOWUP_LOOPS) {
    process.stderr.write(
      `[playwright stop hook] Tests failed (exit ${exitCode}) but loop_count=${loopCount}; not requesting another follow-up.\n`,
    );
    emit({});
    return;
  }

  emit({
    followup_message: [
      'Playwright E2E tests failed after your last changes. Fix the failures and verify again.',
      '',
      `Command: npm run test:e2e`,
      `Exit code: ${exitCode}`,
      '',
      'Test output (tail):',
      '```',
      output || '(no output captured)',
      '```',
    ].join('\n'),
  });
}

main();
