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
| Forecast grid, wilayat forecasts (0.5° grid, 3-hour steps, 7 days) | [Open-Meteo](https://open-meteo.com) | CC BY 4.0 |
| Rain blend: ECMWF IFS, ECMWF AIFS, UK Met Office, DWD ICON, NOAA GFS | via Open-Meteo | CC BY 4.0 |
| Rain probability (51 scenarios) | ECMWF ensemble via Open-Meteo | CC BY 4.0 |
| Dust (5 days) | CAMS (Copernicus) via Open-Meteo | CC BY 4.0 |
| Model calibration — measured readings at Muscat, Salalah, Sohar, Duqm, Khasab, Adam | METAR, [aviationweather.gov](https://aviationweather.gov) (NOAA) | US public domain |
| Previous model runs (for calibration) | Open-Meteo Previous Runs API | CC BY 4.0 |
| Live satellite (true colour, dust, storms, infrared) and storms forming | Meteosat IODC, [EUMETSAT](https://view.eumetsat.int) | EUMETSAT data policy |
| Active cyclones (track, cone, wind zones) | [GDACS](https://www.gdacs.org) (EC JRC), tracks from JTWC | GDACS terms |
| Cyclone memory since 1977 | IBTrACS v04 (NOAA NCEI) | public domain |
| Wilayat forecasts (primary, hourly, ~9 days) | [MET Norway](https://api.met.no) Locationforecast 2.0 | CC BY 4.0 (commercial use allowed) |
| Wave height (7 days) | NOAA WaveWatch III via PacIOOS ERDDAP | US public domain |
| Earthquakes (30 days, M2.5+) | [USGS](https://earthquake.usgs.gov) real-time catalogue | US public domain |
| Wadis (186 named courses) and road crossings / fords (3,228) | OpenStreetMap via Overpass | ODbL |
| History: rain and gusts recorded at past events | ERA5 reanalysis (Copernicus / ECMWF) via Open-Meteo archive, fetched once | CC BY 4.0 |
| Global live clouds outside Meteosat's view | NASA GIBS (GOES-East/West, Himawari) | NASA open data |
| Governorates (11) and wilayats (63) | OpenStreetMap via Nominatim / Overpass | ODbL |
| Basemap: imagery, hillshade, places; calm grey | Esri World Imagery / Hillshade / Gray Canvas | Esri terms |

The public page shows its own interface only; the sources above are credited here. The map corner keeps the
short "© OpenStreetMap · Esri" line, which those tile licences require. CC BY 4.0 and the EUMETSAT and GDACS
terms also ask for credit wherever the data is shown, so check with them before using the observatory commercially.

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

