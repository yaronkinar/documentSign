import { auth, currentUser } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import type { DocumentDto, SignatureDto, CommentDto, SignatureFieldDto } from '@docflow/shared';

import { apiClient, ApiError } from '@/lib/api-client';
import { DocumentLoadError } from './DocumentLoadError';
import { DocumentViewerClient } from './DocumentViewerClient';

interface PageProps {
  params: { id: string };
}

export default async function DocumentViewerPage({ params }: PageProps) {
  const { userId, getToken } = auth();
  if (!userId) redirect('/sign-in');

  const token = await getToken();
  const user = await currentUser();
  const myEmail =
    user?.primaryEmailAddress?.emailAddress?.toLowerCase() ?? '';

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
