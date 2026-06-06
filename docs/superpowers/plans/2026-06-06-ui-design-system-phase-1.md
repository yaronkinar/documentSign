# DocFlow UI Design System — Phase 1 (Foundation) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a themeable design system foundation — CSS-variable tokens, three named themes (Humane / Classic / Modern), 14 shadcn primitives wired to those tokens, a `ThemeProvider` with FOUC-free bootstrap, a `ThemePicker`, and a `/dev/tokens` preview route demonstrating every component in every theme in LTR + RTL — without touching any user-facing production surface.

**Architecture:** All visual decisions are encoded as CSS custom properties on theme classes (`:root` / `.theme-humane` / `.theme-classic` / `.theme-modern`) in `globals.css`. Tailwind's color/border-radius utilities are reconfigured to read those variables, so every utility class — and every shadcn component — re-skins when the theme class on `<html>` changes. The theme system mirrors the existing `LocaleProvider` pattern exactly: a tiny inline `<head>` script reads localStorage and applies the theme class before hydration (preventing flash); a client `ThemeProvider` exposes `useTheme()` via React context with `useSyncExternalStore` for cross-tab updates.

**Tech Stack:** Next.js 14 App Router, React 18, TypeScript strict, Tailwind 3.4, shadcn/ui (Radix-based, source copied into repo), Lucide icons, Sonner toasts, Playwright e2e. Existing Clerk + i18n (`LocaleProvider`) infrastructure is preserved unchanged.

**Source spec:** `docs/superpowers/specs/2026-06-06-ui-design-system-design.md`

---

## File Structure

### Created

- `apps/web/components.json` — shadcn config (style: new-york, baseColor: neutral, cssVariables: true)
- `apps/web/lib/utils.ts` — `cn()` helper (clsx + tailwind-merge); shadcn convention
- `apps/web/lib/theme/theme.ts` — theme constants, `parseTheme`, `persistTheme`, `THEME_BOOTSTRAP_SCRIPT`
- `apps/web/lib/theme/ThemeProvider.tsx` — client provider + `useTheme` hook
- `apps/web/components/ThemePicker.tsx` — radio-card group (3 swatches + names)
- `apps/web/components/ui/button.tsx` — shadcn-generated, re-skinned via tokens
- `apps/web/components/ui/input.tsx` — shadcn-generated
- `apps/web/components/ui/textarea.tsx` — shadcn-generated
- `apps/web/components/ui/label.tsx` — shadcn-generated
- `apps/web/components/ui/select.tsx` — shadcn-generated
- `apps/web/components/ui/checkbox.tsx` — shadcn-generated
- `apps/web/components/ui/badge.tsx` — shadcn-generated
- `apps/web/components/ui/card.tsx` — shadcn-generated
- `apps/web/components/ui/dialog.tsx` — shadcn-generated
- `apps/web/components/ui/dropdown-menu.tsx` — shadcn-generated
- `apps/web/components/ui/tabs.tsx` — shadcn-generated
- `apps/web/components/ui/tooltip.tsx` — shadcn-generated
- `apps/web/components/ui/skeleton.tsx` — shadcn-generated
- `apps/web/components/ui/sonner.tsx` — Toaster mount (shadcn wrapper around Sonner)
- `apps/web/app/dev/tokens/page.tsx` — preview route (every component × every variant × every theme × LTR/RTL toggle)
- `apps/web/app/dev/tokens/PreviewClient.tsx` — client component holding the theme/dir toggles and rendering all primitives
- `tests/e2e/dev-tokens.spec.ts` — Playwright smoke test: `/dev/tokens` renders without console errors in each theme and each dir

### Modified

- `apps/web/app/globals.css` — replace minimal `:root` block with full token CSS for all three themes + shadcn variable aliases
- `apps/web/tailwind.config.ts` — extend `theme.colors`, `theme.borderRadius`, register `tailwindcss-animate` plugin
- `apps/web/app/layout.tsx` — inject `THEME_BOOTSTRAP_SCRIPT` in `<head>`, wrap children in `<ThemeProvider>`, mount `<Toaster />`
- `apps/web/package.json` — add runtime deps

### Out of scope for Phase 1

- No changes to `Navbar.tsx`, `DashboardClient.tsx`, `StatusBadge.tsx`, or any existing user-facing surface.
- No Settings → Appearance page (Phase 2 wires `ThemePicker` into it).
- No theme persistence to Clerk publicMetadata (Phase 2; Phase 1 persists to localStorage only).

---

## Conventions for this plan

- All paths are relative to repo root unless otherwise stated.
- Run all `npm` and `npx` commands from the repo root, not from `apps/web` (the workspace is configured at the root).
- The codebase has **no unit-test runner** — only Playwright e2e. Phase 1 is verified by (a) a manual smoke pass on `/dev/tokens` and (b) one Playwright e2e smoke test added in Task 11. Don't introduce Vitest/Jest in this phase.
- Use existing patterns from `lib/i18n/` for the theme system. Don't invent a new persistence pattern.
- Hex colors are used directly (not HSL) — Tailwind utilities resolve to raw `var(--color-*)` references without `hsl()` wrapping.
- Commit after each task. Use `git add <specific paths>` — never `git add -A` or `git add .`.

### Deliberate deviations from the source spec

- **localStorage key:** the spec writes `docflow.theme` (with a dot). The existing locale precedent (`apps/web/lib/i18n/locale.ts`) uses `docflow-locale` (with a hyphen). This plan uses `docflow-theme` to stay consistent with the existing pattern, on the assumption the dot in the spec is a typo. If the user wants the literal spec value, change `THEME_STORAGE_KEY` in Task 5 and the corresponding string in `tests/e2e/dev-tokens.spec.ts` (Task 11) to `'docflow.theme'`.

---

## Task 1: Install runtime dependencies

**Files:**
- Modify: `apps/web/package.json` (via npm)
- Modify: `package-lock.json`

- [ ] **Step 1: Install design-system runtime deps as dependencies of the `web` workspace**

Run from repo root:

```bash
npm install -w web class-variance-authority clsx tailwind-merge lucide-react sonner
```

- [ ] **Step 2: Install `tailwindcss-animate` as a dev dependency of `web`**

```bash
npm install -w web -D tailwindcss-animate
```

- [ ] **Step 3: Install the Radix primitives that the 14 shadcn components depend on**

```bash
npm install -w web @radix-ui/react-checkbox @radix-ui/react-dialog @radix-ui/react-dropdown-menu @radix-ui/react-label @radix-ui/react-select @radix-ui/react-slot @radix-ui/react-tabs @radix-ui/react-tooltip
```

- [ ] **Step 4: Verify the installs landed in `apps/web/package.json`**

Run:

```bash
cat apps/web/package.json
```

Expected: `dependencies` now includes `class-variance-authority`, `clsx`, `tailwind-merge`, `lucide-react`, `sonner`, and the `@radix-ui/react-*` packages. `devDependencies` includes `tailwindcss-animate`.

- [ ] **Step 5: Verify the app still builds with the new deps installed (no usage yet)**

```bash
npm run build:web
```

Expected: build succeeds (no errors). Net deps added; no code uses them yet.

- [ ] **Step 6: Commit**

```bash
git add apps/web/package.json package-lock.json
git commit -m "Add shadcn/ui runtime dependencies for design system."
```

---

## Task 2: Add shadcn config and `cn` helper

**Files:**
- Create: `apps/web/components.json`
- Create: `apps/web/lib/utils.ts`

- [ ] **Step 1: Create `apps/web/components.json`**

```json
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "new-york",
  "rsc": true,
  "tsx": true,
  "tailwind": {
    "config": "tailwind.config.ts",
    "css": "app/globals.css",
    "baseColor": "neutral",
    "cssVariables": true,
    "prefix": ""
  },
  "aliases": {
    "components": "@/components",
    "utils": "@/lib/utils",
    "ui": "@/components/ui",
    "lib": "@/lib",
    "hooks": "@/lib"
  }
}
```

- [ ] **Step 2: Create `apps/web/lib/utils.ts`**

```typescript
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

- [ ] **Step 3: Verify TypeScript still type-checks**

```bash
npm run build:web
```

Expected: build succeeds. `lib/utils.ts` compiles; `components.json` is config-only.

- [ ] **Step 4: Commit**

```bash
git add apps/web/components.json apps/web/lib/utils.ts
git commit -m "Add shadcn components.json and cn() utility helper."
```

---

## Task 3: Define design tokens in `globals.css`

**Files:**
- Modify: `apps/web/app/globals.css` (full rewrite)

This task defines our `--color-*` tokens for all three themes, plus aliases for the shadcn variable names (`--background`, `--foreground`, `--primary`, etc.) so shadcn-generated components re-skin without modification.

- [ ] **Step 1: Replace `apps/web/app/globals.css` entirely with the token-driven stylesheet**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

/* ============================================================
   DocFlow design tokens
   Default theme = Humane. Apply `.theme-classic` or `.theme-modern`
   on <html> to override.
   ============================================================ */

:root,
.theme-humane {
  /* Surfaces */
  --color-bg: #FBFAF7;
  --color-surface: #FFFFFF;
  --color-surface-muted: #F5F4EE;
  --color-border: #E8E5DD;
  --color-border-strong: #D5D1C5;

  /* Text */
  --color-fg: #1E2548;
  --color-fg-muted: #4B5266;
  --color-fg-subtle: #807A6C;

  /* Brand */
  --color-primary: #1E2548;
  --color-primary-fg: #FFFFFF;
  --color-accent: #F59E0B;
  --color-accent-fg: #1E2548;

  /* Status */
  --color-success: #16A34A;
  --color-warning: #F59E0B;
  --color-danger: #DC2626;
  --color-info: #2563EB;

  /* Pill (theme-specific accent) */
  --color-pill-bg: #FEF3C7;
  --color-pill-fg: #92400E;

  /* Geometry */
  --radius: 0.5rem;

  /* ---- shadcn variable aliases (so shadcn components re-skin) ---- */
  --background: var(--color-bg);
  --foreground: var(--color-fg);

  --card: var(--color-surface);
  --card-foreground: var(--color-fg);

  --popover: var(--color-surface);
  --popover-foreground: var(--color-fg);

  --primary: var(--color-primary);
  --primary-foreground: var(--color-primary-fg);

  --secondary: var(--color-surface-muted);
  --secondary-foreground: var(--color-fg);

  --muted: var(--color-surface-muted);
  --muted-foreground: var(--color-fg-muted);

  --accent: var(--color-accent);
  --accent-foreground: var(--color-accent-fg);

  --destructive: var(--color-danger);
  --destructive-foreground: #FFFFFF;

  --border: var(--color-border);
  --input: var(--color-border-strong);
  --ring: var(--color-primary);
}

.theme-classic {
  --color-bg: #F6F8FC;
  --color-surface: #FFFFFF;
  --color-surface-muted: #EEF2F7;
  --color-border: #D9E2F0;
  --color-border-strong: #B7C5DD;
  --color-fg: #0B2545;
  --color-fg-muted: #3A4A63;
  --color-fg-subtle: #6B7A93;
  --color-primary: #0B2545;
  --color-primary-fg: #FFFFFF;
  --color-accent: #F5B700;
  --color-accent-fg: #0B2545;
  --color-success: #16A34A;
  --color-warning: #F5B700;
  --color-danger: #DC2626;
  --color-info: #2563EB;
  --color-pill-bg: #FEF3C7;
  --color-pill-fg: #8A6300;
}

.theme-modern {
  --color-bg: #F7F9FB;
  --color-surface: #FFFFFF;
  --color-surface-muted: #F1F5F9;
  --color-border: #E1E8EF;
  --color-border-strong: #C4D0DD;
  --color-fg: #0F1F33;
  --color-fg-muted: #475569;
  --color-fg-subtle: #64748B;
  --color-primary: #0F1F33;
  --color-primary-fg: #FFFFFF;
  --color-accent: #0D9488;
  --color-accent-fg: #FFFFFF;
  --color-success: #16A34A;
  --color-warning: #F59E0B;
  --color-danger: #DC2626;
  --color-info: #2563EB;
  --color-pill-bg: #CCFBF1;
  --color-pill-fg: #115E59;
}

/* ============================================================
   Base layer
   ============================================================ */

@layer base {
  html, body {
    background-color: var(--color-bg);
    color: var(--color-fg);
  }

  /* Headings: tracking-tight + semibold, never bold. */
  h1, h2, h3, h4, h5, h6 {
    letter-spacing: -0.015em;
    font-weight: 600;
  }

  /* Focus ring: 2px primary at 40% alpha, 2px offset on all interactive elements. */
  :focus-visible {
    outline: 2px solid color-mix(in srgb, var(--color-primary) 40%, transparent);
    outline-offset: 2px;
  }
}

/* RTL utility kept from previous globals.css */
[dir="rtl"] .rtl-flip {
  transform: scaleX(-1);
}
```

- [ ] **Step 2: Run build to confirm CSS still compiles**

```bash
npm run build:web
```

Expected: build succeeds. Existing surfaces will look slightly different where they referenced default white/black — `bg-white`, `bg-black`, `text-gray-*` Tailwind utilities still work (they use hardcoded values from Tailwind's default palette, not our tokens). The cream `--color-bg` will show only where pages don't set their own background.

- [ ] **Step 3: Commit**

```bash
git add apps/web/app/globals.css
git commit -m "Define design tokens for Humane, Classic, and Modern themes."
```

---

## Task 4: Wire Tailwind config to tokens

**Files:**
- Modify: `apps/web/tailwind.config.ts` (full rewrite)

- [ ] **Step 1: Replace `apps/web/tailwind.config.ts` entirely**

```typescript
import type { Config } from 'tailwindcss';
import animate from 'tailwindcss-animate';

const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        // Application tokens — used by our custom components and surfaces.
        bg: 'var(--color-bg)',
        surface: {
          DEFAULT: 'var(--color-surface)',
          muted: 'var(--color-surface-muted)',
        },
        fg: {
          DEFAULT: 'var(--color-fg)',
          muted: 'var(--color-fg-muted)',
          subtle: 'var(--color-fg-subtle)',
        },
        'border-strong': 'var(--color-border-strong)',
        success: 'var(--color-success)',
        warning: 'var(--color-warning)',
        danger: 'var(--color-danger)',
        info: 'var(--color-info)',
        pill: {
          bg: 'var(--color-pill-bg)',
          fg: 'var(--color-pill-fg)',
        },

        // shadcn-style aliases — so shadcn-generated components find their colors.
        border: 'var(--border)',
        input: 'var(--input)',
        ring: 'var(--ring)',
        background: 'var(--background)',
        foreground: 'var(--foreground)',
        primary: {
          DEFAULT: 'var(--primary)',
          foreground: 'var(--primary-foreground)',
        },
        secondary: {
          DEFAULT: 'var(--secondary)',
          foreground: 'var(--secondary-foreground)',
        },
        destructive: {
          DEFAULT: 'var(--destructive)',
          foreground: 'var(--destructive-foreground)',
        },
        muted: {
          DEFAULT: 'var(--muted)',
          foreground: 'var(--muted-foreground)',
        },
        accent: {
          DEFAULT: 'var(--accent)',
          foreground: 'var(--accent-foreground)',
        },
        popover: {
          DEFAULT: 'var(--popover)',
          foreground: 'var(--popover-foreground)',
        },
        card: {
          DEFAULT: 'var(--card)',
          foreground: 'var(--card-foreground)',
        },
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      keyframes: {
        'accordion-down': {
          from: { height: '0' },
          to: { height: 'var(--radix-accordion-content-height)' },
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to: { height: '0' },
        },
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
      },
    },
  },
  plugins: [animate],
};

export default config;
```

- [ ] **Step 2: Run build to confirm Tailwind compiles with the new utilities**

```bash
npm run build:web
```

Expected: build succeeds. `bg-primary`, `text-fg-muted`, `border-border` are now valid utility classes that compile to CSS-variable references.

- [ ] **Step 3: Verify the existing dashboard still renders by running the dev server briefly**

```bash
npm run dev:web
```

Expected: server starts cleanly. Visit `http://localhost:3000/dashboard` (after signing in if needed) and confirm the page renders. Existing classes like `bg-white`, `text-gray-500` still resolve to hardcoded Tailwind values. Kill the server (Ctrl+C) after verifying.

- [ ] **Step 4: Commit**

```bash
git add apps/web/tailwind.config.ts
git commit -m "Wire Tailwind utilities to design tokens via CSS variables."
```

---

## Task 5: Build the theme module

**Files:**
- Create: `apps/web/lib/theme/theme.ts`

This mirrors `apps/web/lib/i18n/locale.ts` exactly — same shape of constants, parser, persister, and bootstrap script.

- [ ] **Step 1: Create `apps/web/lib/theme/theme.ts`**

```typescript
export type Theme = 'humane' | 'classic' | 'modern';

export const THEMES: readonly Theme[] = ['humane', 'classic', 'modern'] as const;
export const DEFAULT_THEME: Theme = 'humane';

export const THEME_STORAGE_KEY = 'docflow-theme';
export const THEME_CLASS_PREFIX = 'theme-';

export function parseTheme(value: string | null | undefined): Theme | null {
  if (value === 'humane' || value === 'classic' || value === 'modern') return value;
  return null;
}

export function themeClass(theme: Theme): string {
  return `${THEME_CLASS_PREFIX}${theme}`;
}

export function persistTheme(theme: Theme): void {
  window.localStorage.setItem(THEME_STORAGE_KEY, theme);
}

/**
 * Inline script: apply saved theme class before React paints (localStorage
 * wins over the default). Runs synchronously in <head> to prevent flash of
 * the wrong theme on first paint. Mirrors LOCALE_BOOTSTRAP_SCRIPT.
 */
export const THEME_BOOTSTRAP_SCRIPT = `(function(){try{var k='${THEME_STORAGE_KEY}',s=localStorage.getItem(k);if(s!=='humane'&&s!=='classic'&&s!=='modern')s='${DEFAULT_THEME}';var el=document.documentElement;el.classList.remove('${THEME_CLASS_PREFIX}humane','${THEME_CLASS_PREFIX}classic','${THEME_CLASS_PREFIX}modern');el.classList.add('${THEME_CLASS_PREFIX}'+s)}catch(e){}})();`;
```

- [ ] **Step 2: Type-check by building**

```bash
npm run build:web
```

Expected: build succeeds. Nothing imports the new module yet — this just verifies it compiles.

- [ ] **Step 3: Commit**

```bash
git add apps/web/lib/theme/theme.ts
git commit -m "Add theme module: constants, parser, persister, bootstrap script."
```

---

## Task 6: Build `ThemeProvider` and `useTheme` hook

**Files:**
- Create: `apps/web/lib/theme/ThemeProvider.tsx`

This mirrors `apps/web/lib/i18n/LocaleProvider.tsx` exactly — same `useSyncExternalStore` pattern, same cross-tab event handling, same SSR-safe initial value.

- [ ] **Step 1: Create `apps/web/lib/theme/ThemeProvider.tsx`**

```typescript
'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useSyncExternalStore,
} from 'react';

import {
  DEFAULT_THEME,
  THEME_CLASS_PREFIX,
  THEME_STORAGE_KEY,
  parseTheme,
  persistTheme,
  themeClass,
  type Theme,
} from './theme';

const THEME_CHANGE_EVENT = 'docflow-theme-change';

interface ThemeContextValue {
  theme: Theme;
  setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function subscribeToTheme(onStoreChange: () => void) {
  const onStorage = (event: StorageEvent) => {
    if (event.key === THEME_STORAGE_KEY) onStoreChange();
  };
  window.addEventListener('storage', onStorage);
  window.addEventListener(THEME_CHANGE_EVENT, onStoreChange);
  return () => {
    window.removeEventListener('storage', onStorage);
    window.removeEventListener(THEME_CHANGE_EVENT, onStoreChange);
  };
}

function readClientTheme(fallback: Theme): Theme {
  return parseTheme(window.localStorage.getItem(THEME_STORAGE_KEY)) ?? fallback;
}

export function ThemeProvider({
  children,
  initialTheme = DEFAULT_THEME,
}: {
  children: React.ReactNode;
  initialTheme?: Theme;
}) {
  const theme = useSyncExternalStore(
    subscribeToTheme,
    () => readClientTheme(initialTheme),
    () => initialTheme,
  );

  const setTheme = useCallback((next: Theme) => {
    persistTheme(next);
    window.dispatchEvent(new Event(THEME_CHANGE_EVENT));
  }, []);

  useEffect(() => {
    const el = document.documentElement;
    el.classList.remove(
      `${THEME_CLASS_PREFIX}humane`,
      `${THEME_CLASS_PREFIX}classic`,
      `${THEME_CLASS_PREFIX}modern`,
    );
    el.classList.add(themeClass(theme));
  }, [theme]);

  const value = useMemo(() => ({ theme, setTheme }), [theme, setTheme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error('useTheme must be used within ThemeProvider');
  }
  return ctx;
}
```

- [ ] **Step 2: Type-check by building**

```bash
npm run build:web
```

Expected: build succeeds.

- [ ] **Step 3: Commit**

```bash
git add apps/web/lib/theme/ThemeProvider.tsx
git commit -m "Add ThemeProvider with useSyncExternalStore + cross-tab sync."
```

---

## Task 7: Wire `ThemeProvider` and bootstrap script into the root layout

**Files:**
- Modify: `apps/web/app/layout.tsx`

This task adds the theme bootstrap script and `<ThemeProvider>` only. The `<Toaster />` mount is added in Task 8 (right after shadcn installs `components/ui/sonner.tsx`) — keeps every commit green.

- [ ] **Step 1: Replace `apps/web/app/layout.tsx` entirely**

```typescript
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
import { ThemeProvider } from '@/lib/theme/ThemeProvider';
import {
  DEFAULT_THEME,
  THEME_BOOTSTRAP_SCRIPT,
  themeClass,
} from '@/lib/theme/theme';
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
      <html
        lang={locale}
        dir={dir}
        className={themeClass(DEFAULT_THEME)}
        suppressHydrationWarning
      >
        <head>
          <script dangerouslySetInnerHTML={{ __html: LOCALE_BOOTSTRAP_SCRIPT }} />
          <script dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP_SCRIPT }} />
        </head>
        <body className="flex min-h-screen flex-col antialiased">
          <ThemeProvider>
            <LocaleProvider initialLocale={locale}>
              <Navbar />
              <div className="flex flex-1 flex-col">{children}</div>
            </LocaleProvider>
          </ThemeProvider>
        </body>
      </html>
    </ClerkProvider>
  );
}
```

The `className={themeClass(DEFAULT_THEME)}` on `<html>` is the SSR default; the inline script replaces it before React paints if localStorage holds a different theme.

- [ ] **Step 2: Build to confirm the layout compiles**

```bash
npm run build:web
```

Expected: build succeeds.

- [ ] **Step 3: Commit**

```bash
git add apps/web/app/layout.tsx
git commit -m "Wire ThemeProvider and theme bootstrap script into root layout."
```

---

## Task 8: Install shadcn components, mount Toaster

**Files:**
- Create: `apps/web/components/ui/button.tsx`
- Create: `apps/web/components/ui/input.tsx`
- Create: `apps/web/components/ui/textarea.tsx`
- Create: `apps/web/components/ui/label.tsx`
- Create: `apps/web/components/ui/select.tsx`
- Create: `apps/web/components/ui/checkbox.tsx`
- Create: `apps/web/components/ui/badge.tsx`
- Create: `apps/web/components/ui/card.tsx`
- Create: `apps/web/components/ui/dialog.tsx`
- Create: `apps/web/components/ui/dropdown-menu.tsx`
- Create: `apps/web/components/ui/tabs.tsx`
- Create: `apps/web/components/ui/tooltip.tsx`
- Create: `apps/web/components/ui/skeleton.tsx`
- Create: `apps/web/components/ui/sonner.tsx`
- Modify: `apps/web/app/layout.tsx` (add `<Toaster />` mount)

- [ ] **Step 1: Install all 14 components via the shadcn CLI**

Run from `apps/web/` so the CLI finds `components.json` in the workspace folder:

```bash
cd apps/web && npx shadcn@latest add button input textarea label select checkbox badge card dialog dropdown-menu tabs tooltip skeleton sonner --yes
```

Expected: the CLI creates one `.tsx` file per component under `apps/web/components/ui/`. It should NOT modify `globals.css` or `tailwind.config.ts` because we are running `add` (not `init`) and both files exist with valid content.

- [ ] **Step 2: Verify no unintended overwrites to `globals.css` or `tailwind.config.ts`**

```bash
git diff apps/web/app/globals.css apps/web/tailwind.config.ts
```

Expected: empty diff. If either file was modified by the CLI, restore it:

```bash
git checkout apps/web/app/globals.css apps/web/tailwind.config.ts
```

- [ ] **Step 3: Verify the right files were added**

```bash
git status
```

Expected: 14 new files under `apps/web/components/ui/` (button.tsx through sonner.tsx). `apps/web/package.json` and `package-lock.json` may show modifications if shadcn pulled in additional Radix deps — that's expected and should be committed together.

- [ ] **Step 4: Wire `<Toaster />` into the root layout**

Edit `apps/web/app/layout.tsx`: add an import and render the toaster inside `<LocaleProvider>` (so it lives inside both providers).

Find this import block from Task 7:

```typescript
import { Navbar } from '@/components/Navbar';
import { LocaleProvider } from '@/lib/i18n/LocaleProvider';
```

Replace with:

```typescript
import { Navbar } from '@/components/Navbar';
import { Toaster } from '@/components/ui/sonner';
import { LocaleProvider } from '@/lib/i18n/LocaleProvider';
```

And find this block:

```typescript
            <LocaleProvider initialLocale={locale}>
              <Navbar />
              <div className="flex flex-1 flex-col">{children}</div>
            </LocaleProvider>
```

Replace with:

```typescript
            <LocaleProvider initialLocale={locale}>
              <Navbar />
              <div className="flex flex-1 flex-col">{children}</div>
              <Toaster />
            </LocaleProvider>
```

- [ ] **Step 5: Build and verify everything compiles together**

```bash
npm run build:web
```

Expected: build succeeds. Every shadcn component compiles cleanly because Tailwind utilities like `bg-primary`, `text-primary-foreground`, `border-border`, `bg-card`, `text-muted-foreground` are all defined in `tailwind.config.ts` (Task 4) to read from our CSS variables.

If the build fails on a missing utility class (e.g., shadcn-generated code references `bg-popover` or `text-card-foreground` and the class isn't recognized), add the missing color to `tailwind.config.ts` colors map and rebuild. The shadcn variable aliases in `globals.css` (Task 3) should cover all standard shadcn names.

- [ ] **Step 6: Run the dev server and confirm the existing dashboard still renders without console errors**

```bash
npm run dev:web
```

Visit `http://localhost:3000/dashboard` (sign in if needed). Open DevTools console. Expected: no errors. The dashboard looks the same as before — Phase 1 doesn't change existing surfaces. Kill the server.

- [ ] **Step 7: Commit**

```bash
git add apps/web/components/ui apps/web/app/layout.tsx apps/web/package.json package-lock.json
git commit -m "Install 14 shadcn primitives and mount Sonner Toaster in root layout."
```

---

## Task 9: Build `ThemePicker` component

**Files:**
- Create: `apps/web/components/ThemePicker.tsx`

A radio-card group of the three themes. Each card shows a 3-swatch preview (bg / primary / accent), the theme name, and a one-line description. Used by Phase 2's Settings → Appearance, and embedded in `/dev/tokens` for live preview.

- [ ] **Step 1: Create `apps/web/components/ThemePicker.tsx`**

```typescript
'use client';

import { Check } from 'lucide-react';

import { useTheme } from '@/lib/theme/ThemeProvider';
import { THEMES, type Theme } from '@/lib/theme/theme';
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
```

Notes:
- `role="radiogroup"` + `role="radio"` + `aria-checked` give correct a11y semantics without an actual `<input type="radio">`.
- Swatch colors are inlined as hex (not via tokens) because the swatches need to display each theme's colors even when a *different* theme is active.

- [ ] **Step 2: Type-check by building**

```bash
npm run build:web
```

Expected: build succeeds.

- [ ] **Step 3: Commit**

```bash
git add apps/web/components/ThemePicker.tsx
git commit -m "Add ThemePicker radio-card group for Humane, Classic, Modern."
```

---

## Task 10: Build the `/dev/tokens` preview route

**Files:**
- Create: `apps/web/app/dev/tokens/page.tsx`
- Create: `apps/web/app/dev/tokens/PreviewClient.tsx`

Server page is a thin shell. Client component holds the dir toggle and renders every primitive in every variant. Theme toggle uses the existing `ThemePicker`.

- [ ] **Step 1: Create `apps/web/app/dev/tokens/page.tsx`**

```typescript
import { PreviewClient } from './PreviewClient';

export const metadata = {
  title: 'Design Tokens — DocFlow',
};

export default function TokensPreviewPage() {
  return <PreviewClient />;
}
```

- [ ] **Step 2: Create `apps/web/app/dev/tokens/PreviewClient.tsx`**

```typescript
'use client';

import { useState } from 'react';
import { Bell, Download, MoreHorizontal, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

import { ThemePicker } from '@/components/ThemePicker';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

type Direction = 'ltr' | 'rtl';

export function PreviewClient() {
  const [dir, setDir] = useState<Direction>('ltr');

  return (
    <TooltipProvider>
      <div dir={dir} className="min-h-screen bg-bg text-fg">
        <div className="mx-auto flex max-w-6xl flex-col gap-10 px-6 py-12">
          <header className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs uppercase tracking-widest text-fg-subtle">
                DocFlow design system
              </p>
              <h1 className="mt-1 text-3xl text-fg">Tokens &amp; primitives</h1>
              <p className="mt-2 max-w-xl text-sm text-fg-muted">
                Every component, every variant, in every theme. Use the controls
                on the right to switch theme and writing direction.
              </p>
            </div>
            <div className="flex flex-col items-end gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setDir(dir === 'ltr' ? 'rtl' : 'ltr')}
              >
                Direction: {dir.toUpperCase()}
              </Button>
            </div>
          </header>

          <Section title="Theme">
            <ThemePicker />
          </Section>

          <Section title="Color tokens">
            <SwatchGrid />
          </Section>

          <Section title="Typography">
            <div className="flex flex-col gap-2">
              <h1 className="text-3xl">Heading 1 — tracking tight, semibold</h1>
              <h2 className="text-2xl">Heading 2 — tracking tight, semibold</h2>
              <h3 className="text-xl">Heading 3 — tracking tight, semibold</h3>
              <p className="text-base text-fg">Body — default foreground.</p>
              <p className="text-sm text-fg-muted">Muted — secondary text.</p>
              <p className="text-xs text-fg-subtle">Subtle — captions, meta.</p>
            </div>
          </Section>

          <Section title="Button">
            <div className="flex flex-wrap items-center gap-3">
              <Button>Primary</Button>
              <Button variant="secondary">Secondary</Button>
              <Button variant="outline">Outline</Button>
              <Button variant="ghost">Ghost</Button>
              <Button variant="destructive">Destructive</Button>
              <Button disabled>Disabled</Button>
              <Button size="sm">Small</Button>
              <Button size="lg">Large</Button>
              <Button size="icon" aria-label="Notifications">
                <Bell className="h-4 w-4" />
              </Button>
            </div>
          </Section>

          <Section title="Form inputs">
            <div className="grid gap-4 sm:max-w-md">
              <div className="grid gap-1.5">
                <Label htmlFor="t-name">Full name</Label>
                <Input id="t-name" placeholder="Jane Doe" />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="t-bio">Bio</Label>
                <Textarea id="t-bio" placeholder="Tell us about yourself" />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="t-role">Role</Label>
                <Select>
                  <SelectTrigger id="t-role">
                    <SelectValue placeholder="Select a role" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="owner">Owner</SelectItem>
                    <SelectItem value="signer">Signer</SelectItem>
                    <SelectItem value="viewer">Viewer</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox id="t-tos" />
                <Label htmlFor="t-tos">Accept terms</Label>
              </div>
            </div>
          </Section>

          <Section title="Badge">
            <div className="flex flex-wrap gap-2">
              <Badge>Default</Badge>
              <Badge variant="secondary">Secondary</Badge>
              <Badge variant="outline">Outline</Badge>
              <Badge variant="destructive">Destructive</Badge>
            </div>
          </Section>

          <Section title="Card">
            <Card className="max-w-md">
              <CardHeader>
                <CardTitle>Lease agreement</CardTitle>
                <CardDescription>
                  Awaiting signature from 2 of 3 signers.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex items-center justify-between">
                <span className="text-sm text-fg-muted">Updated today</span>
                <Badge>Pending</Badge>
              </CardContent>
            </Card>
          </Section>

          <Section title="Tabs">
            <Tabs defaultValue="all" className="max-w-md">
              <TabsList>
                <TabsTrigger value="all">All</TabsTrigger>
                <TabsTrigger value="mine">Mine</TabsTrigger>
                <TabsTrigger value="pending">Pending</TabsTrigger>
              </TabsList>
              <TabsContent value="all" className="pt-3 text-sm text-fg-muted">
                All documents.
              </TabsContent>
              <TabsContent value="mine" className="pt-3 text-sm text-fg-muted">
                Documents you own.
              </TabsContent>
              <TabsContent value="pending" className="pt-3 text-sm text-fg-muted">
                Awaiting your signature.
              </TabsContent>
            </Tabs>
          </Section>

          <Section title="Dialog">
            <Dialog>
              <DialogTrigger asChild>
                <Button variant="destructive">
                  <Trash2 className="me-2 h-4 w-4" />
                  Delete document
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Delete this document?</DialogTitle>
                  <DialogDescription>
                    This action cannot be undone. The PDF and all signatures
                    will be permanently removed.
                  </DialogDescription>
                </DialogHeader>
                <DialogFooter>
                  <Button variant="outline">Cancel</Button>
                  <Button variant="destructive">Delete</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </Section>

          <Section title="Dropdown menu">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon" aria-label="Actions">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuItem>
                  <Download className="me-2 h-4 w-4" /> Download PDF
                </DropdownMenuItem>
                <DropdownMenuItem className="text-danger focus:text-danger">
                  <Trash2 className="me-2 h-4 w-4" /> Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </Section>

          <Section title="Tooltip">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="outline" size="icon" aria-label="Notifications">
                  <Bell className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>You have 3 new notifications</TooltipContent>
            </Tooltip>
          </Section>

          <Section title="Toast">
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => toast('Document saved.')}>Default</Button>
              <Button
                variant="secondary"
                onClick={() => toast.success('Document signed.')}
              >
                Success
              </Button>
              <Button
                variant="destructive"
                onClick={() => toast.error('Delete failed.')}
              >
                Error
              </Button>
            </div>
          </Section>

          <Section title="Skeleton">
            <div className="flex flex-col gap-3 sm:max-w-md">
              <Skeleton className="h-6 w-3/4" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-5/6" />
            </div>
          </Section>
        </div>
      </div>
    </TooltipProvider>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-sm font-semibold uppercase tracking-widest text-fg-subtle">
        {title}
      </h2>
      <div className="rounded-lg border border-border bg-surface p-6">
        {children}
      </div>
    </section>
  );
}

function SwatchGrid() {
  const groups: { label: string; tokens: string[] }[] = [
    {
      label: 'Surfaces',
      tokens: [
        '--color-bg',
        '--color-surface',
        '--color-surface-muted',
        '--color-border',
        '--color-border-strong',
      ],
    },
    {
      label: 'Text',
      tokens: ['--color-fg', '--color-fg-muted', '--color-fg-subtle'],
    },
    {
      label: 'Brand',
      tokens: [
        '--color-primary',
        '--color-primary-fg',
        '--color-accent',
        '--color-accent-fg',
      ],
    },
    {
      label: 'Status',
      tokens: [
        '--color-success',
        '--color-warning',
        '--color-danger',
        '--color-info',
      ],
    },
    {
      label: 'Pill',
      tokens: ['--color-pill-bg', '--color-pill-fg'],
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      {groups.map((group) => (
        <div key={group.label}>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-fg-subtle">
            {group.label}
          </h3>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-5">
            {group.tokens.map((token) => (
              <div
                key={token}
                className="flex flex-col gap-1 rounded-md border border-border bg-surface p-2"
              >
                <div
                  className="h-10 w-full rounded border border-border"
                  style={{ backgroundColor: `var(${token})` }}
                />
                <code className="text-[10px] text-fg-muted">{token}</code>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Build to confirm everything compiles**

```bash
npm run build:web
```

Expected: build succeeds. The `dev/tokens` route shows up in the build output.

- [ ] **Step 4: Manually smoke-test the preview route**

```bash
npm run dev:web
```

Visit `http://localhost:3000/dev/tokens`. Expected:

1. Page renders without console errors.
2. The "Theme" section's `ThemePicker` switches the entire page between Humane / Classic / Modern. Surfaces, text colors, borders, accent button, swatches all update.
3. Refresh the page — selected theme persists (no flash of Humane before the chosen theme applies). This validates the bootstrap script.
4. Open a second tab on the same page. Switch themes in tab A — tab B updates immediately. This validates the cross-tab `storage` event handler.
5. Click "Direction: LTR" — switches to RTL. The page mirrors, including the dialog footer button order, dropdown menu alignment, and icon-with-text spacing (`me-2` margin-end works in both directions).
6. Open the Dialog, Dropdown, Tooltip, Select — all overlay primitives render correctly, focus is trapped where appropriate, Esc closes.
7. Click each toast button — toasts appear at the bottom-right (or bottom-left in RTL) and dismiss after a few seconds.
8. Skeletons pulse subtly via `tailwindcss-animate`.

If any of the above fails, fix in place before committing. Common gotchas:
- `bg-card` / `text-card-foreground` missing in `tailwind.config.ts` — add to colors.
- Tooltip not appearing — confirm `<TooltipProvider>` wraps the page.
- Sonner toasts not visible — confirm `<Toaster />` was added to `layout.tsx` (Task 7).

Kill the dev server when done.

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/dev/tokens
git commit -m "Add /dev/tokens preview route showing all primitives in all themes."
```

---

## Task 11: Add a Playwright smoke test for `/dev/tokens`

**Files:**
- Create: `tests/e2e/dev-tokens.spec.ts`

This is the lightweight automated check that Phase 1 didn't regress. It loads `/dev/tokens` in each of the three themes and verifies the page renders without runtime console errors and the body background color matches the expected theme value.

- [ ] **Step 1: Look at an existing Playwright spec to follow the project's conventions**

```bash
cat tests/e2e/new-document.spec.ts
```

Note the setup: imports from `@playwright/test`, any helpers in `tests/e2e/helpers/`, baseURL handling. The dev/tokens route doesn't require auth (it's a dev-only page with no Clerk guards), so this spec doesn't need sign-in helpers.

- [ ] **Step 2: Create `tests/e2e/dev-tokens.spec.ts`**

```typescript
import { test, expect, type Page } from '@playwright/test';

const THEMES = [
  { theme: 'humane', expectedBg: 'rgb(251, 250, 247)' },
  { theme: 'classic', expectedBg: 'rgb(246, 248, 252)' },
  { theme: 'modern', expectedBg: 'rgb(247, 249, 251)' },
] as const;

async function gotoTokens(page: Page, theme: string) {
  await page.addInitScript((t) => {
    window.localStorage.setItem('docflow-theme', t);
  }, theme);
  await page.goto('/dev/tokens');
  await expect(page.getByRole('heading', { name: /tokens & primitives/i })).toBeVisible();
}

test.describe('/dev/tokens preview route', () => {
  for (const { theme, expectedBg } of THEMES) {
    test(`renders in ${theme} theme without console errors`, async ({ page }) => {
      const errors: string[] = [];
      page.on('pageerror', (err) => errors.push(err.message));
      page.on('console', (msg) => {
        if (msg.type() === 'error') errors.push(msg.text());
      });

      await gotoTokens(page, theme);

      const htmlClass = await page.evaluate(() =>
        document.documentElement.className,
      );
      expect(htmlClass).toContain(`theme-${theme}`);

      const bg = await page.evaluate(() =>
        getComputedStyle(document.body).backgroundColor,
      );
      expect(bg).toBe(expectedBg);

      expect(errors, `Console errors: ${errors.join('\n')}`).toEqual([]);
    });
  }

  test('RTL toggle flips direction without reloading', async ({ page }) => {
    await gotoTokens(page, 'humane');

    const initialDir = await page.evaluate(() =>
      document.querySelector('[dir]')?.getAttribute('dir'),
    );
    expect(initialDir).toBe('ltr');

    await page.getByRole('button', { name: /direction: ltr/i }).click();

    await expect(
      page.getByRole('button', { name: /direction: rtl/i }),
    ).toBeVisible();
  });

  test('selecting a theme in ThemePicker updates the html class', async ({
    page,
  }) => {
    await gotoTokens(page, 'humane');

    await page.getByRole('radio', { name: /modern/i }).click();

    await expect
      .poll(async () =>
        page.evaluate(() => document.documentElement.classList.contains('theme-modern')),
      )
      .toBe(true);
  });
});
```

- [ ] **Step 3: Run the new spec against a running dev server**

In one shell:

```bash
npm run dev:web
```

In another shell, from repo root:

```bash
npx playwright test tests/e2e/dev-tokens.spec.ts
```

Expected: all 5 tests pass (3 theme-render tests + RTL toggle + ThemePicker click).

If a theme test fails on the background color, double-check that the hex in `globals.css` matches the expected RGB in the test (e.g., `#FBFAF7` is `rgb(251, 250, 247)`).

If the RTL toggle test fails because the button text doesn't match, look at how the button label is generated in `PreviewClient.tsx` and adjust the locator.

Kill the dev server when done.

- [ ] **Step 4: Run the existing e2e suite to confirm we haven't regressed anything**

```bash
npm run test:e2e
```

Expected: all tests pass (the existing suite plus our new spec).

If any pre-existing test fails for a reason unrelated to Phase 1 (e.g., flaky test on first run), note it but don't try to fix it in this plan — it's out of scope.

- [ ] **Step 5: Commit**

```bash
git add tests/e2e/dev-tokens.spec.ts
git commit -m "Add Playwright smoke test for /dev/tokens preview route."
```

---

## Task 12: Final verification pass

No code changes — this is the human checklist that proves Phase 1 is done.

- [ ] **Step 1: Run a full production build**

```bash
npm run build:web
```

Expected: build succeeds. Note the bundle size delta in the output; expected net add is ~30–50KB gzipped (per the spec).

- [ ] **Step 2: Run the lint check**

```bash
npm run lint -w web
```

Expected: no lint errors in the new files. If shadcn-generated files trip ESLint rules (e.g., `react/display-name` for `React.forwardRef` without explicit displayName), accept the shadcn defaults — they are the upstream-recommended pattern and we don't customize them.

- [ ] **Step 3: Run the Playwright suite end-to-end**

```bash
npm run test:e2e
```

Expected: all tests pass, including the new `dev-tokens.spec.ts`.

- [ ] **Step 4: Manual checklist on `/dev/tokens`**

```bash
npm run dev:web
```

Walk through this list. If any item fails, fix in place before moving on. Do not commit "partial Phase 1".

- [ ] Page loads with no console errors.
- [ ] All three themes switch cleanly via the ThemePicker; background, surfaces, text, accent, swatches all update.
- [ ] Refresh on a non-default theme: no flash of Humane before the chosen theme applies. (This is the bootstrap-script test.)
- [ ] Two tabs open, switching theme in one updates the other immediately.
- [ ] LTR ↔ RTL toggle mirrors the layout. Icons-with-text spacing reads correctly in both directions.
- [ ] Every primitive renders and behaves: Button (all variants + disabled + sizes), Input + Label, Textarea, Select (open / select / close), Checkbox (toggle), Badge, Card, Tabs (switch), Dialog (open / Esc closes / focus trap), Dropdown (open / item hover), Tooltip (hover delay), Toaster (each variant), Skeleton (pulse animation).
- [ ] Focus ring shows on every interactive element when Tab-cycling.
- [ ] Existing surfaces (`/dashboard`, `/documents/new`, etc.) look the same as before Phase 1. No accidental visual change to production screens.

- [ ] **Step 5: Final commit (if any uncommitted fixes from manual pass)**

If Step 4 surfaced any fixes, commit them with a focused message describing the fix.

If no fixes were needed, skip this step.

- [ ] **Step 6: Optional — push the branch and open a PR**

This step is OPTIONAL and requires explicit user confirmation per the project's git policy. Do NOT push without asking.

If the user wants to ship Phase 1 as a PR:

```bash
git push -u origin feature/ui-design-system
gh pr create --title "UI design system: Phase 1 (foundation)" --body "..."
```

Otherwise leave the branch local. Phase 2 builds on top of these commits.

---

## Out of scope for this plan (named so they don't sneak in)

- Refactoring `Navbar`, `DashboardClient`, `StatusBadge` to use the new components — that's **Phase 2**, its own plan.
- Adding `ThemePicker` to a Settings → Appearance page — that's Phase 2.
- Persisting theme choice to Clerk publicMetadata — that's Phase 2.
- Theme-persistence e2e test that covers Clerk sync — Phase 2.
- Dark mode — out of v1 entirely per the spec.
- White-label per-tenant theming — separate initiative.
- Replacing Clerk's hosted UI styling — Phase 3 wrapper-page work; Clerk widgets stay as-is.
- Migrating any existing utility classes (`bg-black`, `text-gray-500`, etc.) in untouched surfaces — those keep working; they get migrated when their surface is refactored in Phase 2 or 3.
- Storybook — `/dev/tokens` covers the need.
- Visual regression testing — if added later, screenshot diffs against `/dev/tokens`.

---

## Verification summary

When Phase 1 is complete:

- ✅ 14 shadcn primitives + `Toaster` + `ThemePicker` live under `apps/web/components/ui/` and `apps/web/components/ThemePicker.tsx`.
- ✅ Three themes (`humane`, `classic`, `modern`) defined as CSS-variable blocks in `globals.css`.
- ✅ Tailwind utilities (`bg-primary`, `text-fg-muted`, etc.) resolve to `var(--color-*)`.
- ✅ `ThemeProvider` + `useTheme` + bootstrap script ship and are wired into the root layout.
- ✅ `/dev/tokens` renders every component in every variant in every theme in LTR + RTL.
- ✅ Hebrew/RTL works correctly on the preview route.
- ✅ Existing user-facing surfaces are visually unchanged.
- ✅ Playwright e2e suite (including new `dev-tokens.spec.ts`) passes.
- ✅ Production build succeeds with bundle size delta within expectations.

Phase 2 (Dashboard reference surface) is unblocked — it consumes everything Phase 1 ships.
