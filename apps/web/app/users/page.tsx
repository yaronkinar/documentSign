import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';

import { UsersClient } from './UsersClient';

export default async function UsersPage() {
  const { userId } = await auth();
  if (!userId) redirect('/sign-in');
  return <UsersClient />;
}
