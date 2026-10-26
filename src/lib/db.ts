import { PrismaClient } from "@prisma/client";

// Pool size is set in DATABASE_URL (connection_limit=5, pgbouncer=true,
// Supabase transaction pooler port 6543). See .10x/adrs/001.
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

/**
 * The transaction pooler (port 6543) cannot keep prepared statements between
 * requests; without pgbouncer=true every query fails with
 * "prepared statement sN already exists / does not exist". Add the flag (and a
 * sane pool) when the URL forgot them.
 */
function poolerSafeUrl(raw: string | undefined): string | undefined {
  if (!raw) return raw;
  try {
    const u = new URL(raw);
    if (u.port === "6543") {
      if (!u.searchParams.has("pgbouncer")) u.searchParams.set("pgbouncer", "true");
      if (!u.searchParams.has("connection_limit")) u.searchParams.set("connection_limit", "5");
      if (!u.searchParams.has("pool_timeout")) u.searchParams.set("pool_timeout", "20");
    }
    return u.toString();
  } catch {
    return raw;
  }
}

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    datasourceUrl: poolerSafeUrl(process.env.DATABASE_URL),
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

// Reuse one client per warm lambda / dev hot reload.
globalForPrisma.prisma = db;
