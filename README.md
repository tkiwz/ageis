# 🛡️ AEGIS — HSSE Command Platform

**Autonomous Environment Guard & Intelligence System**

A real-time HSSE (Health, Safety, Security, Environment) command platform for industrial operations — built for oil & gas, refineries, and heavy industry sites.

---

## 📦 Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 15 (App Router) + React 19 |
| Language | TypeScript (strict) |
| Database | Prisma ORM + SQLite (dev) / PostgreSQL (prod) |
| Styling | Tailwind CSS v3 + shadcn/ui (new-york) |
| State | Zustand + TanStack Query |
| Auth | NextAuth v5 (credentials + JWT) |
| AI | Anthropic Claude API (`claude-sonnet-4-6`) |
| Realtime | Server-Sent Events (SSE) |
| Package Manager | Bun |

---

## 🚀 Quick Start

```bash
# 1. Install dependencies
bun install

# 2. Copy environment template
cp .env.example .env

# 3. Edit .env and set:
#    - NEXTAUTH_SECRET (generate via: openssl rand -base64 32)
#    - ANTHROPIC_API_KEY (from https://console.anthropic.com)

# 4. Setup database
bun run db:push      # Push schema to SQLite
bun run db:seed      # Seed initial data (Phase 8)

# 5. Run dev server
bun run dev

# Open http://localhost:3000
```

---

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

---

## 📋 Build Phases

- [x] **Phase 1** — Foundation (configs, schema, theme, layout)
- [ ] **Phase 2** — Auth + RBAC + Login
- [ ] **Phase 3** — Core UI Shell (sidebar, header, layouts)
- [ ] **Phase 4** — Command Center (dashboard, map, emergencies, SSE)
- [ ] **Phase 5** — Operations (sites, permits, IoT, tasks)
- [ ] **Phase 6** — Safety (incidents, observations, risk, investigations, PPE)
- [ ] **Phase 7** — Governance + Intelligence (compliance, AI, rules)
- [ ] **Phase 8** — Admin + Seed data + Final polish

---

## 🎯 Roles (RBAC)

| Role | Access |
|---|---|
| `ADMIN` | Full system access |
| `HSSE_MANAGER` | Command + Safety + Governance + Intelligence |
| `SAFETY_OFFICER` | Safety + Observations + Permits |
| `SUPERVISOR` | Operations + Safety (read) |
| `OPERATOR` | Tasks + Observations (own only) |
| `CONTRACTOR` | Own permits only |

---

## 🌐 Localization

- **UI**: English (primary)
- **Subtitles & labels**: Arabic for Gulf region context
- Role names, production types, and site names support both languages

---

## 📜 License

Internal prototype. Not for external distribution.

---

**Built with ❤️ for industrial safety.**