import { NextRequest, NextResponse } from "next/server";
import { ok } from "@/lib/api-response";
import { db } from "@/lib/db";
import { requireScopedAuth } from "@/lib/scoped-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const scope = await requireScopedAuth();
  if (scope instanceof NextResponse) return scope;

  const status = req.nextUrl.searchParams.get("status");
  const label = req.nextUrl.searchParams.get("label");
  const limit = parseInt(req.nextUrl.searchParams.get("limit") ?? "50", 10);

  const where: Record<string, unknown> = {};
  if (status) where.status = status;
  if (label) where.label = label;

  // Scope through device → site
  if (!scope.unrestricted && Array.isArray(scope.siteScope)) {
    where.device = { siteId: { in: scope.siteScope } };
  }

  const detections = await db.visionDetection.findMany({
    where,
    orderBy: { detectedAt: "desc" },
    take: limit,
    include: {
      device: { select: { code: true, name: true, type: true, siteId: true } },
    },
  });

  // KPIs
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const baseWhere = !scope.unrestricted && Array.isArray(scope.siteScope)
    ? { device: { siteId: { in: scope.siteScope } } }
    : {};
  const [todayTotal, todayViolations] = await Promise.all([
    db.visionDetection.count({ where: { ...baseWhere, detectedAt: { gte: oneDayAgo } } }),
    db.visionDetection.count({
      where: { ...baseWhere, detectedAt: { gte: oneDayAgo }, status: { in: ["WARNING", "CRITICAL"] } },
    }),
  ]);

  return ok({ detections, kpis: { todayTotal, todayViolations } });
}
