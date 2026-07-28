import { resolveFieldReferenceValues } from './pdf-field-anchors';
import type { PdfTextLine } from './pdf-field-anchors';
import type { ExtractedTemplateField } from './extracted-template-field';

describe('resolveFieldReferenceValues', () => {
  const lines: PdfTextLine[] = [
    { pageNumber: 1, str: '2026-0847', xPct: 20, yTopPct: 10, widthPct: 15 },
    { pageNumber: 1, str: 'מספר בקשה', xPct: 60, yTopPct: 10, widthPct: 15 },
    { pageNumber: 2, str: 'ignored other page', xPct: 20, yTopPct: 10, widthPct: 15 },
  ];

  it('overrides the field value with exact text overlapping its box', () => {
    const fields: ExtractedTemplateField[] = [
      {
        label: 'מספר בקשה',
        pageNumber: 1,
        x: 18,
        y: 8,
        width: 20,
        height: 4,
        value: 'guessed-by-vision',
      },
    ];

    const result = resolveFieldReferenceValues(fields, lines);

    expect(result[0]!.value).toBe('2026-0847');
  });

  it('falls back to the vision-provided value when no text line overlaps', () => {
    const fields: ExtractedTemplateField[] = [
      { label: 'חתימה', pageNumber: 1, x: 70, y: 80, width: 20, height: 4, value: 'from-vision' },
    ];

    const result = resolveFieldReferenceValues(fields, lines);

    expect(result[0]!.value).toBe('from-vision');
  });

  it('leaves value unset when nothing overlaps and vision gave nothing', () => {
    const fields: ExtractedTemplateField[] = [
      { label: 'חתימה', pageNumber: 1, x: 70, y: 80, width: 20, height: 4 },
    ];

    const result = resolveFieldReferenceValues(fields, lines);

    expect(result[0]!.value).toBeUndefined();
  });
});
