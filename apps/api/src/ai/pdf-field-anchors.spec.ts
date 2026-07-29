import { resolveFieldReferenceValues } from './pdf-field-anchors';
import type { PdfTextLine } from './pdf-field-anchors';
import type { ExtractedTemplateField } from './extracted-template-field';

describe('resolveFieldReferenceValues', () => {
  const lines: PdfTextLine[] = [
    { pageNumber: 1, str: '2026-0847', xPct: 20, yTopPct: 10, widthPct: 15 },
    { pageNumber: 1, str: 'מספר בקשה', xPct: 60, yTopPct: 10, widthPct: 15 },
    { pageNumber: 2, str: 'ignored other page', xPct: 20, yTopPct: 10, widthPct: 15 },
  ];

  it('keeps a value the PDF text layer confirms', () => {
    const fields: ExtractedTemplateField[] = [
      {
        label: 'מספר בקשה',
        pageNumber: 1,
        x: 5,
        y: 5,
        width: 20,
        height: 4,
        value: '2026-0847',
      },
    ];

    const result = resolveFieldReferenceValues(fields, lines);

    expect(result[0]!.value).toBe('2026-0847');
  });

  it('moves the box onto the text it matched', () => {
    // Vision reads values well but places them badly, so the text layer owns
    // the position: this field claimed x=5,y=5 but the text sits at x=20,y=10.
    const fields: ExtractedTemplateField[] = [
      {
        label: 'מספר בקשה',
        pageNumber: 1,
        x: 5,
        y: 5,
        width: 20,
        height: 4,
        value: '2026-0847',
      },
    ];

    const result = resolveFieldReferenceValues(fields, lines);

    expect(result[0]!.x).toBeCloseTo(20, 1);
    expect(result[0]!.y).toBeCloseTo(9.5, 1);
  });

  it('drops a value the text layer cannot confirm', () => {
    // The model confidently reports values that never appear in the document.
    // Shown as "what the source says", an unverifiable value is worse than none.
    const fields: ExtractedTemplateField[] = [
      {
        label: 'עיר',
        pageNumber: 1,
        x: 20,
        y: 10,
        width: 20,
        height: 4,
        value: 'תל אביב',
      },
    ];

    const result = resolveFieldReferenceValues(fields, lines);

    expect(result[0]!.value).toBeUndefined();
  });

  it('ignores matches on other pages', () => {
    const fields: ExtractedTemplateField[] = [
      {
        label: 'x',
        pageNumber: 1,
        x: 20,
        y: 10,
        width: 20,
        height: 4,
        value: 'ignored other page',
      },
    ];

    const result = resolveFieldReferenceValues(fields, lines);

    expect(result[0]!.value).toBeUndefined();
  });

  it('leaves value unset when vision gave nothing', () => {
    const fields: ExtractedTemplateField[] = [
      { label: 'חתימה', pageNumber: 1, x: 70, y: 80, width: 20, height: 4 },
    ];

    const result = resolveFieldReferenceValues(fields, lines);

    expect(result[0]!.value).toBeUndefined();
  });

  it('does not trust values too short to match meaningfully', () => {
    const fields: ExtractedTemplateField[] = [
      { label: 'קומות', pageNumber: 1, x: 20, y: 10, width: 20, height: 4, value: '20' },
    ];

    const result = resolveFieldReferenceValues(fields, lines);

    expect(result[0]!.value).toBeUndefined();
  });
});
