# DocFlow UI Design System — Phase 2 (Dashboard Reference Surface) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor the dashboard (Navbar + DashboardClient + StatusBadge) to use the Phase 1 design system, add a Settings → Appearance page with the ThemePicker, persist theme to Clerk `publicMetadata` so it follows the user across devices, and verify with one new Playwright e2e test for theme persistence — producing the first fully re-skinned, production-quality surface that becomes the template for Phase 3.

**Architecture:** Phase 1 built the foundation (tokens, theme system, shadcn primitives) but didn't touch any user-facing surface. Phase 2 fills that gap on exactly one surface — the dashboard — and ships the user-facing theme control. Clerk persistence layers cleanly on top of the existing localStorage pattern: localStorage stays the source of truth on each device, Clerk `publicMetadata` is the cross-device seed read at SSR time and written when the user changes themes while signed in.

**Tech Stack:** Same as Phase 1 — Next.js 14 App Router, React 18, TypeScript strict, Tailwind 3.4, shadcn/ui, Clerk for auth, Playwright e2e. Phase 2 adds a Next.js Server Action for the Clerk write path; no new dependencies.

**Source spec:** `docs/superpowers/specs/2026-06-06-ui-design-system-design.md`
**Built on:** `docs/superpowers/plans/2026-06-06-ui-design-system-phase-1.md` (already executed; commits `8a57531`..`b0e859e` on `feature/ui-design-system`).

---

## File Structure

### Created

- `apps/web/lib/theme/persist-theme-action.ts` — Server Action: `persistThemeToClerk(theme)` updates the signed-in user's `publicMetadata.theme` via `clerkClient`.
- `apps/web/lib/theme/server-theme.ts` — Server-only helper: `resolveServerTheme()` returns the user's persisted theme (cookie → Clerk publicMetadata → DEFAULT_THEME).
- `apps/web/app/settings/page.tsx` — server shell for Settings; reads server theme + renders client section.
- `apps/web/app/settings/AppearanceSection.tsx` — client component: heading + `<ThemePicker />` + helper copy.

### Modified

- `apps/web/lib/theme/theme.ts` — add `THEME_COOKIE` constant + `persistTheme()` to also set the cookie (so server can read it on next request); extend `THEME_BOOTSTRAP_SCRIPT` to write the cookie too (keeps the bootstrap as the single source of truth for the device theme).
- `apps/web/lib/theme/ThemeProvider.tsx` — accept optional `onPersist?: (theme: Theme) => void` prop; call it inside `setTheme` after `persistTheme`.
- `apps/web/app/layout.tsx` — use `resolveServerTheme()` to compute the initial theme + html class; wrap ThemeProvider with `ThemeProviderWithClerk` (new tiny client wrapper that wires `onPersist` to the server action when signed in).
- `apps/web/lib/theme/ThemeProviderWithClerk.tsx` (new) — thin client wrapper around `ThemeProvider` that bridges Clerk `useAuth` to the server-action persist callback.
- `apps/web/lib/i18n/locales/en.ts` — add `settings.title`, `settings.appearance.*`, `nav.settings` strings.
- `apps/web/lib/i18n/locales/he.ts` — Hebrew equivalents.
- `apps/web/components/Navbar.tsx` — refactor to use `ui/Button` for nav links and a custom `ui/DropdownMenu` for the user menu (replacing `<UserButton>` with a custom dropdown that uses Clerk's `useClerk().signOut()`); add a Settings link.
- `apps/web/components/StatusBadge.tsx` — re-implement as a thin wrapper over `ui/Badge` with status → variant mapping.
- `apps/web/app/dashboard/DashboardClient.tsx` — replace `FilterTab` with `ui/Tabs`, replace selection checkboxes with `ui/Checkbox`, replace action buttons with `ui/Button`, replace inline error banner with Sonner `toast.error`, replace both `window.confirm` calls with `ui/Dialog`, wrap each document row in a token-styled card.

### Created (tests)

- `tests/e2e/theme-persistence.spec.ts` — verifies: theme persists across reload (localStorage path), theme persists across sign-in (Clerk path), changing theme while signed in writes to Clerk.

### Unchanged

- All other surfaces (auth pages, document viewer, templates, sign page, signer-profiles, users). Those are Phase 3 PRs.
- shadcn primitives in `components/ui/*` — these stay as upstream shadcn output.

---

## Conventions for this plan

- Paths are relative to repo root.
- Run all `npm`/`npx` from repo root unless specified.
- Use Git Bash on Windows (Unix syntax, forward slashes, `/dev/null`).
- Commit after each task with the exact message specified.
- Use `git add <specific paths>` — never `git add -A`. The working tree may contain pre-existing user-state changes in `apps/web/app/(auth)/...` and `.claude/settings.local.json`; **do not include them**.
- Phase 1's i18n approach: dictionaries live in `apps/web/lib/i18n/locales/{en,he}.ts`. Add keys symmetrically to both files in the same commit.
- The current branch is `feature/ui-design-system`. Stay on it. HEAD at start of Phase 2 should be `b0e859e` ("Target wrapper via data-testid in RTL test").

### Clerk persistence design (read this before Task 1)

**The flow:**

1. **On every signed-in request:** `resolveServerTheme()` reads (in order) the `docflow-theme` cookie → the user's Clerk `publicMetadata.theme` → falls back to `DEFAULT_THEME`. The result is used to (a) set the `className` on `<html>` for SSR and (b) pass as `initialTheme` to `ThemeProvider`.
2. **The bootstrap script in `<head>`** still runs first on the client, reading localStorage. localStorage wins over the SSR-rendered class because the inline script runs synchronously before hydration and applies the localStorage value if present. The SSR class is the fallback when localStorage is empty.
3. **When `setTheme` is called on the client:** it writes localStorage + cookie + dispatches the change event (existing Phase 1 behavior); if the user is signed in, it ALSO calls the server action to update Clerk `publicMetadata`.
4. **First visit on a new device for a signed-in user:** localStorage is empty → bootstrap leaves SSR class in place → SSR class came from Clerk `publicMetadata` → user sees their preferred theme without an explicit choice. This is the cross-device sync benefit.

**Why a cookie too?** Without a cookie, the server has no way to read the device theme on the first request for an anonymous user. With a cookie, the SSR class for anonymous users matches what the bootstrap script will apply, eliminating the brief flash of `humane` → user's theme on signed-out pages. The locale system uses the same pattern (cookie + localStorage + bootstrap), so we mirror it exactly.

---

## Task 1: Add i18n strings for Settings + nav

**Files:**
- Modify: `apps/web/lib/i18n/locales/en.ts`
- Modify: `apps/web/lib/i18n/locales/he.ts`

- [ ] **Step 1: Add a `nav.settings` key and a new `settings` block to `apps/web/lib/i18n/locales/en.ts`**

Inside the `nav: { ... }` object, add `settings: 'Settings',` at the end of the existing keys.

Then ABOVE the existing `dashboard:` block, add a new top-level `settings` block:

```typescript
  settings: {
    title: 'Settings',
    appearance: {
      title: 'Appearance',
      description:
        'Choose how DocFlow looks for you. Your choice is saved on this device, and follows you to other devices when you’re signed in.',
      themeLabel: 'Theme',
    },
    saveFailed: 'Could not save your settings. Try again in a moment.',
  },
```

- [ ] **Step 2: Mirror the same keys in Hebrew in `apps/web/lib/i18n/locales/he.ts`**

Add `settings: 'הגדרות',` inside `nav: { ... }`.

Add the `settings` block above the `dashboard:` block in `he.ts`:

```typescript
  settings: {
    title: 'הגדרות',
    appearance: {
      title: 'מראה',
      description:
        'בחר איך DocFlow ייראה אצלך. הבחירה נשמרת במכשיר הזה, ומתעדכנת גם במכשירים אחרים כשאתה מחובר.',
      themeLabel: 'ערכת נושא',
    },
    saveFailed: 'לא הצלחנו לשמור את ההגדרות. נסה שוב בעוד רגע.',
  },
```

- [ ] **Step 3: Build to confirm TypeScript still compiles (the i18n types are inferred from `en`)**

```bash
npm run build:web
```

Expected: build succeeds. No code reads these keys yet.

- [ ] **Step 4: Commit**

```bash
git add apps/web/lib/i18n/locales/en.ts apps/web/lib/i18n/locales/he.ts
git commit -m "Add i18n strings for Settings page and Appearance section."
```

---

## Task 2: Extend theme module with cookie support

**Files:**
- Modify: `apps/web/lib/theme/theme.ts`

This task extends the existing Phase 1 theme module so the bootstrap script also writes a cookie, and so server code can read the device's theme on the next request.

- [ ] **Step 1: Replace `apps/web/lib/theme/theme.ts` entirely**

```typescript
export type Theme = 'humane' | 'classic' | 'modern';

export const THEMES: readonly Theme[] = ['humane', 'classic', 'modern'] as const;
export const DEFAULT_THEME: Theme = 'humane';

export const THEME_STORAGE_KEY = 'docflow-theme';
export const THEME_COOKIE = 'docflow-theme';
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
  document.cookie = `${THEME_COOKIE}=${theme};path=/;max-age=31536000;samesite=lax`;
}

/**
 * Inline script: apply saved theme class before React paints (localStorage
 * wins over the SSR default). Runs synchronously in <head> to prevent flash
 * of the wrong theme on first paint. Also writes the cookie so the server
 * can read the device theme on the next request. Mirrors LOCALE_BOOTSTRAP_SCRIPT.
 */
export const THEME_BOOTSTRAP_SCRIPT = `(function(){try{var k='${THEME_STORAGE_KEY}',c='${THEME_COOKIE}',s=localStorage.getItem(k);if(s!=='humane'&&s!=='classic'&&s!=='modern')return;var el=document.documentElement;el.classList.remove('${THEME_CLASS_PREFIX}humane','${THEME_CLASS_PREFIX}classic','${THEME_CLASS_PREFIX}modern');el.classList.add('${THEME_CLASS_PREFIX}'+s);document.cookie=c+'='+s+';path=/;max-age=31536000;samesite=lax'}catch(e){}})();`;
```

Note the behavior changes from Phase 1:

- `persistTheme` now also writes the cookie.
- The bootstrap script **returns early** if localStorage has no valid theme — leaving the SSR-rendered class intact (the SSR class is now correct because the server reads the cookie). Phase 1's bootstrap unconditionally applied DEFAULT_THEME; that's no longer needed because the server now renders the right class up front.
- Bootstrap also writes the cookie so it stays in sync across tabs that change theme without a reload.

- [ ] **Step 2: Build**

```bash
npm run build:web
```

Expected: build succeeds. The existing Playwright spec still uses `localStorage.setItem('docflow-theme', ...)` via `addInitScript` — that still works because the bootstrap reads localStorage first.

- [ ] **Step 3: Re-run the Phase 1 spec to confirm no regression**

```bash
npx playwright test tests/e2e/dev-tokens.spec.ts --reporter=line
```

Expected: 5/5 pass. If any test fails, fix in place — it likely indicates the early-return logic broke something.

- [ ] **Step 4: Commit**

```bash
git add apps/web/lib/theme/theme.ts
git commit -m "Mirror locale pattern: theme cookie + early-return bootstrap."
```

---

## Task 3: Server-side theme resolver

**Files:**
- Create: `apps/web/lib/theme/server-theme.ts`

Server-only helper that reads (cookie → Clerk publicMetadata → default) and returns the user's effective initial theme.

- [ ] **Step 1: Create `apps/web/lib/theme/server-theme.ts`**

```typescript
import 'server-only';
import { cookies } from 'next/headers';
import { currentUser } from '@clerk/nextjs/server';

import { isAuthBypassed } from '@/lib/server-auth';
import { DEFAULT_THEME, THEME_COOKIE, parseTheme, type Theme } from './theme';

/**
 * Resolve the theme to use for the next SSR render.
 *
 * Order of precedence:
 *   1. `docflow-theme` cookie (the device's most recent choice; written by the
 *      bootstrap script and by `persistTheme`)
 *   2. Signed-in user's Clerk `publicMetadata.theme` (cross-device seed)
 *   3. `DEFAULT_THEME`
 *
 * Never throws. If Clerk is unreachable, falls back to default.
 */
export async function resolveServerTheme(): Promise<Theme> {
  const cookieTheme = parseTheme(cookies().get(THEME_COOKIE)?.value);
  if (cookieTheme) return cookieTheme;

  if (isAuthBypassed()) return DEFAULT_THEME;

  try {
    const user = await currentUser();
    const metaTheme = parseTheme(
      (user?.publicMetadata as Record<string, unknown> | null)?.theme as
        | string
        | undefined,
    );
    if (metaTheme) return metaTheme;
  } catch (err) {
    // Clerk fetch is non-critical; degrade gracefully.
    // eslint-disable-next-line no-console
    console.error('[theme] failed to load Clerk user', err);
  }

  return DEFAULT_THEME;
}
```

- [ ] **Step 2: Build**

```bash
npm run build:web
```

Expected: build succeeds. The `'server-only'` import is a Next.js convention that errors if a client component imports this file.

- [ ] **Step 3: Commit**

```bash
git add apps/web/lib/theme/server-theme.ts
git commit -m "Add server-side theme resolver (cookie → Clerk → default)."
```

---

## Task 4: Server Action to persist theme to Clerk

**Files:**
- Create: `apps/web/lib/theme/persist-theme-action.ts`

A Next.js Server Action invoked from the client. Writes the chosen theme to the signed-in user's `publicMetadata.theme` via Clerk's server SDK.

- [ ] **Step 1: Create `apps/web/lib/theme/persist-theme-action.ts`**

```typescript
'use server';

import { auth, clerkClient } from '@clerk/nextjs/server';

import { isAuthBypassed } from '@/lib/server-auth';
import { parseTheme, type Theme } from './theme';

export async function persistThemeToClerk(
  theme: Theme,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (isAuthBypassed()) return { ok: true };

  if (!parseTheme(theme)) {
    return { ok: false, error: 'invalid_theme' };
  }

  const { userId } = auth();
  if (!userId) return { ok: false, error: 'not_authenticated' };

  try {
    await clerkClient().users.updateUserMetadata(userId, {
      publicMetadata: { theme },
    });
    return { ok: true };
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[theme] failed to persist to Clerk', err);
    return { ok: false, error: 'clerk_error' };
  }
}
```

- [ ] **Step 2: Build**

```bash
npm run build:web
```

Expected: build succeeds.

- [ ] **Step 3: Commit**

```bash
git add apps/web/lib/theme/persist-theme-action.ts
git commit -m "Add Server Action to persist theme to Clerk publicMetadata."
```

---

## Task 5: Plumb `onPersist` callback through `ThemeProvider`

**Files:**
- Modify: `apps/web/lib/theme/ThemeProvider.tsx`
- Create: `apps/web/lib/theme/ThemeProviderWithClerk.tsx`
- Modify: `apps/web/app/layout.tsx`

`ThemeProvider` stays generic (no Clerk knowledge). A thin `ThemeProviderWithClerk` wrapper handles Clerk wiring.

- [ ] **Step 1: Replace `apps/web/lib/theme/ThemeProvider.tsx` entirely**

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
  onPersist,
}: {
  children: React.ReactNode;
  initialTheme?: Theme;
  onPersist?: (theme: Theme) => void;
}) {
  const theme = useSyncExternalStore(
    subscribeToTheme,
    () => readClientTheme(initialTheme),
    () => initialTheme,
  );

  const setTheme = useCallback(
    (next: Theme) => {
      persistTheme(next);
      window.dispatchEvent(new Event(THEME_CHANGE_EVENT));
      onPersist?.(next);
    },
    [onPersist],
  );

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

The only changes from Phase 1: `onPersist?` prop, called inside `setTheme` after the local-storage write.

- [ ] **Step 2: Create `apps/web/lib/theme/ThemeProviderWithClerk.tsx`**

```typescript
'use client';

import { useAuth } from '@clerk/nextjs';
import { useCallback } from 'react';

import { useTranslation } from '@/lib/i18n/LocaleProvider';
import { persistThemeToClerk } from './persist-theme-action';
import { ThemeProvider } from './ThemeProvider';
import type { Theme } from './theme';

export function ThemeProviderWithClerk({
  children,
  initialTheme,
}: {
  children: React.ReactNode;
  initialTheme: Theme;
}) {
  const { isSignedIn } = useAuth();
  const { t } = useTranslation();

  const onPersist = useCallback(
    async (next: Theme) => {
      if (!isSignedIn) return;
      const result = await persistThemeToClerk(next);
      if (!result.ok) {
        // Toast on failure so the user knows the cross-device sync didn't take.
        // Imported lazily to avoid pulling sonner into the SSR shell when not needed.
        const { toast } = await import('sonner');
        toast.error(t('settings.saveFailed'));
      }
    },
    [isSignedIn, t],
  );

  return (
    <ThemeProvider initialTheme={initialTheme} onPersist={onPersist}>
      {children}
    </ThemeProvider>
  );
}
```

- [ ] **Step 3: Update `apps/web/app/layout.tsx`** to call `resolveServerTheme()` and use `ThemeProviderWithClerk`

Find these existing lines (from Phase 1):

```typescript
import { ThemeProvider } from '@/lib/theme/ThemeProvider';
import {
  DEFAULT_THEME,
  THEME_BOOTSTRAP_SCRIPT,
  themeClass,
} from '@/lib/theme/theme';
```

Replace with:

```typescript
import { ThemeProviderWithClerk } from '@/lib/theme/ThemeProviderWithClerk';
import { resolveServerTheme } from '@/lib/theme/server-theme';
import { THEME_BOOTSTRAP_SCRIPT, themeClass } from '@/lib/theme/theme';
```

Then find:

```typescript
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const locale = resolveServerLocale();
  const dir = localeDirection(locale);
```

Replace with:

```typescript
export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const locale = resolveServerLocale();
  const dir = localeDirection(locale);
  const initialTheme = await resolveServerTheme();
```

Then find:

```typescript
        className={themeClass(DEFAULT_THEME)}
```

Replace with:

```typescript
        className={themeClass(initialTheme)}
```

Then find:

```typescript
        <body className="flex min-h-screen flex-col antialiased">
          <ThemeProvider>
            <LocaleProvider initialLocale={locale}>
```

Replace with:

```typescript
        <body className="flex min-h-screen flex-col antialiased">
          <ThemeProviderWithClerk initialTheme={initialTheme}>
            <LocaleProvider initialLocale={locale}>
```

And find the closing tags:

```typescript
            </LocaleProvider>
          </ThemeProvider>
```

Replace with:

```typescript
            </LocaleProvider>
          </ThemeProviderWithClerk>
```

- [ ] **Step 4: Build**

```bash
npm run build:web
```

Expected: build succeeds. The layout is now an async server component reading Clerk; that's the standard App Router pattern.

- [ ] **Step 5: Re-run the Phase 1 spec**

```bash
npx playwright test tests/e2e/dev-tokens.spec.ts --reporter=line
```

Expected: 5/5 pass. The preview route is dev-only; no user is signed in there; `resolveServerTheme()` returns DEFAULT_THEME; the existing tests still work.

- [ ] **Step 6: Commit**

```bash
git add apps/web/lib/theme/ThemeProvider.tsx apps/web/lib/theme/ThemeProviderWithClerk.tsx apps/web/app/layout.tsx
git commit -m "Wire Clerk persistence: server theme resolver + onPersist callback."
```

---

## Task 6: Build the Settings page with Appearance section

**Files:**
- Create: `apps/web/app/settings/page.tsx`
- Create: `apps/web/app/settings/AppearanceSection.tsx`

- [ ] **Step 1: Create `apps/web/app/settings/page.tsx`**

```typescript
import { redirect } from 'next/navigation';

import { getServerAuth } from '@/lib/server-auth';
import { AppearanceSection } from './AppearanceSection';

export const metadata = {
  title: 'Settings — DocFlow',
};

export default async function SettingsPage() {
  const { userId } = await getServerAuth();
  if (!userId) redirect('/sign-in');

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-10">
      <AppearanceSection />
    </main>
  );
}
```

- [ ] **Step 2: Create `apps/web/app/settings/AppearanceSection.tsx`**

```typescript
'use client';

import { ThemePicker } from '@/components/ThemePicker';
import { useTranslation } from '@/lib/i18n/LocaleProvider';

export function AppearanceSection() {
  const { t } = useTranslation();

  return (
    <section className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl">{t('settings.title')}</h1>
      </header>

      <div className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-6">
        <div className="flex flex-col gap-1">
          <h2 className="text-base">{t('settings.appearance.title')}</h2>
          <p className="text-sm text-fg-muted">
            {t('settings.appearance.description')}
          </p>
        </div>
        <ThemePicker />
      </div>
    </section>
  );
}
```

- [ ] **Step 3: Build**

```bash
npm run build:web
```

Expected: build succeeds, `/settings` appears in the route table.

- [ ] **Step 4: Smoke-test manually**

In one shell, `npm run dev:web`. Visit `http://localhost:3000/settings` (sign in if needed). Expected: page renders with title "Settings", an "Appearance" card containing the `ThemePicker`. Clicking a theme card switches the whole app's theme. Refresh — selected theme persists.

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/settings
git commit -m "Add /settings page with Appearance section and ThemePicker."
```

---

## Task 7: Refactor `StatusBadge` over `ui/Badge`

**Files:**
- Modify: `apps/web/components/StatusBadge.tsx`

`StatusBadge` becomes a thin wrapper over `ui/Badge`, mapping each `DocumentStatus` to a Badge variant + an inline color override for the rarer statuses (the shadcn Badge has 4 variants; document status has 6).

- [ ] **Step 1: Replace `apps/web/components/StatusBadge.tsx` entirely**

```typescript
'use client';

import type { DocumentStatus } from '@docflow/shared';

import { Badge, type BadgeProps } from '@/components/ui/badge';
import { useTranslation } from '@/lib/i18n/LocaleProvider';
import { cn } from '@/lib/utils';

const STATUS_VARIANT: Record<DocumentStatus, BadgeProps['variant']> = {
  draft: 'secondary',
  pending_review: 'secondary',
  pending_signature: 'default',
  approved: 'default',
  rejected: 'destructive',
  completed: 'default',
};

const STATUS_OVERRIDE: Record<DocumentStatus, string> = {
  draft: 'bg-surface-muted text-fg-muted border-border',
  pending_review: 'bg-pill-bg text-pill-fg border-transparent',
  pending_signature: 'bg-surface-muted text-info border-info',
  approved: 'bg-surface-muted text-success border-success',
  rejected: '', // uses default destructive variant
  completed: 'bg-surface-muted text-success border-success',
};

export function StatusBadge({ status }: { status: DocumentStatus }) {
  const { t } = useTranslation();
  return (
    <Badge
      variant={STATUS_VARIANT[status]}
      className={cn(STATUS_OVERRIDE[status])}
    >
      {t(`status.${status}`)}
    </Badge>
  );
}
```

The previous pill behavior (rounded shape, color-coded statuses) is preserved by overriding `bg-*`/`text-*` per status. We avoid Tailwind's slash-alpha syntax (`bg-info/15`) because our colors are `var(--color-*)` references that Tailwind can't decompose into rgb with `<alpha-value>` without extra config. The `STATUS_OVERRIDE` map above uses solid `bg-surface-muted` plus a colored text + border for the non-destructive statuses — clean, no token-system gymnastics, RTL-safe.

- [ ] **Step 2: Build**

```bash
npm run build:web
```

Expected: build succeeds. `Badge` already exports `BadgeProps` because shadcn templates do.

- [ ] **Step 3: Run the existing e2e suite**

```bash
npm run test:e2e
```

Expected: all tests pass. The Dashboard test depends on document rows rendering with a status badge.

- [ ] **Step 4: Commit**

```bash
git add apps/web/components/StatusBadge.tsx
git commit -m "Refactor StatusBadge to wrap ui/Badge with status→variant mapping."
```

---

## Task 8: Refactor `Navbar` to use `ui/Button` + `ui/DropdownMenu`

**Files:**
- Modify: `apps/web/components/Navbar.tsx`

The existing Navbar has hand-rolled nav links and uses `<UserButton afterSignOutUrl="/" />` from Clerk. Phase 2 replaces both with our primitives. The user menu becomes a custom `DropdownMenu` containing the user's email, a Settings link, and a Sign out item that calls `useClerk().signOut()`.

- [ ] **Step 1: Replace `apps/web/components/Navbar.tsx` entirely**

```typescript
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
```

- [ ] **Step 2: Add the missing i18n keys**

Edit `apps/web/lib/i18n/locales/en.ts`:
- Inside `common: { ... }` add `signOut: 'Sign out',`
- Inside `nav: { ... }` add `manageAccount: 'Manage account',`

Edit `apps/web/lib/i18n/locales/he.ts`:
- Inside `common: { ... }` add `signOut: 'התנתק',`
- Inside `nav: { ... }` add `manageAccount: 'נהל חשבון',`

- [ ] **Step 3: Build**

```bash
npm run build:web
```

Expected: build succeeds.

- [ ] **Step 4: Smoke-test**

`npm run dev:web`. Sign in, confirm:
- Nav links still highlight correctly when on `/dashboard`, `/documents/new`, etc.
- The user-menu button shows the user's first-letter initial.
- Clicking opens a dropdown with: email row, Settings, Users, Sign out.
- Settings link navigates to `/settings`.
- Sign out navigates to `/` after signing out.

- [ ] **Step 5: Run existing e2e suite — the Dashboard test depends on the Navbar still being visible after sign-in**

```bash
npm run test:e2e
```

Expected: all pass. If a test fails on Navbar selectors that depend on `<UserButton>`, update the test's locator to use the new dropdown trigger.

- [ ] **Step 6: Commit**

```bash
git add apps/web/components/Navbar.tsx apps/web/lib/i18n/locales/en.ts apps/web/lib/i18n/locales/he.ts
git commit -m "Refactor Navbar: token-styled links, custom user dropdown, Settings entry."
```

---

## Task 9: Refactor `DashboardClient` — filters, cards, controls

**Files:**
- Modify: `apps/web/app/dashboard/DashboardClient.tsx`

Replaces the hand-rolled `FilterTab` with `ui/Tabs`, the raw `<input type="checkbox">` with `ui/Checkbox`, action buttons with `ui/Button`, and wraps document rows in a token-aware card layout.

Phase 9 does NOT yet replace `window.confirm` or the error banner — those land in Task 10 so each commit stays focused.

- [ ] **Step 1: Replace `apps/web/app/dashboard/DashboardClient.tsx` entirely**

```typescript
'use client';

import { useAuth } from '@clerk/nextjs';
import { Download, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import type { DocumentDto } from '@docflow/shared';

import { StatusBadge } from '@/components/StatusBadge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useApiClient } from '@/lib/api-client';
import { useDateLocale, useTranslation } from '@/lib/i18n/LocaleProvider';
import { cn } from '@/lib/utils';

type Filter = 'all' | 'mine' | 'pending';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';
const CLIENT_BYPASS_TOKEN =
  process.env.NEXT_PUBLIC_BYPASS_AUTH === 'true'
    ? (process.env.NEXT_PUBLIC_BYPASS_TOKEN ?? null)
    : null;

function formatUpdatedAt(iso: string, dateLocale: string) {
  return new Date(iso).toLocaleDateString(dateLocale, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

function safePdfFileName(title: string): string {
  const cleaned = title
    .trim()
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '-')
    .replace(/\s+/g, ' ')
    .slice(0, 80);
  return cleaned || 'document';
}

function countSigners(doc: DocumentDto): number {
  return doc.workflowSteps.reduce((sum, s) => sum + s.signers.length, 0);
}

export function DashboardClient({
  documents: initialDocuments,
  myClerkId,
  myEmail,
}: {
  documents: DocumentDto[];
  myClerkId: string;
  myEmail: string;
}) {
  const { t } = useTranslation();
  const dateLocale = useDateLocale();
  const { getToken } = useAuth();
  const api = useApiClient();
  const router = useRouter();
  const [filter, setFilter] = useState<Filter>('all');
  const [documents, setDocuments] = useState(initialDocuments);
  const [deleteBusyId, setDeleteBusyId] = useState<string | null>(null);
  const [downloadBusyId, setDownloadBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [batchDeleting, setBatchDeleting] = useState(false);

  useEffect(() => {
    setDocuments(initialDocuments);
  }, [initialDocuments]);

  async function deleteDocument(doc: DocumentDto) {
    if (!window.confirm(t('dashboard.deleteConfirm', { title: doc.title })))
      return;
    setDeleteBusyId(doc._id);
    setError(null);
    try {
      await api.delete(`/documents/${doc._id}`);
      setDocuments((prev) => prev.filter((d) => d._id !== doc._id));
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.delete(doc._id);
        return next;
      });
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('dashboard.deleteFailed'));
    } finally {
      setDeleteBusyId(null);
    }
  }

  async function downloadDocument(doc: DocumentDto) {
    setDownloadBusyId(doc._id);
    setError(null);
    try {
      const token = CLIENT_BYPASS_TOKEN ?? (await getToken());
      if (!token) throw new Error('Not authenticated');
      const res = await fetch(`${API_URL}/documents/${doc._id}/download.pdf`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
      });
      if (!res.ok) throw new Error(`Download failed (${res.status})`);
      const blob = await res.blob();
      if (blob.size === 0) throw new Error('Downloaded PDF is empty');

      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = objectUrl;
      anchor.download = `${safePdfFileName(doc.title)}.pdf`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : t('document.downloadFailed'),
      );
    } finally {
      setDownloadBusyId(null);
    }
  }

  async function deleteSelected() {
    const ids = [...selectedIds];
    if (
      !window.confirm(
        t('dashboard.batchDeleteConfirm', { count: String(ids.length) }),
      )
    )
      return;
    setBatchDeleting(true);
    setError(null);
    const failed: string[] = [];
    for (const id of ids) {
      try {
        await api.delete(`/documents/${id}`);
        setDocuments((prev) => prev.filter((d) => d._id !== id));
        setSelectedIds((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      } catch {
        failed.push(id);
      }
    }
    setBatchDeleting(false);
    if (failed.length > 0) {
      setError(t('dashboard.batchDeleteFailed'));
    } else {
      router.refresh();
    }
  }

  const filtered = useMemo(() => {
    if (filter === 'mine') {
      return documents.filter((d) => d.ownerId === myClerkId);
    }
    if (filter === 'pending') {
      return documents.filter((d) => {
        const activeStep = d.workflowSteps.find(
          (s) => s.stepNumber === d.currentStep,
        );
        if (!activeStep) return false;
        return activeStep.signers.some(
          (s) =>
            s.status === 'pending' &&
            (s.clerkId === myClerkId || s.email === myEmail),
        );
      });
    }
    return documents;
  }, [documents, filter, myClerkId, myEmail]);

  const selectableIds = useMemo(() => filtered.map((d) => d._id), [filtered]);
  const allSelected =
    selectableIds.length > 0 && selectableIds.every((id) => selectedIds.has(id));

  function toggleSelectAll() {
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(selectableIds));
    }
  }

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <>
      <header className="mb-8">
        <h1 className="text-2xl">{t('dashboard.title')}</h1>
      </header>

      <div className="mb-6">
        <Tabs value={filter} onValueChange={(v) => setFilter(v as Filter)}>
          <TabsList>
            <TabsTrigger value="all">{t('dashboard.filterAll')}</TabsTrigger>
            <TabsTrigger value="mine">{t('dashboard.filterMine')}</TabsTrigger>
            <TabsTrigger value="pending">
              {t('dashboard.filterPending')}
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {error && (
        <div
          role="alert"
          className="mb-4 rounded-md border border-border bg-surface-muted px-4 py-2 text-sm text-danger"
        >
          {error}
        </div>
      )}

      {selectedIds.size > 0 && (
        <div className="mb-3 flex items-center gap-3 rounded-md border border-border bg-surface-muted px-4 py-2 text-sm">
          <span className="text-fg">
            {t('dashboard.selected', { count: String(selectedIds.size) })}
          </span>
          <Button
            type="button"
            size="sm"
            variant="destructive"
            onClick={deleteSelected}
            disabled={batchDeleting}
          >
            {batchDeleting
              ? t('dashboard.deletingSelected')
              : t('dashboard.deleteSelected')}
          </Button>
        </div>
      )}

      {filtered.length === 0 ? (
        <p className="rounded-md border border-dashed border-border py-12 text-center text-sm text-fg-muted">
          {t('dashboard.noDocuments')}
        </p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border bg-surface">
          <div className="flex items-center gap-3 border-b border-border bg-surface-muted px-4 py-2">
            <Checkbox
              checked={allSelected}
              disabled={selectableIds.length === 0}
              onCheckedChange={toggleSelectAll}
              aria-label={t('dashboard.selectAll')}
            />
            <span className="text-xs text-fg-muted">
              {t('dashboard.selectAll')}
            </span>
          </div>

          <ul className="divide-y divide-border">
            {filtered.map((doc) => {
              const isSelected = selectedIds.has(doc._id);
              return (
                <li key={doc._id}>
                  <div
                    className={cn(
                      'flex items-center gap-4 px-4 py-3 transition-colors hover:bg-surface-muted',
                      isSelected && 'bg-surface-muted',
                    )}
                  >
                    <Checkbox
                      checked={isSelected}
                      onCheckedChange={() => toggleSelect(doc._id)}
                      aria-label={`Select ${doc.title}`}
                    />
                    <Link
                      href={`/documents/${doc._id}`}
                      className="min-w-0 flex-1"
                    >
                      <div className="truncate font-medium text-fg">
                        {doc.title}
                      </div>
                      <div className="text-xs text-fg-muted">
                        {countSigners(doc)} {t('dashboard.signers')} ·{' '}
                        {t('dashboard.updated')}{' '}
                        {formatUpdatedAt(doc.updatedAt, dateLocale)}
                      </div>
                    </Link>
                    <div className="flex shrink-0 items-center gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => downloadDocument(doc)}
                        disabled={downloadBusyId === doc._id}
                        aria-label={t('common.downloadPdf')}
                      >
                        <Download className="me-1.5 h-3.5 w-3.5" />
                        {downloadBusyId === doc._id
                          ? t('common.downloading')
                          : t('common.downloadPdf')}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => deleteDocument(doc)}
                        disabled={deleteBusyId === doc._id}
                        aria-label={t('common.delete')}
                        className="text-danger hover:bg-surface-muted hover:text-danger"
                      >
                        <Trash2 className="me-1.5 h-3.5 w-3.5" />
                        {deleteBusyId === doc._id
                          ? t('common.deleting')
                          : t('common.delete')}
                      </Button>
                      <StatusBadge status={doc.status} />
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </>
  );
}
```

Note: this plan deliberately avoids Tailwind's slash-alpha syntax (`bg-danger/10`) because our color values are `var(--color-*)` references, which Tailwind 3.4 can't decompose into rgb with an `<alpha-value>` placeholder without extra config. The error-banner and delete-button styling above uses `bg-surface-muted` + `text-danger` instead — same intent, no token-system gymnastics.

- [ ] **Step 2: Build**

```bash
npm run build:web
```

If the build errors on `bg-danger/10` or similar — replace those four occurrences with `bg-surface-muted` and `border-border` respectively. Re-run the build.

- [ ] **Step 3: Smoke-test in dev**

`npm run dev:web`. Sign in, visit `/dashboard`. Confirm:
- Filter tabs render as the new `Tabs` primitive and switch correctly.
- Document rows show the new card layout.
- Checkboxes toggle individually and via "select all".
- Download / Delete buttons still work.
- `StatusBadge` rendering is intact (from Task 7).

- [ ] **Step 4: Run e2e**

```bash
npm run test:e2e
```

Expected: all pass. The existing dashboard test may rely on specific class names — update locators to use `getByRole` / `aria-label` rather than class-based selectors if needed.

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/dashboard/DashboardClient.tsx
git commit -m "Refactor DashboardClient: ui/Tabs, ui/Checkbox, ui/Button, token card layout."
```

---

## Task 10: Replace `window.confirm` and inline errors with Dialog + Toast

**Files:**
- Modify: `apps/web/app/dashboard/DashboardClient.tsx`

- [ ] **Step 1: Refactor the two delete flows and the error banner**

Edit `apps/web/app/dashboard/DashboardClient.tsx`. Apply these changes:

**1.** Update imports at the top — add `Dialog`/`DialogContent`/`DialogDescription`/`DialogFooter`/`DialogHeader`/`DialogTitle` and `toast` from sonner:

```typescript
import { toast } from 'sonner';
// ... existing imports ...
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
```

Remove the `Tabs` import comment-out — keep it as-is, it's still used.

**2.** Remove `const [error, setError] = useState<string | null>(null);` — error becomes a transient toast.

**3.** Remove the `error` state assignments throughout (`setError(null)`, `setError(err...)` lines). Replace them with `toast.error(...)` calls. Specifically:

In `deleteDocument`:
- Remove `setError(null);`
- Replace the catch block's `setError(err instanceof Error ? err.message : t('dashboard.deleteFailed'));` with:
  ```typescript
  toast.error(
    err instanceof Error ? err.message : t('dashboard.deleteFailed'),
  );
  ```

In `downloadDocument`:
- Remove `setError(null);`
- Replace the catch's `setError(err instanceof Error ? err.message : t('document.downloadFailed'));` with:
  ```typescript
  toast.error(
    err instanceof Error ? err.message : t('document.downloadFailed'),
  );
  ```

In `deleteSelected`:
- Remove `setError(null);`
- Replace `setError(t('dashboard.batchDeleteFailed'));` with `toast.error(t('dashboard.batchDeleteFailed'));`

**4.** Remove the `error && (<div ...>)` JSX block — it's gone.

**5.** Replace the two `window.confirm(...)` calls with `Dialog`-driven flows. Add state for the two confirm dialogs at the top of the component:

```typescript
  const [confirmDelete, setConfirmDelete] = useState<DocumentDto | null>(null);
  const [confirmBatchDelete, setConfirmBatchDelete] = useState(false);
```

Refactor `deleteDocument` to not include the confirm — it becomes the action that runs AFTER the dialog confirms. Rename the existing body to `runDeleteDocument(doc)`:

```typescript
  async function runDeleteDocument(doc: DocumentDto) {
    setDeleteBusyId(doc._id);
    try {
      await api.delete(`/documents/${doc._id}`);
      setDocuments((prev) => prev.filter((d) => d._id !== doc._id));
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.delete(doc._id);
        return next;
      });
      router.refresh();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : t('dashboard.deleteFailed'),
      );
    } finally {
      setDeleteBusyId(null);
      setConfirmDelete(null);
    }
  }
```

Similarly, refactor `deleteSelected` into `runDeleteSelected()` without the confirm prompt:

```typescript
  async function runDeleteSelected() {
    const ids = [...selectedIds];
    setBatchDeleting(true);
    const failed: string[] = [];
    for (const id of ids) {
      try {
        await api.delete(`/documents/${id}`);
        setDocuments((prev) => prev.filter((d) => d._id !== id));
        setSelectedIds((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      } catch {
        failed.push(id);
      }
    }
    setBatchDeleting(false);
    setConfirmBatchDelete(false);
    if (failed.length > 0) {
      toast.error(t('dashboard.batchDeleteFailed'));
    } else {
      router.refresh();
    }
  }
```

**6.** Wire the row delete button and the batch delete button to OPEN the dialogs:

The row delete button's `onClick`:
```typescript
  onClick={() => setConfirmDelete(doc)}
```

The batch delete button's `onClick`:
```typescript
  onClick={() => setConfirmBatchDelete(true)}
```

**7.** Append the two Dialog elements to the JSX (before the closing `</>`):

```typescript
      <Dialog
        open={confirmDelete !== null}
        onOpenChange={(open) => !open && setConfirmDelete(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('common.delete')}</DialogTitle>
            <DialogDescription>
              {confirmDelete
                ? t('dashboard.deleteConfirm', { title: confirmDelete.title })
                : ''}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setConfirmDelete(null)}
              disabled={deleteBusyId !== null}
            >
              {t('common.cancel')}
            </Button>
            <Button
              variant="destructive"
              onClick={() => confirmDelete && runDeleteDocument(confirmDelete)}
              disabled={deleteBusyId !== null}
            >
              {deleteBusyId
                ? t('common.deleting')
                : t('common.delete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={confirmBatchDelete}
        onOpenChange={setConfirmBatchDelete}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('dashboard.deleteSelected')}</DialogTitle>
            <DialogDescription>
              {t('dashboard.batchDeleteConfirm', {
                count: String(selectedIds.size),
              })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setConfirmBatchDelete(false)}
              disabled={batchDeleting}
            >
              {t('common.cancel')}
            </Button>
            <Button
              variant="destructive"
              onClick={runDeleteSelected}
              disabled={batchDeleting}
            >
              {batchDeleting
                ? t('dashboard.deletingSelected')
                : t('dashboard.deleteSelected')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
```

- [ ] **Step 2: Build**

```bash
npm run build:web
```

Expected: build succeeds.

- [ ] **Step 3: Smoke-test in dev**

`npm run dev:web`. Sign in, visit `/dashboard`.

- Click a row's Delete button — Dialog opens with the document title. Cancel → closes. Confirm → row disappears.
- Select multiple rows, click Delete selected → Dialog opens with count. Cancel/confirm work.
- Force a delete to fail (block API or use DevTools network) — a Sonner toast appears at the bottom instead of an inline banner.

- [ ] **Step 4: Run e2e**

```bash
npm run test:e2e
```

If the existing dashboard test clicks Delete and dismisses a confirm prompt, it will now need to interact with the Dialog instead. Update the test's locator from `dialog.accept()` to clicking the Dialog's confirm button by role.

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/dashboard/DashboardClient.tsx
git commit -m "Replace window.confirm with Dialog, inline errors with Sonner toasts."
```

---

## Task 11: Playwright theme-persistence e2e test

**Files:**
- Create: `tests/e2e/theme-persistence.spec.ts`

Verifies the persistence story end-to-end. Test runs in `BYPASS_AUTH=true` mode (same as existing tests) — that means Clerk write paths are no-ops, so we only test the localStorage + cookie + reload portion here. Cross-device Clerk sync is covered by a manual checklist in Task 12.

- [ ] **Step 1: Create `tests/e2e/theme-persistence.spec.ts`**

```typescript
import { test, expect, type Page } from '@playwright/test';

async function gotoSettings(page: Page) {
  await page.goto('/settings');
  await expect(page.getByRole('heading', { name: /settings/i })).toBeVisible();
}

test.describe('Theme persistence', () => {
  test('selecting a theme writes localStorage and cookie', async ({ page }) => {
    await gotoSettings(page);

    await page.getByRole('radio', { name: /modern/i }).click();

    const ls = await page.evaluate(() =>
      window.localStorage.getItem('docflow-theme'),
    );
    expect(ls).toBe('modern');

    const cookies = await page.context().cookies();
    const themeCookie = cookies.find((c) => c.name === 'docflow-theme');
    expect(themeCookie?.value).toBe('modern');
  });

  test('chosen theme survives a full reload (FOUC-free)', async ({ page }) => {
    await gotoSettings(page);
    await page.getByRole('radio', { name: /classic/i }).click();

    // Capture the html className at the very first paint after reload.
    const reload = page.reload();
    await reload;
    const htmlClass = await page.evaluate(
      () => document.documentElement.className,
    );
    expect(htmlClass).toContain('theme-classic');
  });

  test('switching theme broadcasts to other tabs', async ({ context }) => {
    const tabA = await context.newPage();
    const tabB = await context.newPage();

    await tabA.goto('/settings');
    await tabB.goto('/settings');

    await tabA.getByRole('radio', { name: /humane/i }).click();
    await tabA.getByRole('radio', { name: /modern/i }).click();

    await expect
      .poll(async () =>
        tabB.evaluate(() =>
          document.documentElement.classList.contains('theme-modern'),
        ),
      )
      .toBe(true);

    await tabA.close();
    await tabB.close();
  });
});
```

- [ ] **Step 2: Run the new spec**

```bash
npx playwright test tests/e2e/theme-persistence.spec.ts --reporter=line
```

Expected: 3/3 pass.

If a test fails because the `/settings` page redirects to `/sign-in` in BYPASS_AUTH mode, check `playwright.config.ts` — it should set `BYPASS_AUTH=true` for the dev server. The bypass user has `userId = 'bypass-dev-user'` per `server-auth.ts`, so the redirect guard in `app/settings/page.tsx` should let it through.

- [ ] **Step 3: Run the FULL e2e suite to confirm no regressions**

```bash
npm run test:e2e
```

Expected: all tests pass — the 5 Phase 1 dev-tokens tests, the 3 new theme-persistence tests, plus any pre-existing dashboard/new-document tests.

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/theme-persistence.spec.ts
git commit -m "Add Playwright e2e: theme persistence across reload and tabs."
```

---

## Task 12: Final verification

No code changes. Confirm Phase 2 lands clean.

- [ ] **Step 1: Production build**

```bash
npm run build:web
```

Expected: PASS. Note any bundle-size deltas on `/dashboard`, `/settings`, and the root layout.

- [ ] **Step 2: TypeScript check** (since the project has no `.eslintrc`)

```bash
cd apps/web && npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 3: Full Playwright suite**

```bash
npm run test:e2e
```

Expected: all tests pass (Phase 1 dev-tokens 5 + Phase 2 theme-persistence 3 + existing dashboard/new-document).

- [ ] **Step 4: Manual checklist** (dev server in browser, do once per section)

`npm run dev:web`, sign in, then:

- [ ] `/dashboard` renders with new components: Tabs filter, Cards, ui/Buttons. No `bg-black`, `bg-white`, or `text-gray-*` survives as visual blockers (some Tailwind defaults are still acceptable in non-touched code).
- [ ] Document delete via row button → Dialog appears. Cancel works. Confirm works. Toast appears on error.
- [ ] Batch delete → Dialog appears. Same flow.
- [ ] StatusBadge renders for every status the dashboard actually returns. (Check at least one Approved, one Draft.)
- [ ] User dropdown in Navbar opens. Settings link goes to /settings. Sign-out works.
- [ ] `/settings` renders with Appearance card. Picking each of the three themes restyles every surface (Navbar, dashboard, settings) without flash.
- [ ] Theme picked at `/settings` persists across full reload (Ctrl-F5).
- [ ] Open `/dev/tokens` in a new tab; theme changes there propagate to the dashboard tab.
- [ ] Switch language to Hebrew via LanguageSwitcher; settings copy renders in Hebrew, layout flips RTL, ThemePicker labels still readable.

- [ ] **Step 5: Cross-device Clerk persistence smoke** (only if signed-in Clerk auth is available locally, NOT in BYPASS mode)

If `BYPASS_AUTH=true`, skip this step. Otherwise:

- [ ] Sign in. Pick Modern on `/settings`. Open the Clerk dashboard for the same user — confirm `publicMetadata.theme === 'modern'`.
- [ ] Sign out, clear localStorage and cookies for the domain. Sign back in. `<html>` should already have `theme-modern` on the first paint (no flash from Humane).

- [ ] **Step 6: Inspect git state**

```bash
git status
git log --oneline b0e859e..HEAD
```

Expected:
- `git status` — only the pre-existing user-state files (the two `(auth)` pages and `.claude/settings.local.json`) modified. Nothing else uncommitted.
- `git log` shows a clean 11-commit chain (Task 1 through Task 11). No merge commits.

---

## Out of scope for this plan (named so they don't sneak in)

- Refactoring any surface OTHER than the dashboard. Auth pages, document workflow, templates, guest signing, settings → other sections — all Phase 3, separate plans.
- Adding more themes (e.g., dark mode). Tokens are dark-ready; adding the dark blocks is a future phase.
- Migrating the Clerk-hosted sign-in/sign-up widgets. Per spec §9, those stay as-is in Phase 2.
- Adding a unit-test runner. Phase 2 still relies on Playwright + manual verification (consistent with Phase 1).
- Visual regression testing.
- The redundant Tailwind alpha-color wiring (e.g., `bg-danger/10`) — if Tailwind 3.4's CSS-variable-with-alpha syntax doesn't pick up our colors, use `bg-surface-muted` as the fallback per Task 9 Step 2 note. Don't rewire the token system.
- Storybook.

---

## Verification summary

When Phase 2 is complete:

- ✅ Dashboard (`/dashboard`) fully uses Phase 1 components: Navbar (Button + DropdownMenu), DashboardClient (Tabs + Checkbox + Button + Dialog + token Card layout), StatusBadge (wraps Badge), Sonner toasts replacing inline error banner.
- ✅ Settings page (`/settings`) exists with Appearance section + working ThemePicker.
- ✅ Theme persists across reload (cookie + localStorage), across tabs (storage event), and across devices for signed-in users (Clerk publicMetadata).
- ✅ Playwright suite: Phase 1 dev-tokens (5) + Phase 2 theme-persistence (3) + existing tests, all green.
- ✅ Hebrew/RTL still renders correctly on dashboard and settings.
- ✅ No regression on user-facing flows.

Phase 3 (rollout to auth, document workflow, templates, guest signing, remaining settings) is unblocked — the patterns and components are battle-tested on the dashboard.
