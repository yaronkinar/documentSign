'use client';

import { useAuth } from '@clerk/nextjs';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { shouldHideNavbar } from '@/lib/navbar-visibility';

const BYPASS_AUTH = process.env.NEXT_PUBLIC_BYPASS_AUTH === 'true';

/** Renders LanguageSwitcher only when the global navbar is not visible. */
export function PageLanguageSwitcher({ className = '' }: { className?: string }) {
  const pathname = usePathname();
  const { isSignedIn } = useAuth();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const navbarVisible =
    mounted && !shouldHideNavbar(pathname) && (BYPASS_AUTH || isSignedIn);

  if (navbarVisible) return null;

  return (
    <div className="absolute end-6 top-6">
      <LanguageSwitcher className={className} />
    </div>
  );
}
