import 'server-only';
import { cookies } from 'next/headers';
import { currentUser } from '@clerk/nextjs/server';

import { isAuthBypassed } from '@/lib/server-auth';
import { DEFAULT_THEME, THEME_COOKIE, parseTheme, type Theme } from './theme';

/**
 * Resolve the theme to use for the next SSR render.
 *
 * Order of precedence:
 *   1. `docflow-theme` cookie (the device's most recent choice; written by the
 *      bootstrap script and by `persistTheme`)
 *   2. Signed-in user's Clerk `publicMetadata.theme` (cross-device seed)
 *   3. `DEFAULT_THEME`
 *
 * Never throws. If Clerk is unreachable, falls back to default.
 */
export async function resolveServerTheme(): Promise<Theme> {
  const cookieTheme = parseTheme(cookies().get(THEME_COOKIE)?.value);
  if (cookieTheme) return cookieTheme;

  if (isAuthBypassed()) return DEFAULT_THEME;

  try {
    const user = await currentUser();
    const metaTheme = parseTheme(
      (user?.publicMetadata as Record<string, unknown> | null)?.theme as
        | string
        | undefined,
    );
    if (metaTheme) return metaTheme;
  } catch (err) {
    // Clerk fetch is non-critical; degrade gracefully.
    // eslint-disable-next-line no-console
    console.error('[theme] failed to load Clerk user', err);
  }

  return DEFAULT_THEME;
}
