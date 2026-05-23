import type { GuestSigningDataDto } from '@docflow/shared';

import { apiClient } from '@/lib/api-client';
import { GuestSignClient } from './GuestSignClient';
import { GuestSignErrorScreen } from './GuestSignErrorScreen';

interface PageProps {
  params: { docId: string };
  searchParams: { token?: string };
}

export default async function GuestSignPage({ params, searchParams }: PageProps) {
  const token = searchParams.token;
  if (!token) {
    return (
      <GuestSignErrorScreen
        titleKey="sign.invalidLinkTitle"
        bodyKey="sign.invalidLinkBody"
      />
    );
  }

  let data: GuestSigningDataDto;
  try {
    data = await apiClient.get<GuestSigningDataDto>(`/sign/${params.docId}`, {
      query: { token },
    });
  } catch (err) {
    const message =
      err instanceof Error && err.message ? err.message : 'Link expired';
    return (
      <GuestSignErrorScreen
        titleKey="sign.expiredTitle"
        bodyKey="sign.expiredBody"
        bodyValues={{ message }}
      />
    );
  }

  if (data.alreadySigned) {
    return (
      <GuestSignErrorScreen
        titleKey="sign.alreadySignedTitle"
        bodyKey="sign.alreadySignedBody"
        bodyValues={{ title: data.documentTitle }}
      />
    );
  }

  return (
    <GuestSignClient
      documentId={params.docId}
      inviteToken={token}
      data={data}
    />
  );
}
