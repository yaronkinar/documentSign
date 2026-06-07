import { redirect } from 'next/navigation';

import { getServerAuth } from '@/lib/server-auth';
import { AppearanceSection } from './AppearanceSection';

export const metadata = {
  title: 'Settings — DocFlow',
};

export default async function SettingsPage() {
  const { userId } = await getServerAuth();
  if (!userId) redirect('/sign-in');

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-10">
      <AppearanceSection />
    </main>
  );
}
