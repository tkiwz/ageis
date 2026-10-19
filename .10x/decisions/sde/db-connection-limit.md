# db-connection-limit — SDE
Built (2026-10-19):
- src/lib/db.ts: removed fake `__internal.engine.connectionLimit`; cache client on globalThis in all envs.
- prisma/schema.prisma: `directUrl = env("DIRECT_URL")`.
- .env.example: Supabase 6543 runtime URL + DIRECT_URL.
- Local .env updated (not committed).
Deviation: connection_limit 5 (not 1) + pool_timeout=20 — dashboard runs parallel queries; limit 1 timed out.
Verified: prisma validate ok; 20 parallel queries ok via 6543.
Tech debt: 25 pre-existing TS errors; query latency ~2.5s from local to Tokyo DB — Vercel region should be hnd1.
