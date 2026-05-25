import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import type { PdfTemplateDto } from '@docflow/shared';

import { apiClient } from '@/lib/api-client';
import { TemplatesPageClient } from './TemplatesPageClient';

export default async function TemplatesPage() {
  const { userId, getToken } = auth();
  if (!userId) redirect('/sign-in');

  const token = await getToken();
  let templates: PdfTemplateDto[] = [];
  try {
    templates = await apiClient.get<PdfTemplateDto[]>('/templates', { token });
  } catch {
    // show empty state on API failure
  }

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <TemplatesPageClient initialTemplates={templates} />
    </main>
  );
}
