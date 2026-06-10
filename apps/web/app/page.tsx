import { redirect } from 'next/navigation';

import { getServerAuth } from '@/lib/server-auth';
import { HomePageContent } from './HomePageContent';

export default async function HomePage() {
  const { userId } = await getServerAuth();
  if (userId) {
    redirect(process.env.NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL ?? '/dashboard');
  }

  return <HomePageContent />;
}
