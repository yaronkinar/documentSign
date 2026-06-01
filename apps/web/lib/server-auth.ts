import { auth, currentUser } from '@clerk/nextjs/server';

const BYPASS = process.env.BYPASS_AUTH === 'true';
const BYPASS_CLERK_ID = 'bypass-dev-user';
const BYPASS_EMAIL = process.env.BYPASS_AUTH_EMAIL ?? 'test@example.com';
const BYPASS_TOKEN = process.env.BYPASS_TOKEN ?? 'dev-bypass-token-local';

export function isAuthBypassed() {
  return BYPASS;
}

export function emailFromSessionClaims(claims: unknown): string {
  if (!claims || typeof claims !== 'object') return '';
  const record = claims as Record<string, unknown>;
  const email =
    record.email ??
    record.email_address ??
    record.primary_email_address ??
    record.primaryEmailAddress;
  return typeof email === 'string' ? email.toLowerCase() : '';
}

export async function getServerAuth() {
  if (BYPASS) {
    return {
      userId: BYPASS_CLERK_ID,
      token: BYPASS_TOKEN,
      sessionClaims: null,
    };
  }

  const clerkAuth = auth();
  return {
    userId: clerkAuth.userId,
    token: await clerkAuth.getToken(),
    sessionClaims: clerkAuth.sessionClaims,
  };
}

export async function getServerUserEmail(sessionClaims: unknown) {
  if (BYPASS) return BYPASS_EMAIL.toLowerCase();

  let email = emailFromSessionClaims(sessionClaims);
  try {
    const user = await currentUser();
    email = user?.primaryEmailAddress?.emailAddress?.toLowerCase() ?? email;
  } catch (err) {
    // User lookup is non-critical for rendering authenticated pages.
    // eslint-disable-next-line no-console
    console.error('[auth] failed to load current user', err);
  }
  return email;
}
