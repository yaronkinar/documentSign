/**
 * Generate a small mock PDF for testing AI signer-role extraction.
 *
 * Usage:
 *   node scripts/generate-mock-signers-pdf.mjs [--doc service|lease] [--locale he|en] [--out path.pdf] [--visual-rtl]
 *
 * By default Hebrew is stored in logical order so pdf-parse / AI extraction works.
 * Pass --visual-rtl to apply display shaping (prettier in viewers, worse for extraction).
 *
 * Default output:
 *   --doc service → apps/web/public/samples/mock-signers-extraction.pdf
 *   --doc lease   → apps/web/public/samples/mock-lease-he.pdf
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const FONT_PATH = path.join(root, 'apps', 'web', 'public', 'fonts', 'NotoSansHebrew-Regular.ttf');
const DEFAULT_OUT_BY_DOC = {
  service: path.join(root, 'apps', 'web', 'public', 'samples', 'mock-signers-extraction.pdf'),
  lease: path.join(root, 'apps', 'web', 'public', 'samples', 'mock-lease-he.pdf'),
};

const HEBREW_RE = /[\u0590-\u05FF\uFB1D-\uFB4F]/;

function getArg(flag) {
  const i = process.argv.indexOf(flag);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : null;
}

function hasFlag(flag) {
  return process.argv.includes(flag);
}

function shapeRtl(text) {
  return text
    .split(/(\s+)/)
    .reverse()
    .map((token) => {
      if (!token.trim()) return token;
      if (HEBREW_RE.test(token)) return [...token].reverse().join('');
      return token;
    })
    .join('');
}

const LEASE_HE = {
  title: 'חוזה שכירות לדירת מגורים',
  body: [
    'מסמך דמה לבדיקת חתימה וזיהוי חותמים — DocFlow',
    'תאריך חתימה: 04/06/2026',
    'מקום: תל אביב–יפו',
    '',
    'הצדדים:',
    'המשכיר: ישראל ישראלי, ת.ז. 123456782',
    'השוכר: שרה כהן, ת.ז. 987654321',
    '',
    'פרטי הנכס:',
    'כתובת: רחוב הרצל 15, דירה 4, קומה 2, תל אביב–יפו',
    'שטח: כ-75 מ״ר | חדרים: 3',
    '',
    'סעיף 1 — תקופת השכירות',
    'השכירות לתקופה של 12 חודשים, מיום 01/07/2026 עד יום 30/06/2027.',
    '',
    'סעיף 2 — דמי שכירות',
    'דמי שכירות חודשיים: 6,500 ₪ (ששת אלפים וחמש מאות שקלים חדשים).',
    'התשלום יועבר לחשבון המשכיר עד ה-5 לכל חודש.',
    '',
    'סעיף 3 — פיקדון',
    'פיקדון בסך 13,000 ₪ ישולם עם חתימת החוזה ויוחזר בתום התקופה בכפוף לניכויים על פי דין.',
    '',
    'סעיף 4 — התחייבויות',
    'השוכר מתחייב לשמור על הנכס, לשלם ארנונה וחשבונות שירותים כמוסכם, ולא להעביר את הזכות ללא אישור בכתב.',
    'המשכיר מתחייב למסור את הנכס פנוי ומתאים למגורים.',
    '',
    'סעיף 5 — סיום',
    'הודעה מוקדמת להארכה או סיום: 60 יום בכתב.',
    '',
    '—— חתימות הצדדים ——',
  ],
  signers: [
    'חתימת השוכר',
    'חתימת המשכיר',
    'חתימת עורך דין מטעם השוכר',
    'חתימת עורך דין מטעם המשכיר',
    'חתימת עד ראשון',
    'חתימת עד שני',
  ],
};

const CONTENT = {
  he: {
    title: 'הסכם שירות לבדיקה — מסמך דמה',
    body: [
      'מסמך זה נוצר לבדיקת זיהוי חותמים במערכת DocFlow.',
      'תאריך: 04/06/2026',
      'צד א׳: עיריית דוגמה',
      'צד ב׳: ספק שירותים בע״מ',
      '',
      'סעיף 1: תחולת ההסכם',
      'ההסכם חל על מתן שירותי תחזוקה לשנת 2026.',
      '',
      'סעיף 2: תשלום',
      'התשלום יבוצע לאחר אישור כל הגורמים הרשומים להלן.',
      '',
      '—— אישורים וחתימות ——',
    ],
    signers: [
      'אישור מנהל האגף',
      'אישור יועץ משפטי',
      'אישור גזבר העירייה',
      'אישור מנכ"ל העירייה',
      'חתימת נציג הספק',
    ],
  },
  en: {
    title: 'Service Agreement — Mock Document',
    body: [
      'This document is for testing signer extraction in DocFlow.',
      'Date: June 4, 2026',
      'Party A: Example Municipality',
      'Party B: Maintenance Services Ltd.',
      '',
      'Section 1: Scope',
      'Maintenance services for fiscal year 2026.',
      '',
      'Section 2: Payment',
      'Payment is due after all approvals listed below.',
      '',
      '—— Approvals and Signatures ——',
    ],
    signers: [
      'Department Manager Approval',
      'Legal Counsel Approval',
      'City Treasurer Approval',
      'Chief Executive Officer Approval',
      'Vendor Representative Signature',
    ],
  },
};

function drawText(page, font, text, x, y, size, rgb, { rtl = false, visualRtl = false } = {}) {
  const display = rtl && visualRtl ? shapeRtl(text) : text;
  page.drawText(display, { x, y, size, font, color: rgb(0, 0, 0) });
}

async function main() {
  const docType = getArg('--doc') === 'lease' ? 'lease' : 'service';
  const locale = getArg('--locale') === 'en' ? 'en' : 'he';
  const visualRtl = hasFlag('--visual-rtl');
  const outPath = path.resolve(getArg('--out') ?? DEFAULT_OUT_BY_DOC[docType]);
  const { PDFDocument, rgb, StandardFonts } = await import('pdf-lib');
  const fontkit = (await import('@pdf-lib/fontkit')).default;

  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([595, 842]);
  const { width, height } = page.getSize();
  const margin = 50;
  let y = height - margin;

  const content =
    docType === 'lease' && locale === 'he' ? LEASE_HE : CONTENT[locale];
  let font;
  let rtl = false;

  if (locale === 'he') {
    if (!fs.existsSync(FONT_PATH)) {
      console.error(`Hebrew font not found: ${FONT_PATH}`);
      process.exit(1);
    }
    pdfDoc.registerFontkit(fontkit);
    font = await pdfDoc.embedFont(fs.readFileSync(FONT_PATH));
    rtl = true;
  } else {
    font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  }

  const titleSize = 16;
  const bodySize = 11;
  const signerSize = 12;

  const title = content.title;
  const titleDisplay = rtl && visualRtl ? shapeRtl(title) : title;
  const titleWidth = font.widthOfTextAtSize(titleDisplay, titleSize);
  drawText(page, font, title, rtl ? width - margin - titleWidth : margin, y, titleSize, rgb, {
    rtl,
    visualRtl,
  });
  y -= 36;

  for (const line of content.body) {
    if (!line) {
      y -= 10;
      continue;
    }
    const lineDisplay = rtl && visualRtl ? shapeRtl(line) : line;
    const lineWidth = font.widthOfTextAtSize(lineDisplay, bodySize);
    drawText(page, font, line, rtl ? width - margin - lineWidth : margin, y, bodySize, rgb, {
      rtl,
      visualRtl,
    });
    y -= 18;
  }

  y -= 8;
  for (const signer of content.signers) {
    const line = `${signer}: _________________________`;
    const lineDisplay = rtl && visualRtl ? shapeRtl(line) : line;
    const lineWidth = font.widthOfTextAtSize(lineDisplay, signerSize);
    drawText(page, font, line, rtl ? width - margin - lineWidth : margin, y, signerSize, rgb, {
      rtl,
      visualRtl,
    });
    y -= 22;

    page.drawRectangle({
      x: rtl ? width - margin - lineWidth - 8 : margin - 4,
      y: y + 6,
      width: Math.min(lineWidth + 16, width - margin * 2),
      height: 28,
      borderColor: rgb(0.7, 0.7, 0.7),
      borderWidth: 0.5,
    });
    y -= 6;
  }

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  const bytes = await pdfDoc.save();
  fs.writeFileSync(outPath, bytes);

  console.log(`Wrote ${outPath} (${docType}, ${locale}, ${content.signers.length} signer lines)`);
  console.log('Expected roles (approximate — AI may shorten labels):');
  for (const s of content.signers) console.log(`  - ${s}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
