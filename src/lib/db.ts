import { PrismaClient } from "@prisma/client";
import { PrismaLibSQL } from "@prisma/adapter-libsql";
import { createClient } from "@libsql/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createPrismaClient() {
  const databaseUrl = process.env.DATABASE_URL || "";
  const authToken = process.env.DATABASE_AUTH_TOKEN;

  // إذا كان الرابط يحتوي على turso أو libsql، يستخدم السحاب
  if (databaseUrl.includes("libsql://") || databaseUrl.includes("turso")) {
    const libsql = createClient({
      url: databaseUrl.replace(/^file:/, ""), // يزيل file: إن وجدت
      authToken: authToken,
    });
    const adapter = new PrismaLibSQL(libsql);
    return new PrismaClient({
      adapter,
      log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
    });
  }

  // غير ذلك يستخدم القاعدة المحلية
  return new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });
}

export const db = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = db;
}