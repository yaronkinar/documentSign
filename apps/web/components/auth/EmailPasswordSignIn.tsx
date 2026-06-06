'use client';

import { useSignIn } from '@clerk/nextjs';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import {
  AuthCard,
  AuthError,
  AuthField,
  AuthSubmitButton,
} from '@/components/auth/AuthCard';
import { AuthDivider, GoogleAuthButton } from '@/components/auth/GoogleAuthButton';
import { clerkErrorMessage } from '@/lib/clerk-error';
import { useTranslation } from '@/lib/i18n/LocaleProvider';

type EmailCodeFactor = {
  strategy: 'email_code';
  emailAddressId: string;
};

function isEmailCodeFactor(factor: { strategy: string }): factor is EmailCodeFactor {
  return factor.strategy === 'email_code' && 'emailAddressId' in factor;
}

export function EmailPasswordSignIn() {
  const { isLoaded, signIn, setActive } = useSignIn();
  const router = useRouter();
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [needsSecondFactor, setNeedsSecondFactor] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const afterSignInUrl =
    process.env.NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL ?? '/dashboard';

  async function completeSignIn(sessionId: string | null) {
    if (!sessionId || !setActive) {
      setError(t('auth.signInFailed'));
      return;
    }
    await setActive({ session: sessionId });
    router.push(afterSignInUrl);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!isLoaded) return;
    setLoading(true);
    setError(null);
    try {
      const signInAttempt = await signIn.create({
        identifier: email.trim(),
        password,
      });

      if (signInAttempt.status === 'complete') {
        await completeSignIn(signInAttempt.createdSessionId);
        return;
      }

      if (signInAttempt.status === 'needs_second_factor') {
        const emailCodeFactor = (
          signInAttempt.supportedSecondFactors as Array<{
            strategy: string;
            emailAddressId?: string;
          }> | null | undefined
        )?.find(isEmailCodeFactor);
        if (!emailCodeFactor) {
          setError(t('auth.secondFactorRequired'));
          return;
        }
        await signIn.prepareSecondFactor({
          strategy: 'email_code',
          emailAddressId: emailCodeFactor.emailAddressId,
        } as unknown as Parameters<typeof signIn.prepareSecondFactor>[0]);
        setNeedsSecondFactor(true);
        return;
      }

      setError(t('auth.signInFailed'));
    } catch (err) {
      setError(clerkErrorMessage(err, t('auth.signInFailed')));
    } finally {
      setLoading(false);
    }
  }

  async function handleVerifySecondFactor(e: React.FormEvent) {
    e.preventDefault();
    if (!isLoaded) return;
    setLoading(true);
    setError(null);
    try {
      const signInAttempt = await signIn.attemptSecondFactor({
        strategy: 'email_code',
        code: code.trim(),
      } as unknown as Parameters<typeof signIn.attemptSecondFactor>[0]);
      if (signInAttempt.status === 'complete') {
        await completeSignIn(signInAttempt.createdSessionId);
        return;
      }
      setError(t('auth.verificationFailed'));
    } catch (err) {
      setError(clerkErrorMessage(err, t('auth.verificationFailed')));
    } finally {
      setLoading(false);
    }
  }

  if (needsSecondFactor) {
    return (
      <AuthCard
        title={t('auth.verifySignInTitle')}
        subtitle={t('auth.verifySignInSubtitle')}
        footer={
          <button
            type="button"
            onClick={() => {
              setNeedsSecondFactor(false);
              setCode('');
              setError(null);
            }}
            className="text-blue-700 hover:underline"
          >
            {t('auth.backToPassword')}
          </button>
        }
      >
        <form className="space-y-4" onSubmit={handleVerifySecondFactor}>
          <AuthError message={error} />
          <AuthField
            id="code"
            label={t('auth.verificationCode')}
            value={code}
            onChange={setCode}
            autoComplete="one-time-code"
            placeholder={t('auth.verificationCodePlaceholder')}
          />
          <AuthSubmitButton disabled={loading || !code.trim()}>
            {loading ? t('common.saving') : t('auth.verifyAndContinue')}
          </AuthSubmitButton>
        </form>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title={t('auth.signInTitle')}
      subtitle={t('auth.signInSubtitle')}
      footer={
        <>
          {t('auth.noAccount')}{' '}
          <Link href="/sign-up" className="font-medium text-blue-700 hover:underline">
            {t('common.signUp')}
          </Link>
        </>
      }
    >
      <div className="space-y-4">
        <GoogleAuthButton mode="sign-in" disabled={loading} onError={setError} />
        <AuthDivider />
        <form className="space-y-4" onSubmit={handleSubmit}>
          <AuthError message={error} />
        <AuthField
          id="email"
          label={t('auth.email')}
          type="email"
          value={email}
          onChange={setEmail}
          autoComplete="email"
          placeholder={t('auth.emailPlaceholder')}
        />
        <AuthField
          id="password"
          label={t('auth.password')}
          type="password"
          value={password}
          onChange={setPassword}
          autoComplete="current-password"
          placeholder={t('auth.passwordPlaceholder')}
        />
        <AuthSubmitButton disabled={loading || !email.trim() || !password}>
          {loading ? t('common.saving') : t('common.signIn')}
        </AuthSubmitButton>
        </form>
      </div>
    </AuthCard>
  );
}
