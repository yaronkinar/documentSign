import { redirect } from 'next/navigation';
import type { PdfTemplateDto } from '@docflow/shared';

import { apiClient } from '@/lib/api-client';
import { getServerAuth } from '@/lib/server-auth';
import { TemplatesPageClient } from './TemplatesPageClient';

export default async function TemplatesPage() {
  const { userId, token } = await getServerAuth();
  if (!userId) redirect('/sign-in');

  let templates: PdfTemplateDto[] = [];
  try {
    templates = await apiClient.get<PdfTemplateDto[]>('/templates', { token });
  } catch {
    // show empty state on API failure
  }

  return (
    <main className="mx-auto w-full max-w-6xl px-6 py-10">
      <TemplatesPageClient initialTemplates={templates} />
    </main>
  );
}
