'use client';

import { SignedIn, UserButton } from '@clerk/nextjs';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';

import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { useTranslation } from '@/lib/i18n/LocaleProvider';

function shouldHideNavbar(pathname: string) {
  return (
    pathname.startsWith('/sign-in') ||
    pathname.startsWith('/sign-up') ||
    pathname.startsWith('/sign/')
  );
}

export function Navbar() {
  const pathname = usePathname();
  const { t } = useTranslation();
  const [mounted, setMounted] = useState(false);

  const navLinks = useMemo(
    () => [
      {
        href: '/dashboard',
        label: t('nav.documents'),
        match: (path: string) =>
          path === '/dashboard' ||
          (path.startsWith('/documents/') && path !== '/documents/new'),
      },
      {
        href: '/documents/new',
        label: t('nav.newDocument'),
        match: (path: string) => path === '/documents/new',
      },
      {
        href: '/signatures',
        label: t('nav.mySignatures'),
        match: (path: string) => path === '/signatures',
      },
      {
        href: '/templates',
        label: t('nav.templates'),
        match: (path: string) => path.startsWith('/templates'),
      },
      {
        href: '/signer-profiles',
        label: t('nav.users'),
        match: (path: string) => path === '/signer-profiles' || path === '/users',
      },
    ],
    [t],
  );

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted || shouldHideNavbar(pathname)) {
    return null;
  }

  return (
    <SignedIn>
      <header className="sticky top-0 z-50 border-b bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-6">
          <div className="flex items-center gap-8">
            <Link
              href="/dashboard"
              className="text-lg font-semibold tracking-tight hover:opacity-80"
            >
              {t('common.appName')}
            </Link>
            <nav className="hidden items-center gap-1 sm:flex">
              {navLinks.map(({ href, label, match }) => {
                const active = match(pathname);
                return (
                  <Link
                    key={href}
                    href={href}
                    className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                      active
                        ? 'bg-gray-100 text-black'
                        : 'text-gray-600 hover:bg-gray-50 hover:text-black'
                    }`}
                  >
                    {label}
                  </Link>
                );
              })}
            </nav>
          </div>
          <div className="flex items-center gap-4">
            <LanguageSwitcher />
            <UserButton afterSignOutUrl="/" />
          </div>
        </div>
      </header>
    </SignedIn>
  );
}
