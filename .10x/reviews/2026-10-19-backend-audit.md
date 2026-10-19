# Backend audit — 2026-10-19

Scope: 97 API routes (9.5k lines) + src/lib. After commit e0bc445 (all routes need session or device secret).

## 🔴 High
1. **No role checks on 55 / 83 write handlers.** Any logged-in user (incl. CONTRACTOR) can:
   - create / edit / **delete pipelines** — `pipelines` POST, `pipelines/[id]` PUT+DELETE, `pipelines/leaks` PATCH
   - send WhatsApp to the alert phone with any text — `notify/whatsapp`
   - trigger alerts — `alerts` POST, `sensors/alert-trigger`
   - create/clear simulation data — all `*/simulate` (deletes limited to `[SIM]` rows)
   - edit investigations / risk assessments / tasks (PATCH, DELETE)
2. **No site isolation (IDOR) on most `[id]` routes.** Only permits/investigations check `canSee`. A site-restricted user can read/edit by id: incidents, pipelines, sites, AI analyze routes, brain sessions, knowledge contributions.
3. **No AI cost limits.** 17 AI routes, 0 rate limit / per-user budget. `ai/generate-video` (Veo) is open to every role. `rate-limit.ts` helper exists but unused.

## 🟠 Medium
4. **Input not validated** in 35 routes (raw `body.x` → Prisma). Bad types → 500; mass-assignment risk where body spread into data.
5. **Error leaks:** 23 places return `error.message` to client (Prisma / internal details).
6. **SSRF:** `devices/pi/connect` + `pi/[id]/stream|poll` make the server fetch any `ipAddress:port` from user input.
7. **Heartbeat load:** every open tab POSTs `autonomy/pipeline/tick` every ~27s → full pipeline scan each time (cooldown only stops repeat AI calls). Slows DB + site.
8. **Unbounded queries:** 32 `findMany` without `take`; `?limit=` unbounded in `permits`, `intelligence/audit`, `vision-detections`.

## 🟡 Low
9. N+1 loops — mostly in simulate/demo routes + `knowledge/conflict-detector`.
10. Vercel env `NODE_ENV=development` (warning on every request).
11. `prisma/migrations` is SQLite history — `migrate` unusable.

## Good
- Every route now needs session or device secret. Login lockout + audit chain. Upload has 10 MB limit. Permits / investigations scope by site correctly — use as the pattern.

## Proposed fix order
A. Shared `requireRole()` for API + role matrix per route (1).
B. `scope.canSee(siteId)` in all `[id]` routes (2).
C. Per-user AI rate limit + block video for low roles (3).
D. One server-side tick (Vercel Cron) instead of per-tab heartbeat (7) — also faster site.
E. Zod on writes, generic 500 messages, `take` caps, Pi IP allowlist (4,5,6,8).
