import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import type { OnboardingStatus, UserMeDto } from '@docflow/shared';

import { apiClient } from '@/lib/api-client';
import { serverTranslate, resolveServerLocale } from '@/lib/i18n/server';
import { getServerAuth } from '@/lib/server-auth';
import { OnboardingClient } from './OnboardingClient';

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ replay?: string }>;
}): Promise<Metadata> {
  const params = await searchParams;
  const replay = params.replay === '1';
  const locale = resolveServerLocale();
  return {
    title: replay
      ? serverTranslate('onboarding.meta.replayTitle', locale)
      : serverTranslate('onboarding.meta.title', locale),
  };
}

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ replay?: string }>;
}) {
  const { userId, token } = await getServerAuth();
  if (!userId) redirect('/sign-in');

  const params = await searchParams;
  const replay = params.replay === '1';

  let onboardingStatus: OnboardingStatus = 'pending';
  try {
    const me = await apiClient.get<UserMeDto>('/users/me', { token });
    onboardingStatus = me.onboardingStatus;
  } catch {
    // Allow the client to render; status updates will fail gracefully.
  }

  if (!replay && onboardingStatus !== 'pending') {
    redirect('/dashboard');
  }

  return (
    <OnboardingClient replay={replay} initialStatus={onboardingStatus} />
  );
}
