import { AiService } from './ai.service';

jest.mock('./anthropic-llm', () => ({
  preferAnthropic: jest.fn(),
  anthropicCompleteText: jest.fn(),
  anthropicVisionExtract: jest.fn(),
}));

import {
  anthropicCompleteText,
  preferAnthropic,
} from './anthropic-llm';

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
