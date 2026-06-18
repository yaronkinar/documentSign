"""Extract fill-area coordinates from the haknasot PDF and emit a TypeScript template."""
from __future__ import annotations

import json
from pathlib import Path

import pdfplumber

ROOT = Path(__file__).resolve().parents[1]
PDF_PATH = ROOT / "apps" / "web" / "public" / "samples" / "haknasot.pdf"
OUT_JSON = ROOT / "packages" / "shared" / "src" / "haknasot-form-fields.generated.json"
OUT_TS = ROOT / "packages" / "shared" / "src" / "haknasot-form.ts"

PAGE_W = 595.32
PAGE_H = 842.04


def pct_x(x: float) -> float:
    return round(x / PAGE_W * 100, 2)


def pct_y(top: float) -> float:
    return round(top / PAGE_H * 100, 2)


def pct_w(w: float) -> float:
    return round(w / PAGE_W * 100, 2)


def pct_h(h: float) -> float:
    return round(h / PAGE_H * 100, 2)


FIELD_DEFS = [
    # Header
    {"id": "date", "label": "תאריך", "type": "date", "section": "header"},
    {
        "id": "contract_type",
        "label": "סוג החוזה (סמן בעיגול): חדש / הארכה / הרחבה",
        "type": "text",
        "section": "header",
    },
    # Contract-type bullets — free-text "פרט..." dotted lines after each bullet
    {"id": "income_ref", "label": "הכנסה: משכירות, הקצאות קרקע, זיכיונות... — פרט", "type": "text", "section": "contract_types"},
    {"id": "manager_ref", "label": "חוזה מכירה — מכירת נכסים, רכבים אחר — פרט", "type": "text", "section": "contract_types"},
    {"id": "muni_ref", "label": "חוזה מול משרדי ממשלה — חוזים שאין בגינם הוצאות/הכנסות — לפרט", "type": "text", "section": "contract_types"},
    {"id": "rent_ref", "label": "חוזה תרומות — קבלת תרומות מגופים חיצוניים — לפרט", "type": "text", "section": "contract_types"},
    {"id": "building_ref", "label": "חוזה קבלן — בנייה, שיפוץ מבנים — לפרט", "type": "text", "section": "contract_types"},
    {"id": "service_ref", "label": "חוזה שירות — שכירת מבנים לשימוש עירוני (אין שדה פרט)", "type": "text", "section": "contract_types"},
    # Numbered items
    {"id": "contract_number", "label": "1. מספר חוזה", "type": "text", "section": "details"},
    {"id": "budget_code", "label": "1. מספר מכרז", "type": "text", "section": "details"},
    {"id": "prev_agency", "label": "2. אגף אחראי לחוזה", "type": "text", "section": "details"},
    {"id": "submitting_agency", "label": "2. אגף מבצע", "type": "text", "section": "details"},
    {"id": "supplier_name", "label": "3. שם ספק", "type": "text", "section": "details"},
    {"id": "supplier_id", "label": "3. ח.פ/ת.ז", "type": "text", "section": "details"},
    {"id": "work_nature", "label": "4. מהות עבודה (תקציר פעילות)", "type": "textarea", "section": "details"},
    {"id": "contract_purpose_from", "label": "4. תוקף החוזה מקורי – מיום", "type": "date", "section": "details"},
    {"id": "contract_purpose_until", "label": "4. תוקף החוזה מקורי – עד יום", "type": "date", "section": "details"},
    {"id": "budget_prev_1", "label": "5. הארכות קודמות – עד 1", "type": "date", "section": "budget"},
    {"id": "budget_prev_2", "label": "5. הארכות קודמות – עד 2", "type": "date", "section": "budget"},
    {"id": "budget_prev_3", "label": "5. הארכות קודמות – עד 3", "type": "date", "section": "budget"},
    {"id": "current_budget_from", "label": "6. הארכה/הרחבה נוכחית – מיום", "type": "date", "section": "budget"},
    {"id": "current_budget_until", "label": "6. הארכה/הרחבה נוכחית – עד יום", "type": "date", "section": "budget"},
    # Page 2 — amounts
    {"id": "annual_sources", "label": '7. סכום החוזה מקורי כולל מע"מ לחודש', "type": "text", "section": "amounts"},
    {"id": "annual_approval", "label": '8. סכום ההרחבה/הארכה כולל מע"מ לחודש', "type": "text", "section": "amounts"},
    {"id": "expense_budget", "label": "9. סעיף תקציבי – הוצאה", "type": "text", "section": "amounts"},
    {"id": "income_budget", "label": "9. הכנסה", "type": "text", "section": "amounts"},
    {"id": "annual_commitment", "label": '10. סה"כ חיוב שנת תקציב נוכחית כולל מע"מ', "type": "text", "section": "amounts"},
    {"id": "budget_balance", "label": "11. גובה ערבות סכום ותוקף", "type": "text", "section": "amounts"},
    {"id": "approval_conditions", "label": "12. שיקולים להארכה/הרחבה", "type": "textarea", "section": "amounts"},
    {"id": "obligations", "label": "11. אישור קיום ביטוחים", "type": "textarea", "section": "amounts"},
]

# SEGMENT_MAP is retained only because the extraction loop reads it before
# checking MANUAL_OVERRIDES. Every field has an explicit MANUAL_OVERRIDES entry
# below, so these tuples are effectively placeholders.
SEGMENT_MAP: dict[str, tuple[int, int]] = {field["id"]: (1, 0) for field in FIELD_DEFS}

# Coordinates measured directly from the canonical haknasot.pdf using pdfplumber
# (see scripts/inspect-haknasot-positions.py). All values are percentages of the
# A4 page. The previous segment-based extraction was misaligned by ~25% because
# the dot-segment finder skipped the top portion of the form.
MANUAL_OVERRIDES: dict[str, dict] = {
    # Header
    "date":          {"pageNumber": 1, "x": 7.18,  "y": 17.55, "width": 13.5, "height": 2.0},
    # contract_type anchors at the "חדש" option; the smoke test offsets left to
    # circle "הארכה" (x≈36) or "הרחבה" (x≈25) when the user picks those.
    "contract_type": {"pageNumber": 1, "x": 47.60, "y": 18.84, "width": 3.5,  "height": 2.0},

    # Contract-type bullet "פרט..." free-text lines (5 of 7 bullets have dots).
    "income_ref":    {"pageNumber": 1, "x": 15.26, "y": 22.58, "width": 18.1, "height": 2.0},
    "manager_ref":   {"pageNumber": 1, "x": 15.44, "y": 24.92, "width": 38.2, "height": 2.0},
    "muni_ref":      {"pageNumber": 1, "x": 14.26, "y": 27.24, "width": 24.0, "height": 2.0},
    "rent_ref":      {"pageNumber": 1, "x": 14.58, "y": 29.58, "width": 34.5, "height": 2.0},
    "building_ref":  {"pageNumber": 1, "x": 15.30, "y": 31.91, "width": 45.1, "height": 2.0},
    # "חוזה שירות" and "חוזה מול דרישות/הזמנות" bullets have no fillable area
    # on the form; the field is kept for ID stability but has zero width.
    "service_ref":   {"pageNumber": 1, "x": 14.0,  "y": 34.24, "width": 0.0,  "height": 0.0},

    # Numbered items (page 1)
    "contract_number":  {"pageNumber": 1, "x": 37.22, "y": 39.62, "width": 19.0, "height": 2.0},
    "budget_code":      {"pageNumber": 1, "x": 60.0,  "y": 39.62, "width": 17.0, "height": 2.0},
    "prev_agency":      {"pageNumber": 1, "x": 46.43, "y": 42.65, "width": 26.0, "height": 2.0},
    "submitting_agency":{"pageNumber": 1, "x": 14.39, "y": 42.65, "width": 27.1, "height": 2.0},
    "supplier_name":    {"pageNumber": 1, "x": 64.82, "y": 45.46, "width": 16.3, "height": 2.0},
    "supplier_id":      {"pageNumber": 1, "x": 14.05, "y": 45.46, "width": 26.0, "height": 2.0},
    # work_nature is a multi-line free-text area (~10 dotted lines).
    "work_nature":      {"pageNumber": 1, "x": 13.33, "y": 49.91, "width": 71.0, "height": 30.0},
    "contract_purpose_from":  {"pageNumber": 1, "x": 41.38, "y": 83.56, "width": 28.0, "height": 2.0},
    "contract_purpose_until": {"pageNumber": 1, "x": 14.35, "y": 83.56, "width": 26.6, "height": 2.0},
    "budget_prev_1":   {"pageNumber": 1, "x": 53.0,  "y": 86.61, "width": 17.5, "height": 2.0},
    "budget_prev_2":   {"pageNumber": 1, "x": 35.0,  "y": 86.61, "width": 17.5, "height": 2.0},
    "budget_prev_3":   {"pageNumber": 1, "x": 17.30, "y": 86.61, "width": 17.0, "height": 2.0},
    "current_budget_from":  {"pageNumber": 1, "x": 36.63, "y": 89.65, "width": 30.0, "height": 2.0},
    "current_budget_until": {"pageNumber": 1, "x": 17.66, "y": 89.65, "width": 18.5, "height": 2.0},

    # Page 2 — amounts (items 7-12)
    "annual_sources":     {"pageNumber": 2, "x": 19.0,  "y": 6.45,  "width": 36.0, "height": 2.0},
    "annual_approval":    {"pageNumber": 2, "x": 27.64, "y": 9.49,  "width": 30.0, "height": 2.0},
    "income_budget":      {"pageNumber": 2, "x": 20.16, "y": 12.54, "width": 28.0, "height": 2.0},
    "expense_budget":     {"pageNumber": 2, "x": 55.24, "y": 12.54, "width": 18.6, "height": 2.0},
    "annual_commitment":  {"pageNumber": 2, "x": 16.65, "y": 15.57, "width": 40.8, "height": 2.0},
    "obligations":        {"pageNumber": 2, "x": 16.69, "y": 18.62, "width": 18.9, "height": 2.0},
    "budget_balance":     {"pageNumber": 2, "x": 45.10, "y": 18.62, "width": 25.1, "height": 2.0},
    "approval_conditions":{"pageNumber": 2, "x": 16.65, "y": 21.66, "width": 17.8, "height": 2.0},
}


def extract_segments(page) -> list[dict]:
    words = page.extract_words() or []
    segments: list[dict] = []
    for w in words:
        text = w.get("text", "")
        if len(text) >= 3 and set(text) <= {".", " "}:
            segments.append(
                {
                    "x0": w["x0"],
                    "x1": w["x1"],
                    "top": w["top"],
                    "bottom": w["bottom"],
                }
            )
    segments.sort(key=lambda s: (round(s["top"], 1), -s["x1"]))
    return segments


def segment_to_field(page_num: int, seg: dict) -> dict:
    return {
        "pageNumber": page_num,
        "x": pct_x(seg["x0"]),
        "y": pct_y(seg["top"]),
        "width": max(pct_w(seg["x1"] - seg["x0"]), 8),
        "height": max(pct_h(seg["bottom"] - seg["top"]), 2.5),
    }


def main() -> None:
    if not PDF_PATH.exists():
        raise SystemExit(f"PDF not found: {PDF_PATH}")

    with pdfplumber.open(PDF_PATH) as pdf:
        page_segments = [extract_segments(page) for page in pdf.pages]

    results = []
    for field in FIELD_DEFS:
        page_num, seg_idx = SEGMENT_MAP[field["id"]]
        segments = page_segments[page_num - 1]
        if field["id"] in MANUAL_OVERRIDES:
            coords = MANUAL_OVERRIDES[field["id"]]
        elif seg_idx < len(segments):
            coords = segment_to_field(page_num, segments[seg_idx])
        else:
            coords = {"pageNumber": page_num, "x": 10.0, "y": 10.0, "width": 30.0, "height": 3.0}
        results.append({**field, **coords})

    OUT_JSON.parent.mkdir(parents=True, exist_ok=True)
    OUT_JSON.write_text(json.dumps(results, ensure_ascii=False, indent=2), encoding="utf-8")

    ts_lines = [
        "/** Auto-generated from scripts/extract-haknasot-fields.py – do not edit by hand. */",
        "import type { PdfFormFieldTemplate } from './pdf-form.types.js';",
        "",
        "export const HAKNASOT_FORM_TEMPLATE_ID = 'haknasot' as const;",
        "",
        "export const HAKNASOT_FORM_FIELDS = [",
    ]
    for f in results:
        label = f["label"].replace("\\", "\\\\").replace("'", "\\'")
        ts_lines.append("  {")
        ts_lines.append(f"    id: '{f['id']}',")
        ts_lines.append(f"    label: '{label}',")
        ts_lines.append(f"    type: '{f['type']}',")
        ts_lines.append(f"    section: '{f['section']}',")
        ts_lines.append(f"    pageNumber: {f['pageNumber']},")
        ts_lines.append(f"    x: {f['x']},")
        ts_lines.append(f"    y: {f['y']},")
        ts_lines.append(f"    width: {f['width']},")
        ts_lines.append(f"    height: {f['height']},")
        ts_lines.append("  },")
    ts_lines.extend([
        "] as const satisfies readonly PdfFormFieldTemplate[];",
        "",
        "export function getHaknasotFormFields(): PdfFormFieldTemplate[] {",
        "  return [...HAKNASOT_FORM_FIELDS];",
        "}",
        "",
    ])
    OUT_TS.write_text("\n".join(ts_lines), encoding="utf-8")

    print(f"Wrote {len(results)} fields")
    for i, seg in enumerate(page_segments[0]):
        print(f"  p1 seg {i}: y={pct_y(seg['top'])} x={pct_x(seg['x0'])}-{pct_x(seg['x1'])}")
    for i, seg in enumerate(page_segments[1]):
        print(f"  p2 seg {i}: y={pct_y(seg['top'])} x={pct_x(seg['x0'])}-{pct_x(seg['x1'])}")


if __name__ == "__main__":
    main()
