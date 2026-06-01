import { redirect } from 'next/navigation';

import { getServerAuth } from '@/lib/server-auth';
import { SignaturesClient } from './SignaturesClient';

export default async function SignaturesPage() {
  const { userId } = await getServerAuth();
  if (!userId) redirect('/sign-in');
  return <SignaturesClient />;
}
