'use server';

import { auth, clerkClient } from '@clerk/nextjs/server';

import { isAuthBypassed } from '@/lib/server-auth';
import { parseTheme, type Theme } from './theme';

export async function persistThemeToClerk(
  theme: Theme,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (isAuthBypassed()) return { ok: true };

  if (!parseTheme(theme)) {
    return { ok: false, error: 'invalid_theme' };
  }

  const { userId } = auth();
  if (!userId) return { ok: false, error: 'not_authenticated' };

  try {
    await clerkClient().users.updateUserMetadata(userId, {
      publicMetadata: { theme },
    });
    return { ok: true };
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[theme] failed to persist to Clerk', err);
    return { ok: false, error: 'clerk_error' };
  }
}
