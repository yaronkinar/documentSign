'use client';

import { useSignUp } from '@clerk/nextjs';
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

export function EmailPasswordSignUp() {
  const { isLoaded, signUp, setActive } = useSignUp();
  const router = useRouter();
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [pendingVerification, setPendingVerification] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const afterSignUpUrl =
    process.env.NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL ?? '/onboarding';

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!isLoaded) return;
    setLoading(true);
    setError(null);
    try {
      await signUp.create({
        emailAddress: email.trim(),
        password,
      });
      await signUp.prepareEmailAddressVerification({ strategy: 'email_code' });
      setPendingVerification(true);
    } catch (err) {
      setError(clerkErrorMessage(err, t('auth.signUpFailed')));
    } finally {
      setLoading(false);
    }
  }

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    if (!isLoaded) return;
    setLoading(true);
    setError(null);
    try {
      const result = await signUp.attemptEmailAddressVerification({
        code: code.trim(),
      });
      if (result.status === 'complete') {
        await setActive({ session: result.createdSessionId });
        router.push(afterSignUpUrl);
        return;
      }
      setError(t('auth.verificationFailed'));
    } catch (err) {
      setError(clerkErrorMessage(err, t('auth.verificationFailed')));
    } finally {
      setLoading(false);
    }
  }

  async function resendCode() {
    if (!isLoaded) return;
    setLoading(true);
    setError(null);
    try {
      await signUp.prepareEmailAddressVerification({ strategy: 'email_code' });
    } catch (err) {
      setError(clerkErrorMessage(err, t('auth.resendFailed')));
    } finally {
      setLoading(false);
    }
  }

  if (pendingVerification) {
    return (
      <AuthCard
        title={t('auth.verifyEmailTitle')}
        subtitle={t('auth.verifyEmailSubtitle')}
        footer={
          <button
            type="button"
            onClick={() => void resendCode()}
            disabled={loading}
            className="text-blue-700 hover:underline disabled:opacity-50"
          >
            {t('auth.resendCode')}
          </button>
        }
      >
        <form className="space-y-4" onSubmit={handleVerify}>
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
      title={t('auth.signUpTitle')}
      subtitle={t('auth.signUpSubtitle')}
      footer={
        <>
          {t('auth.haveAccount')}{' '}
          <Link href="/sign-in" className="font-medium text-blue-700 hover:underline">
            {t('common.signIn')}
          </Link>
        </>
      }
    >
      <div className="space-y-4">
        <GoogleAuthButton mode="sign-up" disabled={loading} onError={setError} />
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
          autoComplete="new-password"
          placeholder={t('auth.passwordPlaceholder')}
        />
        <AuthSubmitButton disabled={loading || !email.trim() || !password}>
          {loading ? t('common.saving') : t('common.signUp')}
        </AuthSubmitButton>
        <div id="clerk-captcha" />
        </form>
      </div>
    </AuthCard>
  );
}
