# aegis-platform — DBA [DISCOVERED]
- PostgreSQL via Prisma. 54 models. Migrations up to 20260609 (vehicle_reading).
- History: SQLite -> Turso/libsql -> Postgres. Leftover deps: better-sqlite3, @libsql/client, adapter-libsql.
- RISK: src/lib/db.ts sets `__internal.engine.connectionLimit` — not a real Prisma option; likely no effect. Real fix: `?connection_limit=N` in DATABASE_URL (or pooler like pgbouncer / Prisma Accelerate).
- Loose files in repo root: dump.sql, data-inserts.sql, schema.sql, prisma/dev.db.
