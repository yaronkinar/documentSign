'use client';

import { useEffect, useMemo, useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { useTranslation } from '@/lib/i18n/LocaleProvider';
import { shouldHideNavbar } from '@/lib/navbar-visibility';
import { siteVersions, type SiteVersionEntry } from '@/lib/site-versions.generated';
import { cn } from '@/lib/utils';
import { usePathname } from 'next/navigation';

function formatReleaseDate(iso: string, locale: string) {
  try {
    return new Intl.DateTimeFormat(locale === 'he' ? 'he-IL' : 'en-US', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function VersionRow({
  entry,
  locale,
  isCurrent,
}: {
  entry: SiteVersionEntry;
  locale: string;
  isCurrent?: boolean;
}) {
  const { t } = useTranslation();

  return (
    <article
      className={cn(
        'rounded-lg border border-border px-4 py-3',
        isCurrent && 'border-accent/40 bg-accent/5',
      )}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="flex items-baseline gap-2">
          <span className="font-mono text-sm font-semibold text-fg">
            v{entry.version}
          </span>
          {isCurrent ? (
            <span className="rounded-full bg-accent/15 px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide text-accent-fg">
              {t('footer.current')}
            </span>
          ) : null}
        </div>
        <time
          className="text-xs text-fg-subtle"
          dateTime={entry.date}
        >
          {formatReleaseDate(entry.date, locale)}
        </time>
      </div>
      <p className="mt-2 text-sm text-fg-muted">{entry.message}</p>
      <p className="mt-1 font-mono text-xs text-fg-subtle">{entry.hash}</p>
    </article>
  );
}

export function SiteFooter() {
  const pathname = usePathname();
  const { t, locale } = useTranslation();
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);

  const current = siteVersions.current;

  const history = useMemo(() => siteVersions.history, []);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted || shouldHideNavbar(pathname) || !current) {
    return null;
  }

  return (
    <footer className="mt-auto border-t border-border bg-surface/80">
      <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-3 px-6 py-3 text-sm text-fg-muted">
        <p>
          {t('common.appName')} ·{' '}
          {t('footer.versionLabel', { version: current.version })} ·{' '}
          <time className="text-fg-subtle" dateTime={current.date}>
            {formatReleaseDate(current.date, locale)}
          </time>
        </p>

        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button variant="ghost" size="sm" className="h-8 px-2 text-fg-muted">
              {t('footer.viewChangelog')}
            </Button>
          </DialogTrigger>
          <DialogContent className="max-h-[min(80vh,640px)] max-w-lg overflow-hidden sm:max-w-xl">
            <DialogHeader>
              <DialogTitle>{t('footer.changelogTitle')}</DialogTitle>
              <DialogDescription>{t('footer.changelogSubtitle')}</DialogDescription>
            </DialogHeader>
            <div className="max-h-[min(60vh,480px)] space-y-3 overflow-y-auto pe-1">
              {history.map((entry) => (
                <VersionRow
                  key={entry.fullHash}
                  entry={entry}
                  locale={locale}
                  isCurrent={entry.fullHash === current.fullHash}
                />
              ))}
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </footer>
  );
}
