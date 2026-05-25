import {
  Injectable,
  InternalServerErrorException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { PDFParse } from 'pdf-parse';

const MAX_TEXT_CHARS = 12_000;
const MAX_TEMPLATE_FIELD_PAGES = 8;

export interface ExtractedTemplateField {
  label: string;
  pageNumber: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface TemplateSignerHint {
  label: string;
  email?: string | null;
}

export interface SummarizeSigner {
  name: string | null;
  email: string;
  status: string;
  stepLabel?: string;
}

export interface SummarizeContext {
  title?: string;
  formValues?: Record<string, string>;
  signers?: SummarizeSigner[];
}

function clampPercent(value: unknown, min: number, max: number): number | null {
  const num = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(num)) return null;
  return Math.min(max, Math.max(min, num));
}

function normalizeExtractedTemplateFields(
  rawFields: unknown,
  pageCount: number,
): ExtractedTemplateField[] {
  if (!Array.isArray(rawFields)) return [];

  return rawFields
    .map((field): ExtractedTemplateField | null => {
      if (!field || typeof field !== 'object') return null;
      const record = field as Record<string, unknown>;
      const label =
        typeof record.label === 'string' && record.label.trim()
          ? record.label.trim()
          : null;
      const pageNumber = Math.trunc(Number(record.pageNumber));
      const x = clampPercent(record.x, 0, 99);
      const y = clampPercent(record.y, 0, 99);
      const width = clampPercent(record.width, 1, 100);
      const height = clampPercent(record.height, 1, 100);

      if (!label || !Number.isInteger(pageNumber) || pageNumber < 1) return null;
      if (pageCount > 0 && pageNumber > pageCount) return null;
      if (x == null || y == null || width == null || height == null) return null;

      return {
        label,
        pageNumber,
        x: Number(x.toFixed(2)),
        y: Number(y.toFixed(2)),
        width: Number(Math.min(width, 100 - x).toFixed(2)),
        height: Number(Math.min(height, 100 - y).toFixed(2)),
      };
    })
    .filter((field): field is ExtractedTemplateField => field !== null);
}

function buildTemplatePagesToInspect(pageCount?: number | null): number[] {
  if (!pageCount || pageCount <= MAX_TEMPLATE_FIELD_PAGES) {
    return Array.from(
      { length: Math.max(1, pageCount ?? MAX_TEMPLATE_FIELD_PAGES) },
      (_, index) => index + 1,
    );
  }

  const pages = new Set<number>();
  for (let page = 1; page <= 4; page += 1) pages.add(page);
  for (let page = pageCount - 3; page <= pageCount; page += 1) {
    pages.add(page);
  }
  return [...pages].sort((a, b) => a - b);
}

function buildTemplateSignerHintsText(signerHints: TemplateSignerHint[]): string {
  const lines = signerHints
    .map((signer) => {
      const label = signer.label.trim();
      if (!label) return null;
      return signer.email ? `- ${label} <${signer.email}>` : `- ${label}`;
    })
    .filter((line): line is string => line !== null);

  if (lines.length === 0) return '';

  return [
    'Known signers/users for this template:',
    ...lines,
    '',
    'When a detected signature or approval field belongs to one of these users/roles, use the exact listed label as the field label. If the document has unlabeled signature lines that appear in the same order as this list, assign the labels in this order. Do not use these labels for non-signature form fields.',
  ].join('\n');
}

function buildSummarizeUserMessage(
  text: string,
  ctx: SummarizeContext,
): string {
  const sections: string[] = [];
  if (ctx.title) {
    sections.push(`Document title: ${ctx.title}`);
  }
  if (ctx.formValues) {
    const entries = Object.entries(ctx.formValues).filter(
      ([, v]) => typeof v === 'string' && v.trim().length > 0,
    );
    if (entries.length > 0) {
      const lines = entries.map(([k, v]) => `- ${k}: ${v}`).join('\n');
      sections.push(`Form values:\n${lines}`);
    }
  }
  if (ctx.signers && ctx.signers.length > 0) {
    const lines = ctx.signers
      .map((s) => {
        const who = s.name ? `${s.name} <${s.email}>` : s.email;
        const role = s.stepLabel ? ` — ${s.stepLabel}` : '';
        return `- ${who}${role} (${s.status})`;
      })
      .join('\n');
    sections.push(`Signers:\n${lines}`);
  }
  if (text) {
    sections.push(`Document text:\n${text}`);
  }
  return sections.join('\n\n');
}

@Injectable()
export class AiService {
  async extractPdfText(buffer: Buffer): Promise<string> {
    const parser = new PDFParse({ data: buffer });
    try {
      const result = await parser.getText();
      return result.text.replace(/\s+/g, ' ').trim();
    } finally {
      await parser.destroy();
    }
  }

  async summarizeDocumentText(
    text: string,
    ctx: SummarizeContext = {},
  ): Promise<string> {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new ServiceUnavailableException(
        'AI summarization is not configured (missing OPENAI_API_KEY)',
      );
    }

    const trimmed = text.slice(0, MAX_TEXT_CHARS);
    const hasStructured =
      (ctx.formValues &&
        Object.values(ctx.formValues).some(
          (v) => typeof v === 'string' && v.trim().length > 0,
        )) ||
      (ctx.signers && ctx.signers.length > 0);
    if (!trimmed && !hasStructured) {
      throw new InternalServerErrorException(
        'No content available to summarize',
      );
    }

    const userMessage = buildSummarizeUserMessage(trimmed, ctx);

    const baseUrl =
      process.env.OPENAI_BASE_URL ?? 'https://api.openai.com/v1';
    const model = process.env.OPENAI_MODEL ?? 'gpt-4o-mini';
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        temperature: 0.3,
        messages: [
          {
            role: 'system',
            content:
              'You summarize documents for a signing workflow. Write 2-4 concise sentences covering: document type, parties involved, key terms or obligations, and anything signers should notice. Use BOTH the extracted PDF text AND the structured form values and signer list when present — these are authoritative and may contain details (amounts, dates, parties) that are clearer than the PDF text. Use the same language as the document (Hebrew if the document is in Hebrew). Do not invent facts not present in the inputs.',
          },
          {
            role: 'user',
            content: userMessage,
          },
        ],
      }),
    });

    if (!res.ok) {
      const errBody = await res.text().catch(() => '');
      throw new InternalServerErrorException(
        `AI summarization failed (${res.status}): ${errBody.slice(0, 200)}`,
      );
    }

    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const summary = data.choices?.[0]?.message?.content?.trim();
    if (!summary) {
      throw new InternalServerErrorException('AI returned an empty summary');
    }
    return summary;
  }

  async extractSignerRoles(text: string): Promise<string[]> {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new ServiceUnavailableException(
        'AI summarization is not configured (missing OPENAI_API_KEY)',
      );
    }

    const trimmed = text.slice(0, MAX_TEXT_CHARS);
    if (!trimmed) return [];

    const baseUrl =
      process.env.OPENAI_BASE_URL ?? 'https://api.openai.com/v1';
    const model = process.env.OPENAI_MODEL ?? 'gpt-4o-mini';
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        temperature: 0,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content:
              'You extract the list of signer/approver roles from a document. ' +
              'Look for signature blocks, approval lines, or signatory sections. ' +
              'Return ONLY a JSON object with a single key "signers" whose value is an array of role/title strings. ' +
              'Keep the original language of the document. Remove duplicates. ' +
              'Example: {"signers": ["מנהל האגף", "יועץ משפטי", "גזבר העירייה"]}',
          },
          {
            role: 'user',
            content: `Document text:\n${trimmed}`,
          },
        ],
      }),
    });

    if (!res.ok) {
      const errBody = await res.text().catch(() => '');
      throw new InternalServerErrorException(
        `AI signer extraction failed (${res.status}): ${errBody.slice(0, 200)}`,
      );
    }

    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const raw = data.choices?.[0]?.message?.content?.trim();
    if (!raw) return [];

    try {
      const parsed = JSON.parse(raw) as { signers?: unknown };
      if (Array.isArray(parsed.signers)) {
        return (parsed.signers as unknown[])
          .filter((s): s is string => typeof s === 'string' && s.trim().length > 0)
          .map((s) => s.trim());
      }
    } catch {
      // fall through
    }
    return [];
  }

  async extractTemplateFieldsFromPdf(
    buffer: Buffer,
    pageCount?: number | null,
    signerHints: TemplateSignerHint[] = [],
  ): Promise<ExtractedTemplateField[]> {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new ServiceUnavailableException(
        'AI field extraction is not configured (missing OPENAI_API_KEY)',
      );
    }

    const pagesToInspect = buildTemplatePagesToInspect(pageCount);
    const parser = new PDFParse({ data: buffer });
    let screenshots: Awaited<ReturnType<PDFParse['getScreenshot']>>['pages'];
    try {
      const result = await parser.getScreenshot({
        partial: pagesToInspect,
        desiredWidth: 1200,
        imageBuffer: false,
        imageDataUrl: true,
      });
      screenshots = result.pages;
    } finally {
      await parser.destroy();
    }

    if (screenshots.length === 0) {
      throw new InternalServerErrorException('Could not render PDF pages');
    }

    const baseUrl =
      process.env.OPENAI_BASE_URL ?? 'https://api.openai.com/v1';
    const model =
      process.env.OPENAI_VISION_MODEL ??
      process.env.OPENAI_MODEL ??
      'gpt-4o-mini';
    const signerHintsText = buildTemplateSignerHintsText(signerHints);
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        temperature: 0,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content:
              'You detect fillable or signable fields in PDF template page images. ' +
              'Return ONLY a JSON object with key "fields". Each field must have: ' +
              'label, pageNumber, x, y, width, height. Coordinates are percentages ' +
              'from the top-left corner of the page image. Put the box over the blank ' +
              'area where the user should type or sign, not over the label text. ' +
              'Keep labels in the document language. For signature and approval fields, prefer the exact known signer/user label when the field can be matched. Do not invent fields. Remove duplicates.',
          },
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: [
                  'Extract every visible signature, approval, date, initials, or fill-in field from these PDF template pages.',
                  signerHintsText,
                ]
                  .filter(Boolean)
                  .join('\n\n'),
              },
              ...screenshots.map((page) => ({
                type: 'image_url',
                image_url: {
                  url: page.dataUrl,
                  detail: 'high',
                },
              })),
            ],
          },
        ],
      }),
    });

    if (!res.ok) {
      const errBody = await res.text().catch(() => '');
      throw new InternalServerErrorException(
        `AI field extraction failed (${res.status}): ${errBody.slice(0, 200)}`,
      );
    }

    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const raw = data.choices?.[0]?.message?.content?.trim();
    if (!raw) return [];

    try {
      const parsed = JSON.parse(raw) as { fields?: unknown };
      return normalizeExtractedTemplateFields(
        parsed.fields,
        pageCount ?? pagesToInspect.at(-1) ?? MAX_TEMPLATE_FIELD_PAGES,
      );
    } catch {
      return [];
    }
  }
}
