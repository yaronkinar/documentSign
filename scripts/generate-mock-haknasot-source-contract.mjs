/**
 * Generate a mock "source contract" PDF whose prose text contains data
 * matching the Haknasot municipal approval form fields (see
 * packages/shared/src/haknasot-form.ts and scripts/haknasot-sample-values.json).
 *
 * Intended for testing AI summary + form-value auto-fill against an
 * attached contract on the Haknasot flow.
 *
 * Usage:
 *   node scripts/generate-mock-haknasot-source-contract.mjs [--out path.pdf]
 *
 * Default output:
 *   apps/web/public/samples/mock-haknasot-source-contract.pdf
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const FONT_PATH = path.join(root, 'apps', 'web', 'public', 'fonts', 'NotoSansHebrew-Regular.ttf');
const VALUES_PATH = path.join(root, 'scripts', 'haknasot-sample-values.json');
const DEFAULT_OUT = path.join(
  root,
  'apps',
  'web',
  'public',
  'samples',
  'mock-haknasot-source-contract.pdf',
);

// The Hebrew font has no digit/Latin-punctuation glyphs, so lines mixing
// Hebrew text with numbers must be split into runs and drawn with whichever
// font actually has the glyph.
const HEBREW_RE = /[֐-׿יִ-ﭏ]/;

function getArg(flag) {
  const i = process.argv.indexOf(flag);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : null;
}

function splitRuns(line) {
  const runs = [];
  let current = '';
  let currentIsHebrew = null;
  for (const ch of line) {
    const isHebrew = HEBREW_RE.test(ch);
    // Spaces join whichever run they're adjacent to so words don't split oddly.
    const bucket = ch === ' ' ? currentIsHebrew ?? isHebrew : isHebrew;
    if (currentIsHebrew === null || bucket === currentIsHebrew) {
      current += ch;
      currentIsHebrew = bucket;
    } else {
      runs.push({ text: current, hebrew: currentIsHebrew });
      current = ch;
      currentIsHebrew = bucket;
    }
  }
  if (current) runs.push({ text: current, hebrew: currentIsHebrew });
  return runs;
}

function lineWidth(runs, fonts, size) {
  return runs.reduce(
    (sum, run) => sum + (run.hebrew ? fonts.hebrew : fonts.latin).widthOfTextAtSize(run.text, size),
    0,
  );
}

/** Draws a logical-order line right-aligned, switching fonts per run. */
function drawMixedLine(page, fonts, line, y, size, width, margin, rgb) {
  const runs = splitRuns(line);
  const totalWidth = lineWidth(runs, fonts, size);
  let x = width - margin - totalWidth;
  for (const run of runs) {
    const font = run.hebrew ? fonts.hebrew : fonts.latin;
    page.drawText(run.text, { x, y, size, font, color: rgb(0, 0, 0) });
    x += font.widthOfTextAtSize(run.text, size);
  }
  return totalWidth;
}

async function main() {
  const outPath = path.resolve(getArg('--out') ?? DEFAULT_OUT);
  const v = JSON.parse(fs.readFileSync(VALUES_PATH, 'utf8'));

  const title = 'הסכם התקשרות למתן שירותי תחזוקה - עיריית דוגמה';
  const body = [
    `תאריך חתימת ההסכם: ${v.date}`,
    `מספר חוזה: ${v.contract_number} | מספר מכרז: ${v.budget_code}`,
    `אגף מבצע: ${v.submitting_agency} | אגף אחראי לחוזה: ${v.prev_agency}`,
    '',
    'הצדדים להסכם:',
    `המזמינה: עיריית דוגמה.`,
    `הספק: ${v.supplier_name}, ח.פ ${v.supplier_id}.`,
    '',
    'סעיף 1 - מהות ההתקשרות',
    `סוג ההתקשרות: חוזה ${v.contract_type}. ${v.work_nature}.`,
    'ההתקשרות הינה חוזה שירות, ואינה כוללת רכישת קרקע, תרומה, או מכירה.',
    '',
    'סעיף 2 - תקופת ההתקשרות',
    `תוקף החוזה המקורי: מיום ${v.contract_purpose_from} עד יום ${v.contract_purpose_until}.`,
    `הארכות קודמות אושרו עד לתאריכים: ${v.budget_prev_1}, ${v.budget_prev_2}, ${v.budget_prev_3}.`,
    `תוקף ההרחבה/הארכה הנוכחית: מיום ${v.current_budget_from} עד יום ${v.current_budget_until}.`,
    '',
    'סעיף 3 - תקציב ועלויות',
    `סכום החוזה המקורי כולל מע"מ לחודש: ${v.annual_sources} ש"ח.`,
    `סכום ההרחבה/הארכה כולל מע"מ לחודש: ${v.annual_approval} ש"ח.`,
    `סעיף תקציבי הוצאה: ${v.expense_budget} | סעיף תקציבי הכנסה: ${v.income_budget}.`,
    `סה"כ חיוב שנת התקציב הנוכחית כולל מע"מ: ${v.annual_commitment} ש"ח.`,
    `גובה ערבות ותוקפה: ${v.budget_balance} ש"ח.`,
    '',
    'סעיף 4 - שיקולים ותנאים להארכה',
    `${v.approval_conditions}.`,
    `הצהרת הספק: ${v.obligations}.`,
    '',
    'אישורים וחתימות',
  ];

  const signers = [
    'אישור מנהל האגף',
    'אישור יועץ משפטי',
    'אישור גזבר העירייה',
    'אישור מנכ"ל העירייה',
    'חתימת נציג הספק',
  ];

  const { PDFDocument, rgb, StandardFonts } = await import('pdf-lib');
  const fontkit = (await import('@pdf-lib/fontkit')).default;

  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([595, 842]);
  const { width, height } = page.getSize();
  const margin = 50;
  let y = height - margin;

  if (!fs.existsSync(FONT_PATH)) {
    console.error(`Hebrew font not found: ${FONT_PATH}`);
    process.exit(1);
  }
  pdfDoc.registerFontkit(fontkit);
  const fonts = {
    hebrew: await pdfDoc.embedFont(fs.readFileSync(FONT_PATH)),
    latin: await pdfDoc.embedFont(StandardFonts.Helvetica),
  };

  const titleSize = 16;
  const bodySize = 10.5;
  const signerSize = 12;

  drawMixedLine(page, fonts, title, y, titleSize, width, margin, rgb);
  y -= 32;

  for (const line of body) {
    if (!line) {
      y -= 8;
      continue;
    }
    drawMixedLine(page, fonts, line, y, bodySize, width, margin, rgb);
    y -= 16;
  }

  y -= 8;
  for (const signer of signers) {
    const line = `${signer}: _________________________`;
    const w = drawMixedLine(page, fonts, line, y, signerSize, width, margin, rgb);
    y -= 22;
    page.drawRectangle({
      x: width - margin - w - 8,
      y: y + 6,
      width: Math.min(w + 16, width - margin * 2),
      height: 28,
      borderColor: rgb(0.7, 0.7, 0.7),
      borderWidth: 0.5,
    });
    y -= 6;
  }

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  const bytes = await pdfDoc.save();
  fs.writeFileSync(outPath, bytes);

  console.log(`Wrote ${outPath}`);
  console.log('Embedded field values (should be auto-extractable):');
  for (const [k, val] of Object.entries(v)) {
    if (val) console.log(`  ${k}: ${val}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
