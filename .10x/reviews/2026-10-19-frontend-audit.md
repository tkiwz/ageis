# Frontend audit — 2026-10-19

110 .tsx files, 58 pages. Checked in browser (local prod build) as ADMIN, EN + AR.

## Language (biggest gap)
- Two separate i18n systems: `src/lib/i18n/LanguageProvider` (EN/AR/UR/NE switcher in header) and `src/lib/lang-context` (sidebar toggle). Not synced.
- Only ~13 / 110 files use any translation. Switching to Arabic flips RTL but almost all text stays English (sidebar, dashboard, cards).
- Many pages hardcode bilingual inline text ("User Management · إدارة المستخدمين").
- No Arabic font (Inter + JetBrains Mono only) → Arabic falls back to system font.
- Language saved in localStorage only → server renders EN, flashes on load.
- 145 physical direction classes (ml-/mr-/left-/text-left) → wrong spacing in RTL.

## Theme / layout
- Colors are central CSS tokens (good) BUT 634 hardcoded color classes in 21 files (text-green-400, bg-red-500/10...).
- Dark "terminal" style: monospace display font for headings, cyan neon primary, grid background.
- Two language buttons (sidebar + header). Floating voice button overlaps sidebar in RTL.

## Demo / prototype leftovers (to remove for production)
- Login: register tab (creates ADMIN), "Internal Prototype" footer, PIN-only 6-digit password.
- `/api/auth/register`, `/api/auth/demo-setup`.
- 7 `*/simulate` APIs + their buttons (tasks, inspections, investigations, risk, compliance, contractors, pipelines).
- `autonomy/demo/inject-anomaly`, demoMode toggle.
- Sidebar footer "Internal Prototype · ADMIN".
- Demo seed users (*@aegis.local, shared 6-digit password).

## Unused code
- components/dashboard/sites-overview.tsx, components/ui/separator.tsx, lib/env.ts (env validation never called!), lib/security/encryption.ts.
