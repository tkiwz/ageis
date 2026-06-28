import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
    datasources: {
      db: {
        url: process.env.DATABASE_URL,
      },
    },
    // تحديد عدد الاتصالات لمنع انهيار السيرفرless
    __internal: {
      engine: {
        connectionLimit: 3,
      },
    } as any,
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = db;
}