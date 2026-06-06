'use client';

import { useAuth } from '@clerk/nextjs';
import { useCallback } from 'react';

import { useTranslation } from '@/lib/i18n/LocaleProvider';
import { persistThemeToClerk } from './persist-theme-action';
import { ThemeProvider } from './ThemeProvider';
import type { Theme } from './theme';

export function ThemeProviderWithClerk({
  children,
  initialTheme,
}: {
  children: React.ReactNode;
  initialTheme: Theme;
}) {
  const { isSignedIn } = useAuth();
  const { t } = useTranslation();

  const onPersist = useCallback(
    async (next: Theme) => {
      if (!isSignedIn) return;
      const result = await persistThemeToClerk(next);
      if (!result.ok) {
        const { toast } = await import('sonner');
        toast.error(t('settings.saveFailed'));
      }
    },
    [isSignedIn, t],
  );

  return (
    <ThemeProvider initialTheme={initialTheme} onPersist={onPersist}>
      {children}
    </ThemeProvider>
  );
}
