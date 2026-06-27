import { NextRequest, NextResponse } from "next/server";
import { ok } from "@/lib/api-response";
import { db } from "@/lib/db";
import { requireScopedAuth } from "@/lib/scoped-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const scope = await requireScopedAuth();
  if (scope instanceof NextResponse) return scope;

  const status = req.nextUrl.searchParams.get("status"); // "OPEN" | "ACKED"
  const where: Record<string, unknown> = {};
  if (status === "OPEN") where.acknowledged = false;
  if (status === "ACKED") where.acknowledged = true;

  // Non-managers see only their own alerts.
  // Managers see alerts for workers in their accessible sites.
  // WorkerWellnessAlert doesn't store siteId directly — we resolve via the
  // worker's UserSiteAccess grants OR via current reading site (future).
  // For now: non-managers self-only; managers see everything in their scope
  // by joining through worker → permitted sites.
  if (!["ADMIN", "HSSE_MANAGER", "SAFETY_OFFICER"].includes(scope.role)) {
    where.userId = scope.userId;
  } else if (!scope.unrestricted && Array.isArray(scope.siteScope)) {
    // Find users whose UserSiteAccess intersects this manager's scope.
    const grants = await db.userSiteAccess.findMany({
      where: { siteId: { in: scope.siteScope } },
      select: { userId: true },
    });
    const allowedUserIds: string[] = grants.map((g: { userId: string }) => g.userId);
    // Always include the manager themselves
    allowedUserIds.push(scope.userId);
    where.userId = { in: Array.from(new Set(allowedUserIds)) };
  }

  const alerts = await db.workerWellnessAlert.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  const userIds = Array.from(new Set(alerts.map((a) => a.userId)));
  const users = await db.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, name: true, email: true, role: true },
  });
  const userMap = Object.fromEntries(users.map((u) => [u.id, u]));

  return ok({
    alerts: alerts.map((a) => ({ ...a, worker: userMap[a.userId] ?? null })),
  });
}

export async function PATCH(req: NextRequest) {
  const scope = await requireScopedAuth();
  if (scope instanceof NextResponse) return scope;
  let body: { id?: string; action?: "ack" | "resolve" };
  try { body = await req.json(); } catch { return ok({ ok: false }); }
  if (!body.id) return ok({ ok: false });

  // Cannot ack alerts for workers outside your scope (security check).
  const existing = await db.workerWellnessAlert.findUnique({
    where: { id: body.id },
    select: { userId: true },
  });
  if (!existing) return ok({ ok: false });

  if (existing.userId !== scope.userId &&
      !["ADMIN", "HSSE_MANAGER", "SAFETY_OFFICER"].includes(scope.role)) {
    return ok({ ok: false });
  }

  if (body.action === "resolve") {
    await db.workerWellnessAlert.update({
      where: { id: body.id },
      data: { resolvedAt: new Date(), acknowledged: true, acknowledgedAt: new Date() },
    });
  } else {
    await db.workerWellnessAlert.update({
      where: { id: body.id },
      data: { acknowledged: true, acknowledgedAt: new Date() },
    });
  }
  return ok({ ok: true });
}
