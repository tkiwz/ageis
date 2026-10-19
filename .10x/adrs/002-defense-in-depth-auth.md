# ADR-002: Enforce auth at middleware (JWT + RBAC), device secret, and DB (RLS)

**Status:** Accepted
**Date:** 2026-10-19
**Feature:** security-quality-speed
**Author:** 10x-Team (Architect + Security)

## Context
Audit 2026-10-19: middleware only checked session cookie *name*; RBAC matrix (`authConfig.authorized`) never ran, so lower roles could open restricted sub-pages. Most `/api/devices/*` routes had no auth. 47 Supabase tables had RLS disabled (exposed via PostgREST). Owner keeps demo accounts (register / demo-setup) unchanged.

## Decision
1. Middleware wraps NextAuth `auth()` (edge, JWT): decodes the real session, applies `canAccessRoute` to pages. APIs without session pass to route handlers (they return 401 themselves).
2. Device ingest (firmware): shared `verifyDeviceSecret()` — timing-safe compare, fail closed in production when secret unset.
3. Device read/UI routes: require session (`requireScopedAuth`).
4. Enable RLS on all public tables, no policies. Prisma uses the `postgres` role (bypasses RLS); `anon`/`authenticated` PostgREST roles get nothing.

## Alternatives Considered
| Alternative | Pros | Cons | Why Not |
|---|---|---|---|
| Per-section `layout.tsx` role checks | No middleware change | Layouts don't see sub-path; easy to miss pages | Middleware covers all paths in one place |
| Disable PostgREST API in Supabase dashboard | Removes surface fully | Manual, not in code/migrations | RLS is versioned + reversible; can do both |
| HMAC-signed device payloads | Stronger than shared secret | Firmware rewrite | Later; shared secret already deployed on devices |

## Consequences
- Positive: one enforcement point for pages; DB not exposed even if anon key leaks.
- Negative: middleware now decodes JWT on every request (small edge CPU cost).
- Risks: wrong RBAC prefix → user redirected; mitigated by testing each role. Devices without secret header now get 401 in prod.
