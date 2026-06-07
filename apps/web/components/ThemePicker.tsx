'use client';

import { Check } from 'lucide-react';

import { useTheme } from '@/lib/theme/ThemeProvider';
import { type Theme } from '@/lib/theme/theme';
import { cn } from '@/lib/utils';

interface ThemeOption {
  value: Theme;
  name: string;
  description: string;
  swatches: { bg: string; primary: string; accent: string };
}

const OPTIONS: ThemeOption[] = [
  {
    value: 'humane',
    name: 'Humane',
    description: 'Warm cream, indigo-navy, amber.',
    swatches: { bg: '#FBFAF7', primary: '#1E2548', accent: '#F59E0B' },
  },
  {
    value: 'classic',
    name: 'Classic',
    description: 'Cool blue-grey, deep navy, warm gold.',
    swatches: { bg: '#F6F8FC', primary: '#0B2545', accent: '#F5B700' },
  },
  {
    value: 'modern',
    name: 'Modern',
    description: 'Cool grey, near-black, teal.',
    swatches: { bg: '#F7F9FB', primary: '#0F1F33', accent: '#0D9488' },
  },
];

/**
 * Radio-card group for switching between the three named themes.
 *
 * A11y note: uses role="radiogroup" + role="radio" on real <button>s.
 * Tab + Enter works out of the box. Full ARIA roving-tabindex + arrow-key
 * navigation is deferred to Phase 2 when this component ships to
 * Settings → Appearance and gets production-grade keyboard polish.
 *
 * Swatch colors are inlined via `style` (not Tailwind utilities) because
 * each card must always show its own theme's palette, regardless of the
 * currently active theme.
 */
export function ThemePicker({ className }: { className?: string }) {
  const { theme, setTheme } = useTheme();

  return (
    <div
      role="radiogroup"
      aria-label="Theme"
      className={cn('grid gap-3 sm:grid-cols-3', className)}
    >
      {OPTIONS.map((option) => {
        const selected = option.value === theme;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => setTheme(option.value)}
            className={cn(
              'group relative flex flex-col items-start gap-3 rounded-lg border bg-card p-4 text-start transition-colors',
              'hover:border-border-strong focus-visible:outline-none',
              selected
                ? 'border-primary ring-2 ring-primary/40'
                : 'border-border',
            )}
          >
            <div className="flex w-full items-center justify-between">
              <span className="text-sm font-semibold text-fg">{option.name}</span>
              {selected && (
                <Check className="h-4 w-4 text-primary" aria-hidden="true" />
              )}
            </div>
            <div className="flex gap-1.5">
              <span
                className="h-6 w-6 rounded-full border border-border"
                style={{ backgroundColor: option.swatches.bg }}
              />
              <span
                className="h-6 w-6 rounded-full border border-border"
                style={{ backgroundColor: option.swatches.primary }}
              />
              <span
                className="h-6 w-6 rounded-full border border-border"
                style={{ backgroundColor: option.swatches.accent }}
              />
            </div>
            <span className="text-xs text-fg-muted">{option.description}</span>
          </button>
        );
      })}
    </div>
  );
}
