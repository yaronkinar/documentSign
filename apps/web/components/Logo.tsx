import { cn } from '@/lib/utils';

type LogoProps = {
  variant?: 'full' | 'mark';
  className?: string;
  markClassName?: string;
  /** When true, favicon-style mark sits on a navy rounded square. */
  withBackground?: boolean;
};

function LogoMark({
  className,
  withBackground = false,
}: {
  className?: string;
  withBackground?: boolean;
}) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn('h-8 w-8 shrink-0', className)}
      aria-hidden
    >
      {withBackground ? (
        <rect width="32" height="32" rx="7" className="fill-primary" />
      ) : null}
      <path
        d="M9 7h11a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2z"
        className={withBackground ? 'fill-[#FBFAF7]' : 'fill-surface stroke-border stroke-[0.75]'}
      />
      <path
        d="M18 7v4a1 1 0 0 0 1 1h4"
        className="stroke-border-strong"
        strokeWidth="0.8"
        fill="none"
      />
      <path
        d="M11 13h8M11 16h6"
        className="stroke-primary"
        strokeWidth="1"
        strokeLinecap="round"
        opacity="0.22"
      />
      <path
        d="M8 23.5C11 20 14 22 17 21.5C20 21 22.5 23 24 22"
        className="stroke-accent"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function Logo({
  variant = 'full',
  className,
  markClassName,
  withBackground = false,
}: LogoProps) {
  if (variant === 'mark') {
    return (
      <LogoMark className={markClassName ?? className} withBackground={withBackground} />
    );
  }

  return (
    <span className={cn('inline-flex items-center gap-2.5', className)}>
      <LogoMark className={markClassName} withBackground={withBackground} />
      <span className="text-lg font-semibold tracking-tight text-fg">DocFlow</span>
    </span>
  );
}
