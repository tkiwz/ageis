# Status (2026-10-19)
## db-connection-limit — DONE (5e6dab8)
## security-quality-speed — Verification done locally, branch fix/security-quality-speed
- Next: push branch → Vercel preview check → owner approves merge to main.
- Owner TODO before/at merge: Vercel env DATABASE_URL → 6543 + pgbouncer=true&connection_limit=5&pool_timeout=20; add DIRECT_URL (5432).
Open: register/demo-setup kept (owner); migrations baseline; ESLint config; UX review of pages.
