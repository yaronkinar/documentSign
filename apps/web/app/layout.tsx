import type { Metadata } from 'next';
import { ClerkProvider } from '@clerk/nextjs';

import { Navbar } from '@/components/Navbar';
import { LocaleProvider } from '@/lib/i18n/LocaleProvider';
import './globals.css';

export const metadata: Metadata = {
  title: 'DocFlow',
  description: 'Document signing and workflow platform',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ClerkProvider>
      <html lang="en" suppressHydrationWarning>
        <body className="flex min-h-screen flex-col antialiased">
          <LocaleProvider>
            <Navbar />
            <div className="flex flex-1 flex-col">{children}</div>
          </LocaleProvider>
        </body>
      </html>
    </ClerkProvider>
  );
}
