'use client';

import { SignIn } from '@clerk/nextjs';

import { LanguageSwitcher } from '@/components/LanguageSwitcher';

export default function SignInPage() {
  return (
    <div className="relative flex min-h-screen items-center justify-center">
      <div className="absolute end-6 top-6">
        <LanguageSwitcher />
      </div>
      <SignIn />
    </div>
  );
}
