import {
  Injectable,
  InternalServerErrorException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { PDFParse } from 'pdf-parse';

const MAX_TEXT_CHARS = 12_000;

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

  async summarizeDocumentText(text: string, title?: string): Promise<string> {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new ServiceUnavailableException(
        'AI summarization is not configured (missing OPENAI_API_KEY)',
      );
    }

    const trimmed = text.slice(0, MAX_TEXT_CHARS);
    if (!trimmed) {
      throw new InternalServerErrorException(
        'Could not extract readable text from the PDF',
      );
    }

    const model = process.env.OPENAI_MODEL ?? 'gpt-4o-mini';
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
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
              'You summarize documents for a signing workflow. Write 2-4 concise sentences covering: document type, parties involved, key terms or obligations, and anything signers should notice. Use the same language as the document (Hebrew if the document is in Hebrew). Do not invent facts not present in the text.',
          },
          {
            role: 'user',
            content: title
              ? `Document title: ${title}\n\nDocument text:\n${trimmed}`
              : `Document text:\n${trimmed}`,
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

    const model = process.env.OPENAI_MODEL ?? 'gpt-4o-mini';
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
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
}
