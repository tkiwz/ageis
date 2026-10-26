import { NextRequest } from "next/server";
import { auth } from "@/auth";
import { ok, fail } from "@/lib/api-response";
import { db } from "@/lib/db";
import { denyUnlessRole } from "@/lib/security/api-guard";
import { ROLE_GROUPS } from "@/lib/rbac";
import { requireScopedAuth } from "@/lib/scoped-auth";
import { alertCreateSchema, zodMessage } from "@/lib/validations/api";
import { appendAuditLog } from "@/lib/security/audit-chain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return fail("UNAUTHORIZED", "Sign in required", 401);

  const url = new URL(req.url);
  const limit = Math.min(Math.max(parseInt(url.searchParams.get("limit") ?? "20", 10) || 20, 1), 100);

  const scope = await requireScopedAuth();
  if (scope instanceof Response) return scope;

  // ?open=1 → only unacknowledged (action queue)
  const openOnly = url.searchParams.get("open") === "1";
  const alerts = await db.alert.findMany({
    where: { ...scope.where("siteId"), ...(openOnly ? { acknowledgedAt: null } : {}) },
    orderBy: { createdAt: "desc" },
    take: limit,
    include: { site: { select: { code: true, name: true } } },
  });

  const byType = alerts.reduce((acc: Record<string, number>, a) => {
    acc[a.type] = (acc[a.type] ?? 0) + 1;
    return acc;
  }, {});

  return ok({
    alerts: alerts.map((a) => ({
      id: a.id,
      type: a.type,
      title: a.title,
      message: a.message,
      channels: a.channels,
      status: a.status,
      isAutonomous: a.isAutonomous,
      acknowledgedAt: a.acknowledgedAt?.toISOString() ?? null,
      siteId: a.siteId ?? null,
      createdAt: a.createdAt.toISOString(),
      site: a.site ?? null,
    })),
    openCount: await db.alert.count({ where: { ...scope.where("siteId"), acknowledgedAt: null } }),
    summary: {
      total: alerts.length,
      byType,
      autonomous: alerts.filter((a) => a.isAutonomous).length,
    },
  });
}

export async function POST(req: NextRequest) {
  const denied = await denyUnlessRole(ROLE_GROUPS.FIELD);
  if (denied) return denied;
  const session = await auth();
  if (!session?.user) return fail("UNAUTHORIZED", "Sign in required", 401);

  let body: {
    type: string;
    title: string;
    message: string;
    channels?: string;
    status?: string;
    isAutonomous?: boolean;
    siteId?: string;
  };

  try {
    body = await req.json();
  } catch {
    return fail("INVALID_BODY", "Invalid JSON", 400);
  }

  const parsed = alertCreateSchema.safeParse(body);
  if (!parsed.success) return fail("VALIDATION", zodMessage(parsed.error), 400);
  body = parsed.data;

  // Can't raise alerts on a site outside the caller's scope
  if (body.siteId) {
    const scope = await requireScopedAuth();
    if (scope instanceof Response) return scope;
    if (!scope.unrestricted && !scope.canSee(body.siteId)) return fail("NOT_FOUND", "Site not found", 404);
  }

  const alert = await db.alert.create({
    data: {
      type: body.type,
      title: body.title,
      message: body.message,
      channels: body.channels ?? JSON.stringify(["DASHBOARD"]),
      status: body.status ?? "ACTIVE",
      isAutonomous: body.isAutonomous ?? false,
      siteId: body.siteId ?? null,
    },
  });

  return ok(alert);
}
/** PATCH /api/alerts { id } — acknowledge an alert (inline, from any alert list). */
export async function PATCH(req: NextRequest) {
  const denied = await denyUnlessRole(ROLE_GROUPS.SUPERVISE);
  if (denied) return denied;
  const scope = await requireScopedAuth();
  if (scope instanceof Response) return scope;

  const body = (await req.json().catch(() => null)) as { id?: unknown } | null;
  if (typeof body?.id !== "string") return fail("VALIDATION", "id required", 400);

  const alert = await db.alert.findUnique({ where: { id: body.id }, select: { id: true, siteId: true, title: true, acknowledgedAt: true } });
  if (!alert || (!scope.unrestricted && !scope.canSee(alert.siteId))) return fail("NOT_FOUND", "Alert not found", 404);
  if (alert.acknowledgedAt) return ok({ id: alert.id, acknowledgedAt: alert.acknowledgedAt.toISOString() });

  const updated = await db.alert.update({
    where: { id: alert.id },
    data: { acknowledgedAt: new Date(), status: "ACKNOWLEDGED" },
  });
  appendAuditLog({
    module: "ALERTS",
    action: "ACKNOWLEDGE",
    actionType: "MANUAL",
    description: `Alert acknowledged: ${alert.title}`,
    userId: scope.userId,
    siteId: alert.siteId ?? undefined,
  }).catch(() => {});
  return ok({ id: updated.id, acknowledgedAt: updated.acknowledgedAt?.toISOString() ?? null });
}
