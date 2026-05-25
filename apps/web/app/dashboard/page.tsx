import { auth, currentUser } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import type { DocumentDto } from '@docflow/shared';

import { apiClient } from '@/lib/api-client';
import { DashboardClient } from './DashboardClient';

function emailFromSessionClaims(claims: unknown): string {
  if (!claims || typeof claims !== 'object') return '';
  const record = claims as Record<string, unknown>;
  const email =
    record.email ??
    record.email_address ??
    record.primary_email_address ??
    record.primaryEmailAddress;
  return typeof email === 'string' ? email.toLowerCase() : '';
}

export default async function DashboardPage() {
  const clerkAuth = auth();
  const { userId, getToken } = clerkAuth;
  if (!userId) redirect('/sign-in');

  const token = await getToken();
  let myEmail = emailFromSessionClaims(clerkAuth.sessionClaims);
  try {
    const user = await currentUser();
    myEmail =
      user?.primaryEmailAddress?.emailAddress?.toLowerCase() ?? myEmail;
  } catch (err) {
    // Clerk user lookup is non-critical for rendering the dashboard.
    // eslint-disable-next-line no-console
    console.error('[dashboard] failed to load current user', err);
  }

  let documents: DocumentDto[] = [];
  try {
    documents = await apiClient.get<DocumentDto[]>('/documents', { token });
  } catch (err) {
    // Show empty state on API failure rather than crash the page
    // eslint-disable-next-line no-console
    console.error('[dashboard] failed to load documents', err);
  }

  return (
    <main className="mx-auto max-w-7xl px-6 py-10">
      <DashboardClient
        documents={documents}
        myClerkId={userId}
        myEmail={myEmail}
      />
    </main>
  );
}
