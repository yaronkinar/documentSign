'use client';

import { SignedIn, useClerk, useUser } from '@clerk/nextjs';
import { LogOut, Settings as SettingsIcon, UserCog } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';

import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { NotificationBell } from '@/components/NotificationBell';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useTranslation } from '@/lib/i18n/LocaleProvider';
import { cn } from '@/lib/utils';

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
        href: '/demo',
        label: t('nav.demo'),
        match: (path: string) => path === '/demo',
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

  if (!mounted || shouldHideNavbar(pathname)) return null;

  return (
    <SignedIn>
      <header className="sticky top-0 z-50 border-b border-border bg-surface/95 backdrop-blur">
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between px-6">
          <div className="flex items-center gap-8">
            <Link
              href="/dashboard"
              className="text-lg font-semibold tracking-tight text-fg hover:opacity-80"
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
                    className={cn(
                      'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                      active
                        ? 'bg-surface-muted text-fg'
                        : 'text-fg-muted hover:bg-surface-muted hover:text-fg',
                    )}
                  >
                    {label}
                  </Link>
                );
              })}
            </nav>
          </div>
          <div className="flex items-center gap-3">
            <LanguageSwitcher />
            <NotificationBell />
            <UserMenu />
          </div>
        </div>
      </header>
    </SignedIn>
  );
}

function UserMenu() {
  const router = useRouter();
  const { t } = useTranslation();
  const { user } = useUser();
  const { signOut, openUserProfile } = useClerk();

  const email = user?.primaryEmailAddress?.emailAddress ?? '';
  const initials = email ? email.charAt(0).toUpperCase() : '?';

  async function handleSignOut() {
    await signOut();
    router.push('/');
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 rounded-full bg-surface-muted text-fg"
          aria-label={t('common.appName')}
        >
          {initials}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="flex flex-col gap-0.5">
          <span className="text-xs font-normal text-fg-muted">
            {t('common.appName')}
          </span>
          <span className="truncate text-sm font-medium text-fg">{email}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/settings">
            <SettingsIcon className="me-2 h-4 w-4" />
            {t('nav.settings')}
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => openUserProfile()}>
          <UserCog className="me-2 h-4 w-4" />
          {t('nav.manageAccount')}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={handleSignOut}>
          <LogOut className="me-2 h-4 w-4" />
          {t('common.signOut')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
