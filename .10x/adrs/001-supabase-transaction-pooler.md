# ADR-001: Use Supabase transaction pooler for runtime DB access

**Status:** Accepted
**Date:** 2026-10-19
**Feature:** db-connection-limit
**Author:** 10x-Team (Architect + DBA)

## Context
App runs on Vercel serverless. DATABASE_URL pointed at Supabase pooler port 5432 (session mode): each lambda holds a dedicated Postgres connection, so concurrent lambdas exhaust the pool ("max clients reached"). Commit cc4ca66 tried `__internal.engine.connectionLimit`, which Prisma does not support — no effect.

## Decision
- Runtime `DATABASE_URL`: pooler port 6543 (transaction mode) + `pgbouncer=true&connection_limit=5`.
- `DIRECT_URL`: port 5432, used by Prisma CLI for migrations (`directUrl` in schema).
- Remove fake `__internal` option; cache client on globalThis in all envs.

## Alternatives Considered
| Alternative | Pros | Cons | Why Not |
|---|---|---|---|
| Keep 5432 + `connection_limit=5` | One-line change | Session mode still 1 conn per lambda; fails under load | Does not scale |
| Prisma Accelerate | Managed pooling, caching | New paid service, new client ext | Overkill now |
| Driver adapter (`@prisma/adapter-pg`) | Fine control | More code change | Not needed |

## Consequences
### Positive
- Connections shared across lambdas; no pool exhaustion.
### Negative
- Transaction mode: no prepared statements (handled by `pgbouncer=true`), no session features (LISTEN/NOTIFY, advisory locks across queries).
### Risks
- Vercel env must be updated manually by owner. Migrations need DIRECT_URL set.
