#!/usr/bin/env node
/**
 * Regenerate site version history from git after commits (or manual runs).
 */

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

function projectRoot() {
  return path.resolve(__dirname, '..', '..');
}

function readStdin() {
  try {
    return fs.readFileSync(0, 'utf8');
  } catch {
    return '';
  }
}

function shouldRun(input) {
  if (!input.trim()) return true;

  try {
    const payload = JSON.parse(input);
    const command = payload.command ?? '';
    if (/git\s+commit\b/.test(command)) return true;
    if (/generate-site-versions/.test(command)) return true;
  } catch {
    return true;
  }

  return false;
}

function main() {
  const input = readStdin();
  if (!shouldRun(input)) {
    process.stdout.write('{}\n');
    return;
  }

  const cwd = projectRoot();
  const result = spawnSync('node', ['scripts/generate-site-versions.mjs'], {
    cwd,
    encoding: 'utf8',
    shell: process.platform === 'win32',
  });

  if (result.stdout) process.stderr.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }

  process.stdout.write('{}\n');
}

main();
