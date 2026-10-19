# AEGIS production redesign + full AR/EN — design spec

Date: 2026-10-19 · Status: **Approved v2** (owner feedback applied)
Inputs: UI designer, UX reviewer, frontend architect (3 independent reviews), frontend audit, owner requests.


## 0. v2 — owner feedback (supersedes §1 colours/logo where they differ)
Owner: v1 looked "childish/geometric". Wanted simple, easy on the eyes, **technical with an Apple-like feel**. Logo: **shield with the letter A + a 3D ring orbiting it**. Nav: merge, but everything must be obvious (no system-hopping).
- Palette (dark / light): bg #0F1115 / #F5F5F7 · surface #171A20 / #FFFFFF · elevated #1E222A / #FFFFFF · border #262B33 / #E3E5E8 · text #ECEEF2 / #1D1D1F · secondary #9BA3AE / #515862 · muted #6B7480 / #7A828C · primary #5B8CF0 / #2F5BD3.
- Severity (dark / light): info #6EA8FE / #2F6FD6 · low #6FBF8E / #2F8A55 · medium #E2B15C / #A9761B · high #E58A3C / #C2621A · critical #E5534B / #C93C37. Shown as **dot + word** (no geometric glyphs).
- Shape: radius 10 controls / 14 cards / 20 sheets; light: soft layered shadow; dark: surface steps. Translucent material only on header/sidebar (Apple vibrancy), nowhere else. No brass, no glow, no grid.
- Type: Inter (Latin, SF-like) + IBM Plex Sans Arabic. Headings 600, Latin tracking -0.01em; Arabic no tracking.
- Motion: Apple-like but restrained — 200ms ease-out / gentle spring (no overshoot) for panels; data changes as in §2.
- Logo: 3D (react-three-fiber, lazy, login + splash) — extruded blue shield, embossed silver "A", thin metal ring with a bead orbiting; reduced-motion = static. 2D SVG of the same mark for sidebar, favicon, PWA.

## 1. Identity — "Gulf Industrial Instrument"
Calm, exact, heavy-duty — like a refinery DCS console or a ship bridge, built for 12-hour shifts. Colour is quiet so **severity is the only loud thing**. Petrol-steel blue + brass (Gulf maritime / oil & gas heritage). Mark = **layered shield** = HSSE "layers of protection" (barrier / bow-tie model). No robots, no sparkles, no neon.

### Colours (HSL tokens in globals.css)
| Token | Light | Dark |
|---|---|---|
| background | #F6F7F9 | #0E1216 |
| surface/card | #FFFFFF | #151A20 |
| elevated | #FFFFFF + shadow | #1C232B |
| border | #DDE1E6 | #2A333D |
| text | #0F1720 | #E6EAEE |
| text-secondary | #3D4856 | #A9B3BE |
| muted | #5E6B7A | #7D8895 |
| primary | #12466B | #6FA8DC |
| accent (brass, brand only) | #A9772F | #D4A35A |
| focus ring | #2F7FC1 | #8BBBE5 |
Severity (light/dark): info #2563EB/#60A5FA · low #2E7D32/#4CAF50 · medium #B7791F/#F2B544 · high #D9480F/#FB7A3C · critical #B91C1C/#F05252.
Severity is never colour-only: glyph (● ✓ ▲ ◆ ⬣) + label + colour. Brass is never a severity colour.
Themes: dark default on desktop (control room), light default on mobile (sunlight); user toggle.

### Type
IBM Plex Sans Arabic + IBM Plex Sans (one family, matched). IBM Plex Mono only for IDs/codes. Scale: 32/24/20/16 (600), body 14/22, small 13, caption 12. Arabic: +10% line height, no uppercase/letter-spacing, ≥14px. KPIs tabular-nums. Mobile +2px.

### Logo
3D "Layered Aegis": 3 nested extruded shields, brass core, metal materials, one warm key light, ±6° idle sway (reduced-motion: static). Login/splash only, lazy-loaded. 2D SVG fallback for favicon/PWA/sidebar.

### Components
Radius 6 controls / 8 cards / 12 dialogs. Light: hairline border + soft shadow; dark: surface steps, no shadow. No glass, no glow, no grid bg, no scanline, no gradients. Buttons 36px desktop / 48–56px mobile. Tables 40px rows, severity bar 3px on the start edge. Sidebar 240px, active item = 3px primary bar on start edge.
Icons: lucide stroke 1.75; replace Sparkles (AI) → BrainCircuit; no emoji icons.

## 2. Motion & 3D
Motion only to explain change: new alert slides in 200ms; changed value highlights 600ms; escalation pulses twice then holds; only an unacknowledged emergency pulses continuously. Easing cubic-bezier(0.2,0,0,1), 150–250ms, no bounce. Page transitions: 120ms fade max. `prefers-reduced-motion` → opacity/colour only.
3D only where position matters: pipeline 3D view (dpr ≤1.5, frameloop demand, pause when hidden, 2D fallback) + logo on login.

## 3. UX (P0 first)
- P0 Mobile report: send structured data to incidents API (not via voice parser), client UUID for offline retry, no default severity, GPS/site auto-fill, Arabic-first tabs, 56px targets, fix dead /m/profile, duplicate icons.
- P0 Dashboard severity-first: status bar (emergencies, unacked critical, data freshness), action queue with inline Acknowledge, KPIs: Emergencies, Critical alerts, Open incidents (+overdue), Permits awaiting approval, Sensors offline, Sites. Remove single-device widget.
- P0 Alerts acknowledge inline everywhere (not only Admin).
- P1 Navigation 38 → ~22 items, grouped by job: Now (Overview, Live map, Emergencies, Alerts) · Field work (Permits, Tasks, Sites & pipelines) · Incidents & risk · Assets & monitoring (Sensors, Devices incl. drones) · Compliance · Assistant (one entry) · Admin (bottom, admin only). Role-based home.
- P1 Skeletons instead of spinners; empty states with next action; error banner with retry + last-good time; "Updated 8 s ago" freshness.
- P1 Command center = wall view (map + alert queue).
- RTL: logical classes, mirrored arrows, LTR islands for codes/IDs/units, Western digits, Asia/Muscat time zone, charts/maps wrapped LTR.
- A11y: AA contrast (7:1 critical), focus rings, keyboard (A ack, / search, Esc), aria-live for critical alerts.

## 4. Production cleanup (remaining)
Remove: glass/glow/grid/scan styles, Sparkles, emoji icons, raw enum labels, "Scenario Simulator" (drones), "AI Demo Controls" (pipeline), demo copy in admin/settings, single-device sensor widget, "Worker" fallback, curl brute-force sample in security dashboard. Real admin: admin@aegis.com via `npm run create-admin`; users user@aegis.com.

## 5. Implementation plan
- **WP0 Foundation (lead, sequential):** tokens light/dark + tailwind, fonts (Plex Sans), per-module dictionaries (`messages/en|ar/<ns>.ts`), enums dictionary, `useFormat`/`tEnum`/plurals/TZ, ui fixes (switch/dropdown RTL), shared `PageHeader`/`EmptyState`/`ErrorState`/`Skeleton`/`StatusBadge`/`NativeSelect`, theme-colors hook, 2D + 3D logo, nav restructure, layout/sidebar/header restyle, i18n-audit script.
- **WP1–WP5 in parallel (worktrees, disjoint files):** 1 Ops core · 2 Assets + Command · 3 Safety + Mobile + Voice · 4 Intelligence · 5 Governance + Admin. Each: translate (AR/EN), restyle with tokens + shared components, logical classes, states, remove demo copy.
- **Verify:** typecheck/build, i18n-audit (no English JSX, no Arabic outside ar/, no palette/physical classes), independent UI + UX review agents, Playwright both languages × desktop/mobile.
