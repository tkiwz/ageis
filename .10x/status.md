# Status
Discovery Complete (2026-10-19).
## db-connection-limit — DONE (local commit, not pushed)
- ADR-001 accepted. Code + verify done.
- TODO (owner): set Vercel env DATABASE_URL (6543 + pgbouncer=true&connection_limit=5&pool_timeout=20) and DIRECT_URL (5432). Redeploy.
- Suggest: Vercel function region hnd1 (DB in ap-northeast-1).
Open risks: no CI, build errors skipped, stale README, 25 TS errors.
