import { redirect } from 'next/navigation';

import { getServerAuth } from '@/lib/server-auth';
import { UsersClient } from './UsersClient';

export default async function UsersPage() {
  const { userId } = await getServerAuth();
  if (!userId) redirect('/sign-in');
  return <UsersClient />;
}
