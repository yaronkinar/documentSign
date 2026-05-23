/**
 * Smoke test: loads the refreshed haknasot template (PDF + form-field coords +
 * signature rows), fills every form field with a sample value and stamps each
 * municipal-approval signature box with a labelled placeholder, then writes the
 * result to scripts/.out/haknasot-filled-sample.pdf for visual inspection.
 *
 * Run: npm run test:haknasot-fill
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { MUNICIPAL_APPROVAL_SIGNATURE_ROWS } from './haknasot-pdf-core.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

const PDF_PATH = path.join(root, 'apps', 'web', 'public', 'samples', 'haknasot.pdf');
const FIELDS_PATH = path.join(root, 'packages', 'shared', 'src', 'haknasot-form-fields.generated.json');
const FONT_PATH = path.join(root, 'apps', 'web', 'public', 'fonts', 'NotoSansHebrew-Regular.ttf');
const OUT_DIR = path.join(__dirname, '.out');
const OUT_PATH = path.join(OUT_DIR, 'haknasot-filled-sample.pdf');

const HEBREW_RE = /[֐-׿יִ-ﭏ]/;

// contract_type is rendered as a circle around one of three printed options
// instead of as text in a box. The value names which option to circle.
const CONTRACT_TYPE_SELECTION = 'חדש'; // one of: 'חדש' | 'הרחבה' | 'הארכה'

// Form "today" — used for the top-of-form date field. Override here to roll
// the whole mocked approval chain forward/backward in time.
const MOCK_TODAY = '22/05/2026';

// One mocked signer per row in MUNICIPAL_APPROVAL_SIGNATURE_ROWS (11 rows,
// items 13–23 on page 2). Names are in Hebrew so we exercise the RTL path;
// dates form a plausible approval timeline leading up to MOCK_TODAY.
const MOCK_SIGNERS = [
  { name: 'דוד כהן',      date: '04/05/2026' }, // 13. מנהל האגף
  { name: 'רחל לוי',      date: '06/05/2026' }, // 14. ראש המנהל
  { name: 'אבי שפירא',    date: '08/05/2026' }, // 15. יועץ משפטי
  { name: 'מיכל אברהם',   date: '10/05/2026' }, // 16. מנהל אגף נכסים
  { name: 'יוסי מזרחי',   date: '12/05/2026' }, // 17. חשב האגף
  { name: 'שרה ביטון',    date: '13/05/2026' }, // 18. מהנדס העירייה
  { name: 'רונן פרץ',     date: '15/05/2026' }, // 19. מ.אגף מכרזים
  { name: 'ליאת אזולאי',  date: '17/05/2026' }, // 20. אגף תכנון ופיתוח כלכלי
  { name: 'אורי דהן',     date: '19/05/2026' }, // 21. מ.אגף גזברות
  { name: 'תמר חדד',      date: '20/05/2026' }, // 22. גזבר העירייה
  { name: 'איתן אוחנה',   date: '22/05/2026' }, // 23. מנכ"ל העירייה
];

// Sample values keyed by field id. The contract-types section is filled with
// real bullet descriptions (the "פרט..." dotted lines on the form).
const SAMPLE_VALUES = {
  date: MOCK_TODAY,
  // contract_type intentionally omitted — rendered as a circle below.
  income_ref: 'משכירות, הקצאות קרקע, זיכיונות, הפעלת מסעדות, גלריות',
  manager_ref: 'מכירת נכסים, רכבים אחר',
  muni_ref: 'חוזים שאין בגינם הוצאות/הכנסות',
  rent_ref: 'קבלת תרומות מגופים חיצוניים',
  building_ref: 'בנייה, שיפוץ מבנים',
  service_ref: 'שכירת מבנים לשימוש עירוני',
  budget_code: '0123456',
  contract_number: 'CN-2026-789',
  prev_agency: 'אגף תכנון',
  submitting_agency: 'אגף תפעול',
  supplier_name: 'חברת בדיקה בע"מ',
  supplier_id: '514000000',
  work_nature: 'מתן שירותי תחזוקה שוטפת',
  contract_purpose_from: '01/06/2026',
  contract_purpose_until: '31/05/2027',
  budget_prev_1: '10,000',
  budget_prev_2: '12,500',
  budget_prev_3: '15,000',
  current_budget_from: '01/06/2026',
  current_budget_until: '31/05/2027',
  annual_sources: '120,000',
  annual_approval: '12,000',
  expense_budget: '4321',
  income_budget: '8765',
  annual_commitment: '144,000',
  budget_balance: '24,000',
  approval_conditions: 'הרחבה הנדרשת לצרכי שירות',
  obligations: 'כל ההתחייבויות מולאו כסדרן',
};

async function main() {
  for (const p of [PDF_PATH, FIELDS_PATH, FONT_PATH]) {
    if (!fs.existsSync(p)) throw new Error(`Missing required file: ${p}`);
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });

  const { PDFDocument, rgb } = await import('pdf-lib');
  const fontkit = (await import('@pdf-lib/fontkit')).default;

  const pdfBytes = fs.readFileSync(PDF_PATH);
  const fontBytes = fs.readFileSync(FONT_PATH);
  const fields = JSON.parse(fs.readFileSync(FIELDS_PATH, 'utf8'));

  const pdfDoc = await PDFDocument.load(pdfBytes);
  pdfDoc.registerFontkit(fontkit);
  const font = await pdfDoc.embedFont(fontBytes);
  const pages = pdfDoc.getPages();

  let filled = 0;
  let missing = 0;

  const contractTypeField = fields.find((f) => f.id === 'contract_type');

  for (const field of fields) {
    if (field.id === 'contract_type') continue; // handled separately as a circle
    const page = pages[field.pageNumber - 1];
    if (!page) {
      console.warn(`  ! ${field.id}: page ${field.pageNumber} not in PDF`);
      missing += 1;
      continue;
    }
    const raw = SAMPLE_VALUES[field.id];
    if (raw === undefined) {
      console.warn(`  ! ${field.id}: no sample value defined`);
      missing += 1;
      continue;
    }

    const { width: pw, height: ph } = page.getSize();
    const boxLeft = (field.x / 100) * pw;
    const boxWidth = (field.width / 100) * pw;
    const boxTopFromTop = (field.y / 100) * ph;
    const boxHeight = (field.height / 100) * ph;

    const fontSize = Math.max(7, Math.min(10, boxHeight * 0.75));
    // Let pdf-lib + fontkit handle Hebrew shaping/BiDi — pass the raw string.
    const textWidth = font.widthOfTextAtSize(raw, fontSize);

    // RTL forms: right-align Hebrew/long fields, left-align numeric for clarity.
    const rightAlign = HEBREW_RE.test(raw);
    const x = rightAlign
      ? boxLeft + boxWidth - textWidth - 1
      : boxLeft + 1;
    const y = ph - boxTopFromTop - fontSize * 0.85;

    // Light highlight box so we can see where each field sits.
    page.drawRectangle({
      x: boxLeft,
      y: ph - boxTopFromTop - boxHeight,
      width: boxWidth,
      height: boxHeight,
      borderColor: rgb(0.9, 0.6, 0.6),
      borderWidth: 0.3,
      color: rgb(1, 0.97, 0.85),
      opacity: 0.35,
    });

    page.drawText(raw, {
      x,
      y,
      size: fontSize,
      font,
      color: rgb(0, 0, 0.5),
    });

    filled += 1;
  }

  // Draw an ellipse around the selected contract-type option.
  // The form has 3 options on one line (y=18.84%): חדש (center x≈49.3),
  // הארכה (center x≈38.7), הרחבה (center x≈27.5). The contract_type field
  // anchors at חדש; offsets shift to the other options.
  if (contractTypeField) {
    const ctPage = pages[contractTypeField.pageNumber - 1];
    const { width: pw, height: ph } = ctPage.getSize();
    const optionOffsets = {
      'חדש':   0,
      'הארכה': -10.7,
      'הרחבה': -21.85,
      'הערכה': -10.7, // legacy alias for הארכה
    };
    const offset = optionOffsets[CONTRACT_TYPE_SELECTION] ?? 0;
    const boxLeft = ((contractTypeField.x + offset) / 100) * pw;
    const boxWidth = (contractTypeField.width / 100) * pw;
    const boxTopFromTop = (contractTypeField.y / 100) * ph;
    const boxHeight = (contractTypeField.height / 100) * ph;
    const centerX = boxLeft + boxWidth / 2;
    const centerY = ph - boxTopFromTop - boxHeight / 2;
    ctPage.drawEllipse({
      x: centerX,
      y: centerY,
      xScale: boxWidth * 1.4,
      yScale: boxHeight * 1.3,
      borderColor: rgb(0.85, 0.1, 0.1),
      borderWidth: 1.4,
    });
  }

  // Stamp each municipal-approval signature row with a labelled placeholder.
  const sigPage = pages[1];
  if (sigPage) {
    const { width: pw, height: ph } = sigPage.getSize();
    MUNICIPAL_APPROVAL_SIGNATURE_ROWS.forEach((row, idx) => {
      const boxLeft = (row.x / 100) * pw;
      const boxWidth = (row.width / 100) * pw;
      const boxHeight = (row.height / 100) * ph;
      const boxTopFromTop = (row.y / 100) * ph;

      sigPage.drawRectangle({
        x: boxLeft,
        y: ph - boxTopFromTop - boxHeight,
        width: boxWidth,
        height: boxHeight,
        borderColor: rgb(0.2, 0.4, 0.8),
        borderWidth: 0.6,
        color: rgb(0.85, 0.92, 1),
        opacity: 0.4,
      });

      const signer = MOCK_SIGNERS[idx];
      if (!signer) return;

      const nameSize = Math.min(8, boxHeight * 0.42);
      const dateSize = Math.min(7, boxHeight * 0.34);
      const boxBottom = ph - boxTopFromTop - boxHeight;

      // Right-align Hebrew names; place name in the top half, date below.
      const nameWidth = font.widthOfTextAtSize(signer.name, nameSize);
      sigPage.drawText(signer.name, {
        x: boxLeft + boxWidth - nameWidth - 2,
        y: boxBottom + boxHeight * 0.72,
        size: nameSize,
        font,
        color: rgb(0.2, 0.4, 0.8),
      });

      const dateWidth = font.widthOfTextAtSize(signer.date, dateSize);
      sigPage.drawText(signer.date, {
        x: boxLeft + boxWidth - dateWidth - 2,
        y: boxBottom + boxHeight * 0.32,
        size: dateSize,
        font,
        color: rgb(0.2, 0.4, 0.8),
      });
    });
  }

  const outBytes = await pdfDoc.save();
  fs.writeFileSync(OUT_PATH, outBytes);

  console.log(`Filled ${filled} field(s); skipped ${missing}.`);
  console.log(`Wrote ${OUT_PATH}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
