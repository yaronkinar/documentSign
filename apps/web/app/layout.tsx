import type { Metadata } from 'next';
import { ClerkProvider } from '@clerk/nextjs';
import { cookies, headers } from 'next/headers';

import { Navbar } from '@/components/Navbar';
import { LocaleProvider } from '@/lib/i18n/LocaleProvider';
import {
  LOCALE_BOOTSTRAP_SCRIPT,
  LOCALE_COOKIE,
  localeDirection,
  localeFromAcceptLanguage,
  parseLocale,
  type Locale,
} from '@/lib/i18n/locale';
import './globals.css';

export const metadata: Metadata = {
  title: 'DocFlow',
  description: 'Document signing and workflow platform',
};

function resolveServerLocale(): Locale {
  const cookieLocale = parseLocale(cookies().get(LOCALE_COOKIE)?.value);
  if (cookieLocale) return cookieLocale;
  return localeFromAcceptLanguage(headers().get('accept-language'));
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const locale = resolveServerLocale();
  const dir = localeDirection(locale);

  return (
    <ClerkProvider>
      <html lang={locale} dir={dir} suppressHydrationWarning>
        <head>
          <script dangerouslySetInnerHTML={{ __html: LOCALE_BOOTSTRAP_SCRIPT }} />
        </head>
        <body className="flex min-h-screen flex-col antialiased">
          <LocaleProvider initialLocale={locale}>
            <Navbar />
            <div className="flex flex-1 flex-col">{children}</div>
          </LocaleProvider>
        </body>
      </html>
    </ClerkProvider>
  );
}
