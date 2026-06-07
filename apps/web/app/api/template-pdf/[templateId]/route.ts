import { readFile } from 'node:fs/promises';

import {
  HAKNASOT_FORM_TEMPLATE_ID,
  HEBREW_SAMPLE_PDF_FILENAME,
} from '@docflow/shared';
import { NextResponse } from 'next/server';

import { resolvePublicSamplePath } from '@/lib/resolve-public-sample';

const TEMPLATE_FILES: Record<string, string> = {
  [HAKNASOT_FORM_TEMPLATE_ID]: HEBREW_SAMPLE_PDF_FILENAME,
};

export async function GET(
  _req: Request,
  { params }: { params: { templateId: string } },
) {
  const filename = TEMPLATE_FILES[params.templateId];
  if (!filename) {
    return NextResponse.json({ error: 'Unknown template' }, { status: 404 });
  }

  const filePath = resolvePublicSamplePath(filename);
  if (!filePath) {
    return NextResponse.json(
      {
        error:
          'Template PDF not found. Run: npm run generate:haknasot-pdf',
      },
      { status: 404 },
    );
  }

  let bytes: Buffer;
  try {
    bytes = await readFile(filePath);
  } catch {
    return NextResponse.json(
      {
        error:
          'Template PDF not found. Run: npm run generate:haknasot-pdf',
      },
      { status: 404 },
    );
  }

  if (bytes.length === 0) {
    return NextResponse.json(
      { error: 'Template PDF is empty. Run: npm run generate:haknasot-pdf' },
      { status: 500 },
    );
  }

  // JSON avoids download managers (IDM, etc.) that intercept application/pdf.
  return NextResponse.json(
    { mimeType: 'application/pdf', data: bytes.toString('base64') },
    { headers: { 'Cache-Control': 'public, max-age=3600' } },
  );
}
