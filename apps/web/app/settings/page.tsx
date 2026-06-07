import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { resolveServerLocale, serverTranslate } from '@/lib/i18n/server';
import { getServerAuth } from '@/lib/server-auth';
import { AppearanceSection } from './AppearanceSection';
import { OnboardingSection } from './OnboardingSection';

export async function generateMetadata(): Promise<Metadata> {
  const locale = resolveServerLocale();
  return {
    title: serverTranslate('settings.meta.title', locale),
  };
}

export default async function SettingsPage() {
  const { userId } = await getServerAuth();
  if (!userId) redirect('/sign-in');

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-10">
      <div className="flex flex-col gap-8">
        <AppearanceSection />
        <OnboardingSection />
      </div>
    </main>
  );
}
