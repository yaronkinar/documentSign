import { auth } from '@clerk/nextjs/server';
import { redirect, notFound } from 'next/navigation';
import type { PdfTemplateDto } from '@docflow/shared';

import { apiClient } from '@/lib/api-client';
import { TemplateEditorClient } from './TemplateEditorClient';

interface Props {
  params: { id: string };
}

export default async function TemplateEditorPage({ params }: Props) {
  const { userId, getToken } = auth();
  if (!userId) redirect('/sign-in');

  const token = await getToken();
  let template: PdfTemplateDto | null = null;
  try {
    template = await apiClient.get<PdfTemplateDto>(`/templates/${params.id}`, { token });
  } catch {
    notFound();
  }

  if (!template) notFound();

  return (
    <main className="flex h-[calc(100vh-56px)] overflow-hidden">
      <TemplateEditorClient template={template} />
    </main>
  );
}
