import type { ExtractedTemplateField } from './extracted-template-field';

export interface PdfTextLine {
  pageNumber: number;
  str: string;
  xPct: number;
  yTopPct: number;
  widthPct: number;
}

function clampPercent(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function toPercentCoord(value: unknown, min: number, max: number): number | null {
  let num = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(num)) return null;
  if (num > 0 && num <= 1) num *= 100;
  return clampPercent(num, min, max);
}

export function normalizeExtractedFieldCoords(
  field: ExtractedTemplateField,
): ExtractedTemplateField {
  const x = toPercentCoord(field.x, 0, 99) ?? field.x;
  const y = toPercentCoord(field.y, 0, 99) ?? field.y;
  let width = toPercentCoord(field.width, 1, 100) ?? field.width;
  let height = toPercentCoord(field.height, 1, 100) ?? field.height;
  if (width < 8) width = 18;
  if (height < 2.5) height = 5;
  return {
    ...field,
    x: Number(x.toFixed(2)),
    y: Number(y.toFixed(2)),
    width: Number(Math.min(width, 100 - x).toFixed(2)),
    height: Number(Math.min(height, 100 - y).toFixed(2)),
  };
}

/** Map 1-based image index to real PDF page when only a subset of pages was sent. */
export function remapExtractedPageNumbers(
  fields: ExtractedTemplateField[],
  inspectedPages: number[],
): ExtractedTemplateField[] {
  const valid = new Set(inspectedPages);
  return fields.map((field) => {
    if (valid.has(field.pageNumber)) return field;
    const idx = field.pageNumber - 1;
    if (idx >= 0 && idx < inspectedPages.length) {
      return { ...field, pageNumber: inspectedPages[idx]! };
    }
    return field;
  });
}

function normalizeLabel(label: string): string {
  return label
    .replace(/[\u0591-\u05C7]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function labelMatchScore(fieldLabel: string, lineText: string): number {
  const a = normalizeLabel(fieldLabel);
  const b = normalizeLabel(lineText);
  if (!a || !b) return 0;
  if (b.includes(a) || a.includes(b)) return 1;
  const tokens = a.split(' ').filter((t) => t.length > 2);
  if (tokens.length === 0) return 0;
  const hits = tokens.filter((t) => b.includes(t)).length;
  return hits / tokens.length;
}

function signatureBoxFromLine(line: PdfTextLine): {
  x: number;
  y: number;
  width: number;
  height: number;
} {
  const dash = line.str.match(/[-–—_\s]{4,}/);
  if (dash && dash.index != null) {
    const start = dash.index;
    const len = dash[0].length;
    const x = line.xPct + (start / line.str.length) * line.widthPct;
    const width = (len / line.str.length) * line.widthPct;
    return {
      x: clampPercent(x, 0, 92),
      y: clampPercent(line.yTopPct - 0.5, 0, 94),
      width: clampPercent(Math.max(width, 14), 8, 55),
      height: 5,
    };
  }
  return {
    x: clampPercent(line.xPct, 0, 85),
    y: clampPercent(line.yTopPct - 0.5, 0, 94),
    width: clampPercent(Math.min(35, line.widthPct * 0.45), 12, 45),
    height: 5,
  };
}

export function anchorFieldsToPdfText(
  fields: ExtractedTemplateField[],
  lines: PdfTextLine[],
): ExtractedTemplateField[] {
  return fields.map((field) => {
    const pageLines = lines.filter((l) => l.pageNumber === field.pageNumber);
    let best: PdfTextLine | null = null;
    let bestScore = 0;
    for (const line of pageLines) {
      const score = labelMatchScore(field.label, line.str);
      const boosted =
        /חתימ|חותם|signature|sign/i.test(field.label) &&
        /חתימ|חותם|[-–—_]{3,}/i.test(line.str)
          ? score + 0.15
          : score;
      if (boosted > bestScore) {
        bestScore = boosted;
        best = line;
      }
    }
    const normalized = normalizeExtractedFieldCoords(field);
    if (!best || bestScore < 0.35) return normalized;
    const box = signatureBoxFromLine(best);
    return {
      ...normalized,
      x: Number(box.x.toFixed(2)),
      y: Number(box.y.toFixed(2)),
      width: Number(Math.min(box.width, 100 - box.x).toFixed(2)),
      height: Number(box.height.toFixed(2)),
    };
  });
}

function extractLabelFromSignatureLine(line: PdfTextLine): string | null {
  if (/דמה לבדיקת|זיהוי חותמים/i.test(line.str)) return null;
  if (/חתימת החוזה ויוחזר|עם חתימת החוזה/i.test(line.str)) return null;

  const specific = line.str.match(
    /חתימת\s+[\u0590-\u05FF][\u0590-\u05FF\s]{0,48}/,
  );
  if (specific) {
    return specific[0].replace(/\s+/g, ' ').trim();
  }
  if (/תאריך\s*חתימה/i.test(line.str)) return 'תאריך חתימה';
  return null;
}

/** Fallback when vision returns nothing: detect signature lines from PDF text positions. */
export function deriveSignatureFieldsFromPdfLines(
  lines: PdfTextLine[],
): ExtractedTemplateField[] {
  const fields: ExtractedTemplateField[] = [];
  const seen = new Set<string>();

  for (const line of lines) {
    const hasDashes = /[-–—_]{4,}/.test(line.str);
    const label = extractLabelFromSignatureLine(line);
    if (!label || label.length < 3) continue;
    if (!hasDashes) continue;
    if (/חתימות\s*הצדדים/i.test(line.str)) continue;

    const key = `${line.pageNumber}:${normalizeLabel(label)}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const box = signatureBoxFromLine(line);
    fields.push(
      normalizeExtractedFieldCoords({
        label,
        pageNumber: line.pageNumber,
        x: box.x,
        y: box.y,
        width: box.width,
        height: box.height,
      }),
    );
  }
  return fields;
}

type PdfJsModule = typeof import('pdfjs-dist/legacy/build/pdf.mjs');

/** Dynamic import that survives Nest CJS compile (avoids require(file://…)). */
async function importPdfJsModule(pdfjsPath: string): Promise<PdfJsModule> {
  const { pathToFileURL } = await import('node:url');
  const href = pathToFileURL(pdfjsPath).href;
  const load = new Function(
    'specifier',
    'return import(specifier)',
  ) as (specifier: string) => Promise<PdfJsModule>;
  return load(href);
}

function resolvePdfJsPaths(): { pdfjsPath: string; workerPath: string } {
  const { createRequire } = require('node:module') as typeof import('node:module');
  const { existsSync } = require('node:fs') as typeof import('node:fs');
  const { dirname, join } = require('node:path') as typeof import('node:path');
  const req = createRequire(__filename);

  const candidates: Array<{ pdfjsPath: string; workerPath: string }> = [];

  try {
    const pdfParseEntry = req.resolve('pdf-parse');
    const pdfParseRoot = join(dirname(pdfParseEntry), '..', '..', '..');
    candidates.push({
      pdfjsPath: join(pdfParseRoot, 'node_modules/pdfjs-dist/legacy/build/pdf.mjs'),
      workerPath: join(pdfParseRoot, 'node_modules/pdfjs-dist/build/pdf.worker.mjs'),
    });
  } catch {
    // pdf-parse not installed
  }

  try {
    candidates.push({
      pdfjsPath: req.resolve('pdfjs-dist/legacy/build/pdf.mjs'),
      workerPath: req.resolve('pdfjs-dist/build/pdf.worker.mjs'),
    });
  } catch {
    // top-level pdfjs-dist missing
  }

  for (const paths of candidates) {
    if (existsSync(paths.pdfjsPath) && existsSync(paths.workerPath)) {
      return paths;
    }
  }

  throw new Error('Could not resolve a matching pdfjs-dist build and worker');
}

/** Load positioned text lines for anchoring / fallback field detection. */
export async function loadPdfTextLines(buffer: Buffer): Promise<PdfTextLine[]> {
  const { pathToFileURL } = await import('node:url');
  const { pdfjsPath, workerPath } = resolvePdfJsPaths();
  const pdfjs = await importPdfJsModule(pdfjsPath);
  pdfjs.GlobalWorkerOptions.workerSrc = pathToFileURL(workerPath).href;
  const doc = await pdfjs.getDocument({
    data: new Uint8Array(buffer),
    useSystemFonts: true,
  }).promise;
  const lines: PdfTextLine[] = [];
  try {
    for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber += 1) {
      const page = await doc.getPage(pageNumber);
      const viewport = page.getViewport({ scale: 1 });
      const content = await page.getTextContent();
      for (const item of content.items) {
        if (!('str' in item)) continue;
        const text = item.str.replace(/\s+/g, ' ').trim();
        if (!text) continue;
        const transform = item.transform;
        const x = transform[4];
        const y = transform[5];
        const itemWidth =
          typeof item.width === 'number' && item.width > 0
            ? item.width
            : text.length * (transform[0] || 8);
        lines.push({
          pageNumber,
          str: text,
          xPct: (x / viewport.width) * 100,
          yTopPct: ((viewport.height - y) / viewport.height) * 100,
          widthPct: Math.max(4, (itemWidth / viewport.width) * 100),
        });
      }
    }
  } finally {
    await doc.destroy();
  }
  return lines;
}
