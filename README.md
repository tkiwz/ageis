# 🛡️ AEGIS — HSSE Command Platform

**Autonomous Environment Guard & Intelligence System**

A real-time HSSE (Health, Safety, Security, Environment) command platform for industrial operations — built for oil & gas, refineries, and heavy industry sites.



## 🏗️ Architecture

```
┌─────────────────────────────────────────────┐
│         Next.js 15 (Single App)             │
│                                             │
│  ┌─────────────────────────────────────┐    │
│  │  6 Modules                          │    │
│  │  ├─ /command     (real-time ops)    │    │
│  │  ├─ /operations  (day-to-day work)  │    │
│  │  ├─ /safety      (incidents, obs)   │    │
│  │  ├─ /governance  (compliance)       │    │
│  │  ├─ /intelligence(AI + rules)       │    │
│  │  └─ /admin       (settings)         │    │
│  └─────────────────────────────────────┘    │
│                                             │
│  ┌─────────────────────────────────────┐    │
│  │  RBAC Middleware (6 roles)          │    │
│  └─────────────────────────────────────┘    │
│                                             │
│  ┌─────────────────────────────────────┐    │
│  │  API Routes (Prisma)                │    │
│  │  + /api/events (SSE realtime)       │    │
│  │  + /api/ai     (Claude integration) │    │
│  └─────────────────────────────────────┘    │
└─────────────────────────────────────────────┘
              ↓
       ┌──────────────────────┐
       │ PostgreSQL (Supabase)│
       │ + Prisma             │
       └──────────────────────┘
```



## 🚀 Setup

```bash
cp .env.example .env   # fill DATABASE_URL, DIRECT_URL, NEXTAUTH_SECRET, ANTHROPIC_API_KEY
npm install
npx prisma generate
npm run db:seed        # demo data + demo accounts
npm run dev            # http://localhost:3000
```

- **Database:** Supabase Postgres. Runtime uses the transaction pooler (port 6543, `pgbouncer=true`); `DIRECT_URL` (port 5432) is for Prisma CLI.
- **Schema changes:** edit `prisma/schema.prisma`, then add the SQL to `prisma/sql/` and apply it (the old `prisma/migrations` folder is SQLite-era history).
- **Hosting:** Vercel, region `hnd1` (Tokyo, same as the DB). Push to `main` = production deploy.
- **Devices:** ESP32 / Raspberry Pi send `x-device-secret` (or `X-Device-Key`) = `DEVICE_INGEST_SECRET`.
- **Checks:** `npm run typecheck` and `npx vitest run` (also run in GitHub Actions).

