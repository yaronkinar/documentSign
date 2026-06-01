import { redirect } from 'next/navigation';

import { getServerAuth } from '@/lib/server-auth';
import { UsersClient } from '../users/UsersClient';

export default async function SignerProfilesPage() {
  const { userId } = await getServerAuth();
  if (!userId) redirect('/sign-in');
  return <UsersClient />;
}
