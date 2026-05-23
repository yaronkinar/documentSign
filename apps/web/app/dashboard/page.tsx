import { auth, currentUser } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import type { DocumentDto } from '@docflow/shared';

import { apiClient } from '@/lib/api-client';
import { DashboardClient } from './DashboardClient';

export default async function DashboardPage() {
  const { userId, getToken } = auth();
  if (!userId) redirect('/sign-in');

  const token = await getToken();
  const user = await currentUser();
  const myEmail =
    user?.primaryEmailAddress?.emailAddress?.toLowerCase() ?? '';

  let documents: DocumentDto[] = [];
  try {
    documents = await apiClient.get<DocumentDto[]>('/documents', { token });
  } catch (err) {
    // Show empty state on API failure rather than crash the page
    // eslint-disable-next-line no-console
    console.error('[dashboard] failed to load documents', err);
  }

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <DashboardClient
        documents={documents}
        myClerkId={userId}
        myEmail={myEmail}
      />
    </main>
  );
}
