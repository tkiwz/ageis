# Full audit — 2026-10-19

Scope: whole app (285 TS files, 58 pages, 97 API routes). Repo is PUBLIC on GitHub.

## Critical (security)
1. **Open ADMIN signup** — `src/app/api/auth/register/route.ts` creates any user with `role: "ADMIN"`. Public (under /api/auth). Login form calls it.
2. **Demo reset to known password** — `src/app/api/auth/demo-setup/route.ts` public POST; sets admin@aegis.local etc. password to `admin`. On unless `DISABLE_DEMO_SETUP=1` (commented out in .env).
3. **Unauthenticated device APIs** — middleware passes all `/api/devices/*`. No secret on:
   - `devices/esp/telemetry` (POST: writes readings, creates alerts, calls Claude → cost abuse)
   - `devices/pi/connect` (POST: writes)
   - `devices`, `devices/status`, `devices/[id]/detections`, `devices/esp/[id]/latest`, `devices/pi/[id]/*` (GET: data leak)
   Only `esp32/ingest`, `rpi/detect`, `/api/data`, `wellness/ingest` check DEVICE_INGEST_SECRET.

## High
4. **Page RBAC not enforced for subpages** — middleware checks cookie name only; `authConfig.authorized` (RBAC) never runs. Only 11 pages call requireRole. e.g. OPERATOR can open `/command/*`, `/governance/compliance`, `/intelligence/chat|rules|audit|ai`, `/safety/*` subpages. (APIs use requireScopedAuth → data site-scoped, but role checks per API unknown.)
5. **Build safety off** — next.config: `ignoreBuildErrors`, `ignoreDuringBuilds`. 25 TS errors (api/data, dashboard null checks, drone-map). No CI.
6. **DB dumps in public repo** — `dump.sql`, `data-inserts.sql`, `prisma/dev.db.backup-*`, `prisma/prisma/dev.db`, `auth-wal` tracked. Contain 5 bcrypt hashes + site data.

## Medium
7. Stale deps from DB moves: better-sqlite3, @libsql/client, @prisma/adapter-libsql.
8. README says SQLite; .env.example was SQLite (fixed in 5e6dab8).
9. Tests thin: 3 unit files (14 tests), 1 e2e smoke.
10. Latency: DB in Tokyo; Vercel region unknown (default iad1). ~2.5s/query from client machine.
11. Huge components: Pipeline3DScene.tsx 1391 lines; several pages 500–740 lines.
12. Default model `claude-sonnet-4-6` hardcoded fallback; cost-model table only knows older ids.

## Good
- Login: rate-limit + lockout + audit chain. JWT 1h.
- CSRF origin gate. Site-scoped API auth (requireScopedAuth). Zod validation on auth.
- Layout requireAuth validates real session.
