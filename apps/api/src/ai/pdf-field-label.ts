/** Drop AI-invented labels not grounded in PDF text (e.g. saved contact names). */
export function fieldLabelAppearsInPdfText(label: string, pdfText: string): boolean {
  const trimmed = label.trim();
  if (!trimmed) return false;
  const hay = pdfText.toLowerCase();
  const needle = trimmed.toLowerCase();
  if (needle.length >= 3 && hay.includes(needle)) return true;
  const words = needle.split(/\s+/).filter((w) => w.length > 2);
  if (words.length === 0) return true;
  const matched = words.filter((w) => hay.includes(w)).length;
  return matched / words.length >= 0.6;
}
