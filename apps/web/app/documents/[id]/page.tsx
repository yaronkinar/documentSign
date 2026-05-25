import { auth, currentUser } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import type { DocumentDto, SignatureDto, CommentDto, SignatureFieldDto } from '@docflow/shared';

import { apiClient, ApiError } from '@/lib/api-client';
import { DocumentLoadError } from './DocumentLoadError';
import { DocumentViewerClient } from './DocumentViewerClient';

interface PageProps {
  params: { id: string };
}

const BYPASS = process.env.BYPASS_AUTH === 'true';
const BYPASS_CLERK_ID = 'bypass-dev-user';
const BYPASS_EMAIL = process.env.BYPASS_AUTH_EMAIL ?? 'test@example.com';
const BYPASS_TOKEN = process.env.BYPASS_TOKEN ?? 'dev-bypass-token-local';

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

export default async function DocumentViewerPage({ params }: PageProps) {
  let userId: string;
  let token: string | null;
  let myEmail: string;

  if (BYPASS) {
    userId = BYPASS_CLERK_ID;
    token = BYPASS_TOKEN;
    myEmail = BYPASS_EMAIL;
  } else {
    const clerkAuth = auth();
    if (!clerkAuth.userId) redirect('/sign-in');
    userId = clerkAuth.userId;
    token = await clerkAuth.getToken();
    myEmail = emailFromSessionClaims(clerkAuth.sessionClaims);
    try {
      const user = await currentUser();
      myEmail =
        user?.primaryEmailAddress?.emailAddress?.toLowerCase() ?? myEmail;
    } catch (err) {
      // The document can still render with a Clerk id if user lookup fails.
      // eslint-disable-next-line no-console
      console.error('[document] failed to load current user', err);
    }
  }

  let doc: DocumentDto;
  try {
    doc = await apiClient.get<DocumentDto>(`/documents/${params.id}`, { token });
  } catch (err) {
    const message =
      err instanceof ApiError
        ? err.message
        : err instanceof Error
          ? err.message
          : 'Failed to load document';
    return <DocumentLoadError message={message} />;
  }

  const [signatures, comments, signatureFields] = await Promise.all([
    apiClient
      .get<SignatureDto[]>(`/documents/${params.id}/signatures`, { token })
      .catch(() => [] as SignatureDto[]),
    apiClient
      .get<CommentDto[]>(`/documents/${params.id}/comments`, { token })
      .catch(() => [] as CommentDto[]),
    apiClient
      .get<SignatureFieldDto[]>(`/documents/${params.id}/signature-fields`, {
        token,
      })
      .catch(() => [] as SignatureFieldDto[]),
  ]);

  return (
    <DocumentViewerClient
      doc={doc}
      initialSignatures={signatures}
      initialSignatureFields={signatureFields}
      initialComments={comments}
      myClerkId={userId}
      myEmail={myEmail}
    />
  );
}
