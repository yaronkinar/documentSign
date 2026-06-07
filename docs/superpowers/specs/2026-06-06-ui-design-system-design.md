# DocFlow UI Design System — Design Spec

**Date:** 2026-06-06
**Status:** Approved for planning
**Scope:** Replace DocFlow's utilitarian black-and-white styling with a cohesive, themeable design system built on shadcn/ui and CSS-variable tokens.

---

## 1. Goals & Success Criteria

### Goal

DocFlow today is functional but visually plain — mostly black/white/gray Tailwind utilities applied ad-hoc per component. The goal is to replace this with a coherent, contemporary design system that reads as a trustworthy SaaS for legal and business document workflows.

We are landing the change as a **system** (tokens + components + docs + theme switcher) rather than as ad-hoc styling, so the whole app can be re-skinned consistently in later phases without revisiting every component.

### Direction (decided)

- **Visual mood:** corporate-trust with clean-modern restraint. Reads as enterprise-grade and contract-serious, but contemporary, not 1990s e-signature software.
- **Default palette ("Humane"):** indigo-navy `#1E2548` + amber `#F59E0B` + warm cream neutrals `#FBFAF7`.
- **Typography:** Inter throughout. Headings get `tracking-tight` + `font-semibold` (not bold) for the "premium quiet" feel.
- **Component approach:** shadcn/ui (Radix primitives, Tailwind-styled, source copied into repo).
- **Light only in v1.** Token structure is dark-ready — adding dark is a future phase, no component changes required.

### Success Criteria

1. `apps/web/components/ui/` contains 14 shadcn primitives styled with our tokens.
2. Tokens live as CSS variables; switching `--color-primary` (or the theme class on `<html>`) re-skins the whole system.
3. A `/dev/tokens` preview route renders all components in all variants, in all three themes, with a Hebrew/RTL toggle.
4. Three named themes ship: **Humane** (default), **Classic**, **Modern** — selectable in user settings, persisted to localStorage and to the Clerk user profile when signed in.
5. The dashboard (`Navbar` + `DashboardClient` + `StatusBadge`) is rewritten using the new components, proving the system end-to-end.
6. All existing Playwright e2e tests pass on the refactored surfaces.
7. Hebrew/RTL renders correctly in all v1 components.

---

## 2. Design Tokens

All tokens are CSS variables declared on the theme classes (`.theme-humane`, `.theme-classic`, `.theme-modern`) and on `:root` (default = humane). Tailwind reads them via `theme.extend.colors` so utility classes like `bg-primary`, `text-fg-muted`, `border-border` compile to `var(--color-*)` references.

### Color tokens (Humane / default values)

| Token | Value | Use |
|---|---|---|
| `--color-bg` | `#FBFAF7` | App background (warm cream) |
| `--color-surface` | `#FFFFFF` | Cards, popovers, dialogs |
| `--color-surface-muted` | `#F5F4EE` | Subtle panels, hover states |
| `--color-border` | `#E8E5DD` | Default border |
| `--color-border-strong` | `#D5D1C5` | Inputs, dividers needing weight |
| `--color-fg` | `#1E2548` | Primary text, headings |
| `--color-fg-muted` | `#4B5266` | Secondary text |
| `--color-fg-subtle` | `#807A6C` | Captions, meta |
| `--color-primary` | `#1E2548` | Primary buttons, brand |
| `--color-primary-fg` | `#FFFFFF` | Text on primary |
| `--color-accent` | `#F59E0B` | High-emphasis CTA, brand mark |
| `--color-accent-fg` | `#1E2548` | Text on accent |
| `--color-success` | `#16A34A` | Status, alerts, badges |
| `--color-warning` | `#F59E0B` | Status, alerts, badges |
| `--color-danger` | `#DC2626` | Status, alerts, badges |
| `--color-info` | `#2563EB` | Status, alerts, badges |
| `--color-pill-bg` | `#FEF3C7` | Theme-specific accent pill background |
| `--color-pill-fg` | `#92400E` | Theme-specific accent pill text |

### Themes (overrides)

**Classic** — DocuSign-ish, warmer gold

| Token | Value |
|---|---|
| `--color-bg` | `#F6F8FC` |
| `--color-surface-muted` | `#EEF2F7` |
| `--color-border` | `#D9E2F0` |
| `--color-fg` | `#0B2545` |
| `--color-fg-muted` | `#3A4A63` |
| `--color-fg-subtle` | `#6B7A93` |
| `--color-primary` | `#0B2545` |
| `--color-accent` | `#F5B700` |
| `--color-accent-fg` | `#0B2545` |
| `--color-pill-bg` | `#FEF3C7` |
| `--color-pill-fg` | `#8A6300` |

**Modern** — Stripe-ish, teal accent

| Token | Value |
|---|---|
| `--color-bg` | `#F7F9FB` |
| `--color-surface-muted` | `#F1F5F9` |
| `--color-border` | `#E1E8EF` |
| `--color-fg` | `#0F1F33` |
| `--color-fg-muted` | `#475569` |
| `--color-fg-subtle` | `#64748B` |
| `--color-primary` | `#0F1F33` |
| `--color-accent` | `#0D9488` |
| `--color-accent-fg` | `#FFFFFF` |
| `--color-pill-bg` | `#CCFBF1` |
| `--color-pill-fg` | `#115E59` |

### Typography

- **Family:** Inter (only). Loaded via `next/font` for both Latin and Hebrew subsets.
- **Scale:** matches Tailwind defaults (`text-xs` … `text-3xl`). No custom scale.
- **Headings:** `tracking-tight font-semibold`. Never `font-bold` — the weight comes from spacing and color contrast, not from bolding.
- **Hebrew/RTL:** Inter ships with Hebrew coverage. The existing `dir` switching via `LocaleProvider` is preserved unchanged.

### Spacing, radii, focus

- **Spacing:** Tailwind defaults.
- **Radii:** `--radius: 0.5rem` (8px base). Cards use `lg` (10px). Pills use `full`. Inputs and buttons use `--radius`.
- **Focus ring:** 2px solid `color-mix(in srgb, var(--color-primary) 40%, transparent)` with 2px offset on all interactive elements.

---

## 3. Components (v1 scope)

Fourteen shadcn primitives, installed via `npx shadcn@latest add <name>` and re-themed by overriding the CSS variables shadcn ships with.

| Component | Justification |
|---|---|
| `Button` | Variants: primary, accent, secondary, ghost, danger. Used everywhere. |
| `Input` | Forms across new-doc wizard, templates, profiles, settings. |
| `Textarea` | Comments composer, template fields. |
| `Label` | Pair with all inputs for accessibility. |
| `Select` | Workflow setup signer dropdowns, dashboard filters. Radix-based, RTL-aware. |
| `Checkbox` | Dashboard select-all, signer options, settings toggles. |
| `Badge` | Document status. `StatusBadge.tsx` becomes a thin wrapper over this. |
| `Card` | Document rows, dashboard tiles, settings panels. |
| `Dialog` | Replaces all `window.confirm` calls (delete confirmation, batch delete). |
| `Dropdown Menu` | Row actions (download / delete / share), user menu in navbar. |
| `Tabs` | Dashboard filter tabs, template editor sections. |
| `Toast` (Sonner) | Replaces inline error banners with non-blocking feedback. |
| `Tooltip` | Icon-only buttons, truncated names. |
| `Skeleton` | Loading states for dashboard, document viewer. |

**Plus one custom component:** `ThemePicker` — a radio-card group of the three themes (swatches + name) for the Settings → Appearance section.

**Out of v1** (add when needed): `DataTable`, `Calendar`, `Popover`, `Command`, `Accordion`, `Sheet`.

---

## 4. Multi-theme System

### Behavior

- Three named themes: **Humane** (default), **Classic**, **Modern**.
- User selects in Settings → Appearance.
- Choice persists to `localStorage` (key: `docflow.theme`) immediately.
- When signed in, also persists to the user's Clerk publicMetadata so it follows them across devices.
- On page load, a tiny inline script in `<head>` reads localStorage and sets the theme class on `<html>` before hydration to prevent flash of wrong theme (same pattern as the existing `LOCALE_BOOTSTRAP_SCRIPT`).

### Implementation surface

- `ThemeProvider` (client component, wraps the app inside `LocaleProvider`).
- `useTheme()` hook — returns `{ theme, setTheme }`.
- Inline bootstrap script — `THEME_BOOTSTRAP_SCRIPT` in `lib/theme/theme.ts`, injected via `<script>` in `app/layout.tsx` head, alongside the existing locale script.
- `ThemePicker` component.

### Cost

~80 lines total (provider + bootstrap + picker). Zero component changes — every shadcn primitive reads tokens.

---

## 5. Architecture

```
apps/web/
├── app/
│   ├── globals.css                    # CSS variable declarations for all three themes
│   ├── layout.tsx                     # Adds THEME_BOOTSTRAP_SCRIPT + <ThemeProvider>
│   └── dev/
│       └── tokens/page.tsx            # Token & component preview (dev-only route)
├── components/
│   ├── ui/                            # shadcn primitives (12 files)
│   │   ├── button.tsx
│   │   ├── input.tsx
│   │   ├── textarea.tsx
│   │   ├── label.tsx
│   │   ├── select.tsx
│   │   ├── checkbox.tsx
│   │   ├── badge.tsx
│   │   ├── card.tsx
│   │   ├── dialog.tsx
│   │   ├── dropdown-menu.tsx
│   │   ├── tabs.tsx
│   │   ├── tooltip.tsx
│   │   ├── skeleton.tsx
│   │   └── sonner.tsx                 # Toaster mount
│   ├── ThemePicker.tsx                # Custom — radio-card group for the three themes
│   ├── Navbar.tsx                     # Existing — refactored to use ui/Button + ui/DropdownMenu
│   ├── StatusBadge.tsx                # Existing — becomes thin wrapper over ui/Badge
│   └── (other existing components, untouched in Phase 1)
├── lib/
│   ├── theme/
│   │   ├── theme.ts                   # THEME_BOOTSTRAP_SCRIPT, theme constants, type
│   │   └── ThemeProvider.tsx          # Client provider + useTheme hook
│   └── utils.ts                       # cn() helper (clsx + tailwind-merge)
├── tailwind.config.ts                 # theme.extend.colors → var(--color-*)
└── components.json                    # shadcn config (style: new-york, baseColor: neutral, cssVariables: true)
```

### Dependencies added

- `tailwindcss-animate` (shadcn requirement)
- `class-variance-authority` (variant typing)
- `clsx`, `tailwind-merge` (cn helper)
- `lucide-react` (icons; replaces ad-hoc inline SVGs)
- `sonner` (toasts)
- `@radix-ui/react-*` primitives (auto-installed by shadcn per component)

Net runtime addition: ~30–50KB gzipped. All maintained by shadcn, Radix, or the Tailwind team.

### Backwards-compatibility note

Existing inline Tailwind classes (`bg-black`, `text-gray-500`, etc.) keep working throughout the migration. Old utilities are not removed — surfaces get refactored to the new components incrementally in Phase 3. This means Phase 1 and Phase 2 are non-breaking; nothing else changes visually until each surface is touched.

---

## 6. Rollout Phases

Each phase is independently shippable.

### Phase 1 — Foundation

- Install shadcn (`npx shadcn@latest init`).
- Author all token CSS in `globals.css` (three theme blocks).
- Wire Tailwind config to read tokens via CSS variables.
- Install the 14 shadcn components and re-skin each by overriding the default variant CSS to use our tokens.
- Build `ThemeProvider`, bootstrap script, `ThemePicker`.
- Build `/dev/tokens` preview route showing every component in every variant in every theme, with a Hebrew/RTL toggle.

**Outcome:** the design system exists, is verifiable on `/dev/tokens`, but no user-facing surface uses it yet. Zero behavioral change to production screens.

### Phase 2 — Reference surface (Dashboard)

- Refactor `Navbar` to use `ui/Button`, `ui/DropdownMenu` (for user menu), `ui/Tabs` if needed.
- Refactor `DashboardClient` to use `ui/Card`, `ui/Checkbox`, `ui/Button`, `ui/Badge`, `ui/Tabs` for filters.
- Replace `window.confirm` calls (delete confirmation, batch delete) with `ui/Dialog`.
- Replace inline error banner with `ui/Toast` (Sonner).
- Replace `StatusBadge` internals with `ui/Badge`.
- Add `ThemePicker` to Settings → Appearance.
- Verify Playwright e2e tests still pass on dashboard flows.
- Add one new Playwright test: theme persists across reload and across sign-in.

**Outcome:** one fully re-skinned, production-quality surface that becomes the template for Phase 3.

### Phase 3 — Rollout to remaining surfaces

In priority order, each its own focused PR:

1. **Auth pages** (`/sign-in`, `/sign-up`, SSO callbacks) — high first-impression value, low complexity.
2. **Document workflow** (`new-document`, `documents/[id]`, `DraftWorkflowSetup`) — most-used flow.
3. **Templates** (list + editor).
4. **Guest signing** (`/sign/[docId]`) — business-critical but more isolated.
5. **Settings screens** (users, signer profiles, signatures, home page).

Each surface refactor: ~1 focused session; uses Phase 2 as the pattern reference.

---

## 7. Testing

- **`/dev/tokens` preview route** is the manual smoke test for the design system itself. Hebrew/RTL toggle + theme switcher built in.
- **No new unit tests for shadcn wrappers.** They are thin compositions of Radix primitives. Radix has its own test coverage for accessibility, focus management, and keyboard navigation. Testing our wrappers would duplicate that with no added value.
- **Existing Playwright e2e tests** continue to run. They cover real user flows and catch regressions when surfaces are refactored.
- **One new Playwright e2e test:** theme persistence — set a theme, reload, verify; sign in, verify it follows; switch theme while signed in, verify Clerk metadata updates.
- **Visual regression testing:** out of v1 scope. If added later, the cheapest path is Playwright screenshot diffs against `/dev/tokens`.

---

## 8. Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Migration drag — refactoring every screen takes time | Old utility classes keep working. Refactor opportunistically alongside other feature work. Only Phase 1 and Phase 2 are committed up front. |
| shadcn dependency churn | Not a real risk: shadcn copies source into the repo, no upstream version pin to chase. Radix primitives underneath are stable and widely deployed. |
| Hebrew/RTL regressions | `/dev/tokens` includes an RTL toggle. Every Phase 2/3 surface tested in both LTR and RTL before merge. Radix primitives are RTL-aware. |
| Theme picker complexity multiplies state | Dark mode explicitly out of v1. Three themes × light only = three states. |
| Bundle size | Net add is ~30–50KB gzipped. Lucide tree-shakes; only installed Radix primitives ship. Acceptable for a B2B SaaS dashboard. |
| FOUC on theme load | Inline bootstrap script in `<head>` sets the theme class on `<html>` before hydration, mirroring the existing locale bootstrap script. |

---

## 9. Out of Scope (named so they don't sneak in)

- Dark mode (future phase; tokens are dark-ready).
- White-label per-tenant theming (separate, larger initiative).
- Marketing/landing redesign — homepage gets a light pass in Phase 3, no new sections or copy work.
- Storybook (`/dev/tokens` covers the need).
- Animation/motion system beyond shadcn defaults.
- Mobile-specific layouts — existing responsive behavior carries through.
- Replacing Clerk's hosted UI for sign-in/sign-up (the *wrapper* pages get themed, the embedded Clerk widgets stay as-is for now).

---

## 10. Open Questions

None — all design questions resolved during brainstorming. Implementation-level questions (exact shadcn variant CSS, exact bootstrap script wording, ThemePicker layout) will be settled during the implementation plan.
