import { AiService, normalizeExtractedTemplateFields } from './ai.service';

jest.mock('./anthropic-llm', () => ({
  preferAnthropic: jest.fn(),
  anthropicCompleteText: jest.fn(),
  anthropicVisionExtract: jest.fn(),
}));

import {
  anthropicCompleteText,
  preferAnthropic,
} from './anthropic-llm';

describe('normalizeExtractedTemplateFields', () => {
  it('carries the value field through when present', () => {
    const fields = normalizeExtractedTemplateFields(
      [
        {
          label: 'מספר בקשה',
          pageNumber: 1,
          x: 10,
          y: 10,
          width: 20,
          height: 4,
          value: '2026-0847',
        },
      ],
      1,
    );

    expect(fields[0]!.value).toBe('2026-0847');
  });

  it('omits value when not present or not a string', () => {
    const fields = normalizeExtractedTemplateFields(
      [{ label: 'חתימה', pageNumber: 1, x: 10, y: 10, width: 20, height: 4, value: 42 }],
      1,
    );

    expect(fields[0]!.value).toBeUndefined();
  });
});

describe('AiService.summarizeDocumentText', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('asks Claude for about 5 sentences', async () => {
    (preferAnthropic as jest.Mock).mockReturnValue(true);
    (anthropicCompleteText as jest.Mock).mockResolvedValue('A summary.');

    const service = new AiService();
    await service.summarizeDocumentText('some contract text');

    const call = (anthropicCompleteText as jest.Mock).mock.calls[0][0];
    expect(call.system).toContain('about 5 concise sentences');
  });
});

describe('AiService.extractFormFieldValues', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const fields = [
    { id: 'supplier_name', label: 'שם ספק' },
    { id: 'contract_number', label: 'מספר חוזה' },
  ];

  it('returns only values for known field ids from the Claude JSON response', async () => {
    (preferAnthropic as jest.Mock).mockReturnValue(true);
    (anthropicCompleteText as jest.Mock).mockResolvedValue(
      JSON.stringify({
        values: {
          supplier_name: 'חברת דוגמה בע"מ',
          contract_number: 'CN-2026-789',
          unknown_field: 'should be dropped',
        },
      }),
    );

    const service = new AiService();
    const result = await service.extractFormFieldValues(
      'document text mentioning חברת דוגמה בע"מ and CN-2026-789',
      fields,
    );

    expect(result).toEqual({
      supplier_name: 'חברת דוגמה בע"מ',
      contract_number: 'CN-2026-789',
    });
  });

  it('returns an empty object when the model response is not valid JSON', async () => {
    (preferAnthropic as jest.Mock).mockReturnValue(true);
    (anthropicCompleteText as jest.Mock).mockResolvedValue('not json');

    const service = new AiService();
    const result = await service.extractFormFieldValues('some text', fields);

    expect(result).toEqual({});
  });

  it('returns an empty object without calling the model when there are no fields', async () => {
    (preferAnthropic as jest.Mock).mockReturnValue(true);

    const service = new AiService();
    const result = await service.extractFormFieldValues('some text', []);

    expect(result).toEqual({});
    expect(anthropicCompleteText).not.toHaveBeenCalled();
  });
});
