# ADR-004: Token-only design system + per-module i18n dictionaries

**Status:** Accepted · **Date:** 2026-10-19 · **Feature:** redesign-i18n

## Context
Production launch needs a new identity (spec 2026-10-19 v2), full AR (default, RTL) / EN, and ~100 files changed by 5 parallel work packages. Today: 588 raw palette classes, 190 physical direction classes, one dictionary pair (merge-conflict hotspot).

## Decision
1. Colours only via CSS tokens (globals.css, light + dark) exposed in Tailwind: `primary`, `success|warning|danger|info`, `risk-*`, `chart-1..6`, `surface-2`. No raw palette classes or hex in components (exception: `components/three-d/palette.ts`).
2. Logical CSS only (`ms/me/ps/pe/start/end/text-start/border-s`), enforced by `scripts/i18n-audit.mjs`.
3. Dictionaries split per namespace: `messages/{en,ar}/<ns>.ts` aggregated by `index.ts`; Arabic typed against English (missing key = type error). Each package owns its namespace files.
4. Shared UI primitives (PageHeader, EmptyState, ErrorState, Skeleton, StatusBadge, NativeSelect) owned by WP0; packages consume, never fork.

## Alternatives
| Option | Why not |
|---|---|
| next-intl / i18next | Extra runtime + migration of the typed system already in place; no SSR gain |
| Single dictionary + careful merges | 5 parallel writers → guaranteed conflicts |
| Keep palette classes, recolour via Tailwind theme override | Breaks semantic meaning (red ≠ danger), no light/dark pairing |

## Consequences
+ Rebrand = edit tokens only; parallel work without conflicts; CI catches regressions.
− Large one-time diff; reviewers must check visual parity per page.
Risk: hydration on dates (pin Asia/Muscat, render relative time after mount).
