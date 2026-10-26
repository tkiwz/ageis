/**
 * GET /api/live — one small poll for the app shell (sound alerts + bell).
 * Replaces four separate polls (alerts, wellness alerts, unread and recent
 * notifications) with one request and one auth/scope lookup.
 */
import { NextResponse } from "next/server";
import { ok } from "@/lib/api-response";
import { db } from "@/lib/db";
import { requireScopedAuth } from "@/lib/scoped-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const WELLNESS_ROLES = ["ADMIN", "HSSE_MANAGER", "SAFETY_OFFICER"];

export async function GET() {
  const scope = await requireScopedAuth();
  if (scope instanceof NextResponse) return scope;

  // Same visibility as /api/wellness/alerts: staff see their own; HSSE see their sites' workers
  let wellnessWhere: Record<string, unknown> = { acknowledged: false };
  if (!WELLNESS_ROLES.includes(scope.role)) {
    wellnessWhere = { ...wellnessWhere, userId: scope.userId };
  } else if (!scope.unrestricted && Array.isArray(scope.siteScope)) {
    const grants = await db.userSiteAccess.findMany({ where: { siteId: { in: scope.siteScope } }, select: { userId: true }, take: 500 });
    wellnessWhere = { ...wellnessWhere, userId: { in: Array.from(new Set([...grants.map((g) => g.userId), scope.userId])) } };
  }

  const [alerts, wellness, notifications, unreadCount] = await Promise.all([
    db.alert.findMany({
      where: scope.where("siteId"),
      orderBy: { createdAt: "desc" },
      take: 10,
      select: { id: true, type: true, createdAt: true },
    }),
    db.workerWellnessAlert.findMany({
      where: wellnessWhere,
      orderBy: { createdAt: "desc" },
      take: 10,
      select: { id: true, alertType: true, severity: true, createdAt: true },
    }),
    db.notification.findMany({
      where: { userId: scope.userId },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
    db.notification.count({ where: { userId: scope.userId, readAt: null } }),
  ]);

  return ok({ alerts, wellness, notifications, unreadCount, at: new Date().toISOString() });
}
