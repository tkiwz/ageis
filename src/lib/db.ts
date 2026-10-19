import { PrismaClient } from "@prisma/client";

// Pool size is set in DATABASE_URL (connection_limit=5, pgbouncer=true,
// Supabase transaction pooler port 6543). See .10x/adrs/001.
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

// Reuse one client per warm lambda / dev hot reload.
globalForPrisma.prisma = db;
