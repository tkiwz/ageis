# security-quality-speed — SDE (2026-10-19)
Built (branch fix/security-quality-speed):
- middleware: NextAuth edge JWT decode + RBAC on all pages; static files skipped; /api/* left to handlers.
- auth.config: removed unused `authorized` callback; `trustHost: true` (needed for next start / Docker).
- lib/security/device-auth.ts: timing-safe secret, fail closed in prod. Used by esp32/ingest, rpi/detect, wellness/ingest, /api/data POST, esp/telemetry POST.
- Session required: devices GET/status/detections/latest, pi/*, esp32/ingest GET, rpi/detect GET, /api/data GET.
- DB: 33 FK indexes + RLS on 54 tables (prisma/sql/2026-10-19_fk_indexes_rls.sql, applied via Supabase MCP).
- TS errors 25 → 0; TS build check on; @types/leaflet; CI workflow (typecheck + vitest).
- vercel.json region hnd1; README setup; removed SQLite deps/scripts; dumps untracked.
Kept as-is (owner): register (ADMIN role) + demo-setup.
Tech debt: prisma/migrations is SQLite history (migrate broken) → baseline later. ESLint config missing. Dumps still in git history.
