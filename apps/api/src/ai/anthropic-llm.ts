import Anthropic from '@anthropic-ai/sdk';

const DEFAULT_MODEL = process.env.ANTHROPIC_MODEL ?? 'claude-opus-4-8';

let client: Anthropic | null = null;

export function anthropicConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY?.trim());
}

/** Use Claude when AI_PROVIDER=anthropic and ANTHROPIC_API_KEY is set. */
export function preferAnthropic(): boolean {
  const provider = (process.env.AI_PROVIDER ?? 'openai').toLowerCase();
  return provider === 'anthropic' && anthropicConfigured();
}

function getClient(): Anthropic {
  if (!client) {
    const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
    if (!apiKey) {
      throw new Error('ANTHROPIC_API_KEY is not configured');
    }
    client = new Anthropic({ apiKey });
  }
  return client;
}

function logCacheUsage(usage: Anthropic.Usage | undefined, label: string): void {
  if (process.env.AI_CACHE_DEBUG !== 'true' || !usage) return;
  console.info(
    `[ai-cache:${label}] read=${usage.cache_read_input_tokens ?? 0} ` +
      `write=${usage.cache_creation_input_tokens ?? 0} ` +
      `uncached=${usage.input_tokens ?? 0}`,
  );
}

function extractText(response: Anthropic.Message): string {
  const text = response.content.find((block) => block.type === 'text');
  if (!text || text.type !== 'text' || !text.text.trim()) {
    throw new Error('Claude returned an empty response');
  }
  return text.text.trim();
}

function dataUrlToImageBlock(dataUrl: string): Anthropic.ImageBlockParam {
  const match = /^data:([^;]+);base64,(.+)$/.exec(dataUrl);
  if (!match) {
    throw new Error('Invalid image data URL for Claude vision');
  }
  const mediaType = match[1] as Anthropic.Base64ImageSource['media_type'];
  return {
    type: 'image',
    source: { type: 'base64', media_type: mediaType, data: match[2] },
  };
}

/** Text completion with prompt caching on the stable system prompt. */
export async function anthropicCompleteText(params: {
  system: string;
  user: string;
  label: string;
}): Promise<string> {
  const stream = getClient().messages.stream({
    model: DEFAULT_MODEL,
    max_tokens: 16000,
    thinking: { type: 'adaptive' },
    output_config: { effort: 'high' },
    system: [
      {
        type: 'text',
        text: params.system,
        cache_control: { type: 'ephemeral' },
      },
    ],
    messages: [{ role: 'user', content: params.user }],
  });
  const response = await stream.finalMessage();
  logCacheUsage(response.usage, params.label);
  return extractText(response);
}

export interface AnthropicVisionPage {
  pageNumber: number;
  totalPages: number;
  dataUrl: string;
}

/** Vision + JSON extraction; caches the field-detection system prompt across uploads. */
export async function anthropicVisionExtract(params: {
  system: string;
  userIntro: string;
  pages: AnthropicVisionPage[];
  label: string;
}): Promise<string> {
  const model =
    process.env.ANTHROPIC_VISION_MODEL?.trim() ??
    process.env.ANTHROPIC_MODEL?.trim() ??
    DEFAULT_MODEL;

  const content: Anthropic.ContentBlockParam[] = [
    { type: 'text', text: params.userIntro },
  ];
  for (const page of params.pages) {
    content.push({
      type: 'text',
      text:
        `PDF page ${page.pageNumber} of ${page.totalPages}. Return only fields on this page with pageNumber=${page.pageNumber}. ` +
        'x,y,width,height are percents (0–100) of this page, origin top-left, box on the blank/sign line.',
    });
    content.push(dataUrlToImageBlock(page.dataUrl));
  }

  const stream = getClient().messages.stream({
    model,
    max_tokens: 64000,
    thinking: { type: 'adaptive' },
    output_config: { effort: 'high' },
    system: [
      {
        type: 'text',
        text: params.system,
        cache_control: { type: 'ephemeral' },
      },
    ],
    messages: [{ role: 'user', content }],
  });
  const response = await stream.finalMessage();
  logCacheUsage(response.usage, params.label);
  return extractText(response);
}
