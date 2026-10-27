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

## 🌦️ AEGIS Observatory (`/observatory`)

A public page (no sign-in): a 7-day forecast map of Oman and yellow / orange / red warnings per governorate.

> **Not an official source.** The observatory is an automated aid built on open global models. Official weather
> warnings in Oman are issued by the Oman Meteorology service of the Civil Aviation Authority; follow them first.
> Forecasts can be wrong, and a missing warning does not mean there is no risk.

| What | Source | Licence |
|---|---|---|
| Forecast (0.5° grid, 3-hour steps, 7 days) | [Open-Meteo](https://open-meteo.com) | CC BY 4.0 |
| Governorate boundaries (11) | OpenStreetMap via Nominatim | ODbL |
| Basemap and labels | Esri World Gray Canvas | Esri terms |

**Warning thresholds**, applied to the worst grid point inside each governorate, per day in Oman time
(`src/lib/observatory/warnings.ts`):

| Hazard | Yellow (be aware) | Orange (be prepared) | Red (take action) |
|---|---|---|---|
| Rain, daily total | 10 mm | 25 mm | 50 mm |
| Wind gusts | 45 km/h | 60 km/h | 80 km/h |
| Heat, air temperature | 45 °C | 48 °C | 50 °C |
| Thunderstorm (WMO 95–99) | — | thunderstorm | with hail |
| Fog (WMO 45/48) | fog | — | — |

The grid is fetched at most every 3 hours (Next data cache) and served with CDN caching, so traffic to the page
does not reach Open-Meteo.

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

