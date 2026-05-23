"""Print y-position of key form labels in the haknasot PDF, so we can tell whether the form-fields JSON coordinates match the actual visible labels."""
from __future__ import annotations

from pathlib import Path

import pdfplumber

ROOT = Path(__file__).resolve().parents[1]
PDF_PATH = ROOT / "apps" / "web" / "public" / "samples" / "haknasot.pdf"

LABELS_OF_INTEREST = [
    "סוג",
    "חדש",
    "הרחבה",
    "הארכה",
    "הערכה",
    "תאריך",
    "ספק",
    "מהות",
    "תוקף",
    "הארכות",
    "אגף",
    "שם",
    "ח.פ",
    "תקציר",
    "הכנסה",
    "מכירה",
    "תרומות",
    "קבלן",
    "שירות",
    "ממשלה",
    "דרישות",
    "הזמנות",
]


def main() -> None:
    with pdfplumber.open(PDF_PATH) as pdf:
        for page_idx, page in enumerate(pdf.pages, start=1):
            print(f"\n--- Page {page_idx}: size = {page.width:.1f} x {page.height:.1f} ---")
            words = page.extract_words() or []
            print(f"Total words extracted: {len(words)}")
            for i, w in enumerate(words):
                text = w.get("text", "")
                top = w["top"]
                x0 = w["x0"]
                x1 = w["x1"]
                y_pct = round(top / page.height * 100, 2)
                x_pct = round(x0 / page.width * 100, 2)
                print(f"  [{i:3d}]  y={y_pct:5.2f}%  x={x_pct:5.2f}%-{round(x1/page.width*100,2):5.2f}%  '{text}'")


if __name__ == "__main__":
    main()
