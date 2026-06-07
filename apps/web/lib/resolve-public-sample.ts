import { existsSync } from 'node:fs';
import path from 'node:path';

/** Resolve a file under public/samples regardless of monorepo vs apps/web cwd. */
export function resolvePublicSamplePath(filename: string): string | null {
  const cwd = process.cwd();
  const candidates = [
    path.join(cwd, 'public', 'samples', filename),
    path.join(cwd, 'apps', 'web', 'public', 'samples', filename),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  return null;
}
