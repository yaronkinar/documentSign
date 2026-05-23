const { copyFileSync, existsSync, mkdirSync, statSync } = require('fs');
const { dirname, join } = require('path');

const pkgPath = require.resolve('pdfjs-dist/package.json');
const workerSrc = join(dirname(pkgPath), 'build', 'pdf.worker.min.mjs');
const destDir = join(__dirname, '..', 'public');
const dest = join(destDir, 'pdf.worker.min.mjs');

mkdirSync(destDir, { recursive: true });

function shouldCopy() {
  if (!existsSync(dest)) return true;
  try {
    return statSync(workerSrc).mtimeMs > statSync(dest).mtimeMs;
  } catch {
    return true;
  }
}

if (!shouldCopy()) {
  process.exit(0);
}

try {
  copyFileSync(workerSrc, dest);
} catch (err) {
  if (err?.code === 'EBUSY' && existsSync(dest)) {
    // Another dev process may hold the file; existing copy is fine.
    process.exit(0);
  }
  throw err;
}
