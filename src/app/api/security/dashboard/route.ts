/**
 * GET /api/security/dashboard
 *
 * One-shot snapshot of everything the security dashboard needs:
 *   - Recent login attempts
 *   - Currently locked accounts
 *   - Failure stats (last 24h)
 *   - Quick env-config diagnostics
 */
import { auth } from "@/auth";
import { ok, unauthorized, forbidden } from "@/lib/api-response";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth();
  if (!session?.user) return unauthorized();
  if (!["ADMIN", "HSSE_MANAGER"].includes(session.user.role)) return forbidden();

  const now = new Date();
  const last24h = new Date(now.getTime() - 24 * 60 * 60_000);
  const last7d = new Date(now.getTime() - 7 * 24 * 60 * 60_000);

  const [
    recentAttempts,
    successCount24h,
    failCount24h,
    successCount7d,
    failCount7d,
    lockouts,
    totalAuditLogs,
    auditLogsWithHash,
    distinctIps24h,
  ] = await Promise.all([
    db.loginAttempt.findMany({ orderBy: { createdAt: "desc" }, take: 50 }),
    db.loginAttempt.count({ where: { success: true, createdAt: { gte: last24h } } }),
    db.loginAttempt.count({ where: { success: false, createdAt: { gte: last24h } } }),
    db.loginAttempt.count({ where: { success: true, createdAt: { gte: last7d } } }),
    db.loginAttempt.count({ where: { success: false, createdAt: { gte: last7d } } }),
    db.accountLockout.findMany({
      where: { OR: [{ lockedUntil: { gt: now } }, { failCount: { gt: 0 } }] },
      orderBy: { lastFailAt: "desc" },
    }),
    db.auditLog.count(),
    db.auditLog.count({ where: { hash: { not: null } } }),
    db.loginAttempt.findMany({
      where: { createdAt: { gte: last24h }, ipAddress: { not: null } },
      select: { ipAddress: true },
      distinct: ["ipAddress"],
      take: 100,
    }),
  ]);

  // Fail-by-reason breakdown (last 24h)
  const failByReason = await db.loginAttempt.groupBy({
    by: ["failReason"],
    where: { success: false, createdAt: { gte: last24h } },
    _count: { _all: true },
  });

  // Top offending IPs (last 24h)
  const topFailingIps = await db.loginAttempt.groupBy({
    by: ["ipAddress"],
    where: { success: false, createdAt: { gte: last24h }, ipAddress: { not: null } },
    _count: { _all: true },
    orderBy: { _count: { id: "desc" } },
    take: 5,
  });

  const envDiagnostics = {
    nodeEnv: process.env.NODE_ENV ?? "unknown",
    hasEncryptionKey: Boolean(process.env.ENCRYPTION_KEY),
    hasAuditChainSecret: Boolean(process.env.AUDIT_CHAIN_SECRET),
    hasCronSecret: Boolean(process.env.CRON_SECRET),
    hasMetricsToken: Boolean(process.env.METRICS_TOKEN),
    hasDeviceIngestSecret: Boolean(process.env.DEVICE_INGEST_SECRET),
    hasSentryDsn: Boolean(process.env.SENTRY_DSN),
    demoSetupDisabled: process.env.DISABLE_DEMO_SETUP === "1",
    nextauthHttpsConfigured: process.env.NEXTAUTH_URL?.startsWith("https://") ?? false,
    dbIsPostgres: process.env.DATABASE_URL?.startsWith("postgres") ?? false,
  };

  return ok({
    recentAttempts: recentAttempts.map((a) => ({
      id: a.id,
      email: a.email,
      ipAddress: a.ipAddress,
      userAgent: a.userAgent?.slice(0, 60),
      success: a.success,
      failReason: a.failReason,
      createdAt: a.createdAt.toISOString(),
    })),
    stats: {
      last24h: { success: successCount24h, failed: failCount24h },
      last7d: { success: successCount7d, failed: failCount7d },
      distinctIps24h: distinctIps24h.length,
      activeLockouts: lockouts.filter((l) => l.lockedUntil && l.lockedUntil > now).length,
      failByReason: failByReason.map((f) => ({
        reason: f.failReason ?? "UNKNOWN",
        count: f._count._all,
      })),
      topFailingIps: topFailingIps.map((t) => ({
        ip: t.ipAddress,
        count: t._count._all,
      })),
    },
    lockouts: lockouts.map((l) => ({
      id: l.id,
      email: l.email,
      failCount: l.failCount,
      lockedUntil: l.lockedUntil?.toISOString() ?? null,
      lastFailAt: l.lastFailAt?.toISOString() ?? null,
      isActive: Boolean(l.lockedUntil && l.lockedUntil > now),
    })),
    auditChain: {
      totalEntries: totalAuditLogs,
      hashedEntries: auditLogsWithHash,
      unhashedLegacy: totalAuditLogs - auditLogsWithHash,
    },
    env: envDiagnostics,
    serverTime: now.toISOString(),
  });
}
