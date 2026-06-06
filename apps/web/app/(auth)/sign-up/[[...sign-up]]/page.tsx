'use client';

import { EmailPasswordSignUp } from '@/components/auth/EmailPasswordSignUp';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';

export default function SignUpPage() {
  return (
    <div className="relative flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="absolute end-6 top-6">
        <LanguageSwitcher />
      </div>
      <EmailPasswordSignUp />
    </div>
  );
}
