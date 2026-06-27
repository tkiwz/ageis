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
       ┌────────────┐
       │ SQLite +   │
       │ Prisma     │
       └────────────┘
```



Thank you
