import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';

import { SignaturesClient } from './SignaturesClient';

export default async function SignaturesPage() {
  const { userId } = await auth();
  if (!userId) redirect('/sign-in');
  return <SignaturesClient />;
}
