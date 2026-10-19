# aegis-platform — Architect [DISCOVERED]
- Single Next.js app. Modules: command, operations, safety, governance, intelligence, admin.
- RBAC middleware (src/middleware.ts, src/lib/rbac.ts).
- ~37 API route groups under src/app/api. SSE realtime (/api/events), AI (/api/ai).
- Device side: AEGIS_ESP32/, arduino/ firmware; device ingest via secret.
