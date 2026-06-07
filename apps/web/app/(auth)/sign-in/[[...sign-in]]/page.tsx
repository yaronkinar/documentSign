import { redirect } from 'next/navigation';

import { EmailPasswordSignIn } from '@/components/auth/EmailPasswordSignIn';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { getServerAuth } from '@/lib/server-auth';

export default async function SignInPage() {
  const { userId } = await getServerAuth();
  if (userId) {
    redirect(process.env.NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL ?? '/dashboard');
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="absolute end-6 top-6">
        <LanguageSwitcher />
      </div>
      <EmailPasswordSignIn />
    </div>
  );
}
