/**
 * GET /api/metrics — Prometheus-style text metrics.
 *
 * Exposes:
 *   - aegis_uptime_seconds
 *   - aegis_incidents_total{severity}
 *   - aegis_active_leaks_total
 *   - aegis_active_emergencies_total
 *   - aegis_ai_cost_micro_usd_today
 *   - aegis_ai_calls_last_hour
 *   - aegis_wellness_alerts_open
 *   - aegis_notifications_unread
 *   - aegis_cache_hits / aegis_cache_misses
 *
 * Auth: bearer token (METRICS_TOKEN) — set in prod, or session-based.
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { allCacheStats } from "@/lib/observability/cache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bootTime = Date.now();

export async function GET(req: NextRequest) {
  // Bearer token auth for scraper, OR an authenticated user.
  const token = process.env.METRICS_TOKEN;
  const auth = req.headers.get("authorization");
  const tokenOk = token && auth === `Bearer ${token}`;

  if (!tokenOk) {
    const { auth: getAuth } = await import("@/auth");
    const session = await getAuth();
    if (!session?.user) {
      return new NextResponse("unauthorized", { status: 401 });
    }
  }

  const startOfDay = new Date(); startOfDay.setHours(0, 0, 0, 0);
  const oneHourAgo = new Date(Date.now() - 3_600_000);

  const [
    incidentBySev,
    activeLeaks,
    activeEmergencies,
    aiCostTodayAgg,
    aiCallsLastHour,
    openWellness,
    unreadNotif,
  ] = await Promise.all([
    db.incident.groupBy({
      by: ["severity"],
      _count: { _all: true },
      where: { status: { in: ["REPORTED", "INVESTIGATING"] } },
    }),
    db.leakAlert.count({ where: { status: "ACTIVE" } }),
    db.emergencyEvent.count({ where: { status: "ACTIVE" } }),
    db.aICostLedger.aggregate({
      where: { createdAt: { gte: startOfDay } },
      _sum: { costMicroUsd: true },
    }),
    db.aICostLedger.count({ where: { createdAt: { gte: oneHourAgo } } }),
    db.workerWellnessAlert.count({ where: { acknowledged: false } }),
    db.notification.count({ where: { readAt: null } }),
  ]);

  const lines: string[] = [];
  lines.push(`# HELP aegis_uptime_seconds Process uptime`);
  lines.push(`# TYPE aegis_uptime_seconds gauge`);
  lines.push(`aegis_uptime_seconds ${Math.round((Date.now() - bootTime) / 1000)}`);

  lines.push(`# HELP aegis_incidents_total Active incidents by severity`);
  lines.push(`# TYPE aegis_incidents_total gauge`);
  for (const sev of ["LOW", "MEDIUM", "HIGH", "CRITICAL"]) {
    const found = incidentBySev.find((b) => b.severity === sev);
    lines.push(`aegis_incidents_total{severity="${sev}"} ${found?._count._all ?? 0}`);
  }

  lines.push(`# TYPE aegis_active_leaks_total gauge`);
  lines.push(`aegis_active_leaks_total ${activeLeaks}`);

  lines.push(`# TYPE aegis_active_emergencies_total gauge`);
  lines.push(`aegis_active_emergencies_total ${activeEmergencies}`);

  lines.push(`# HELP aegis_ai_cost_micro_usd_today Sum of AI cost in micro-USD today`);
  lines.push(`# TYPE aegis_ai_cost_micro_usd_today counter`);
  lines.push(`aegis_ai_cost_micro_usd_today ${aiCostTodayAgg._sum.costMicroUsd ?? 0}`);

  lines.push(`# TYPE aegis_ai_calls_last_hour gauge`);
  lines.push(`aegis_ai_calls_last_hour ${aiCallsLastHour}`);

  lines.push(`# TYPE aegis_wellness_alerts_open gauge`);
  lines.push(`aegis_wellness_alerts_open ${openWellness}`);

  lines.push(`# TYPE aegis_notifications_unread gauge`);
  lines.push(`aegis_notifications_unread ${unreadNotif}`);

  const cacheStats = allCacheStats();
  for (const c of cacheStats) {
    lines.push(`aegis_cache_hits{cache="${c.name}"} ${c.hits}`);
    lines.push(`aegis_cache_misses{cache="${c.name}"} ${c.misses}`);
    lines.push(`aegis_cache_size{cache="${c.name}"} ${c.size}`);
  }

  return new NextResponse(lines.join("\n") + "\n", {
    status: 200,
    headers: { "Content-Type": "text/plain; version=0.0.4" },
  });
}
