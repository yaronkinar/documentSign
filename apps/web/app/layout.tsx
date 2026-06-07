import type { Metadata } from 'next';
import { ClerkProvider } from '@clerk/nextjs';

import { Navbar } from '@/components/Navbar';
import { PageTransition } from '@/components/PageTransition';
import { Toaster } from '@/components/ui/sonner';
import { LocaleProvider } from '@/lib/i18n/LocaleProvider';
import {
  LOCALE_BOOTSTRAP_SCRIPT,
  localeDirection,
} from '@/lib/i18n/locale';
import { resolveServerLocale } from '@/lib/i18n/server';
import { ThemeProviderWithClerk } from '@/lib/theme/ThemeProviderWithClerk';
import { resolveServerTheme } from '@/lib/theme/server-theme';
import { THEME_BOOTSTRAP_SCRIPT, themeClass } from '@/lib/theme/theme';
import './globals.css';

export const metadata: Metadata = {
  title: 'DocFlow',
  description: 'Document signing and workflow platform',
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const locale = resolveServerLocale();
  const dir = localeDirection(locale);
  const initialTheme = await resolveServerTheme();

  return (
    <ClerkProvider>
      <html
        lang={locale}
        dir={dir}
        className={themeClass(initialTheme)}
        suppressHydrationWarning
      >
        <head>
          <script dangerouslySetInnerHTML={{ __html: LOCALE_BOOTSTRAP_SCRIPT }} />
          <script dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP_SCRIPT }} />
        </head>
        <body className="flex min-h-screen flex-col antialiased">
          <LocaleProvider initialLocale={locale}>
            <ThemeProviderWithClerk initialTheme={initialTheme}>
              <Navbar />
              <PageTransition>{children}</PageTransition>
              <Toaster />
            </ThemeProviderWithClerk>
          </LocaleProvider>
        </body>
      </html>
    </ClerkProvider>
  );
}
