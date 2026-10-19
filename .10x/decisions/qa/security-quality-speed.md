# security-quality-speed — QA (2026-10-19)
Local prod build (next start) + curl:
- No cookie / fake cookie → 307 /login. Device APIs no session → 401. Ingest wrong secret → 401.
- OPERATOR: /dashboard, /operations 200; /command, /intelligence, /safety, /admin → denied.
- ADMIN: all 200. DB reads OK after RLS (Prisma = postgres BYPASSRLS).
- tsc 0 errors; vitest 14/14; next build OK.
Not tested: real ESP32/RPi with secret header; Vercel preview (pending push).
