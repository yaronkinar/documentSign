import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';

import { UsersClient } from '../users/UsersClient';

export default async function SignerProfilesPage() {
  const { userId } = await auth();
  if (!userId) redirect('/sign-in');
  return <UsersClient />;
}
