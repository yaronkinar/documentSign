import { redirect } from 'next/navigation';
import type { DocumentDto } from '@docflow/shared';

import { apiClient } from '@/lib/api-client';
import { getServerAuth, getServerUserEmail } from '@/lib/server-auth';
import { DashboardClient } from './DashboardClient';

export default async function DashboardPage() {
  const { userId, token, sessionClaims } = await getServerAuth();
  if (!userId) redirect('/sign-in');

  const myEmail = await getServerUserEmail(sessionClaims);

  let documents: DocumentDto[] = [];
  try {
    documents = await apiClient.get<DocumentDto[]>('/documents', { token });
  } catch (err) {
    // Show empty state on API failure rather than crash the page
    // eslint-disable-next-line no-console
    console.error('[dashboard] failed to load documents', err);
  }

  return (
    <main className="mx-auto w-full max-w-6xl px-6 py-10">
      <DashboardClient
        documents={documents}
        myClerkId={userId}
        myEmail={myEmail}
      />
    </main>
  );
}
