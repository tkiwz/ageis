import { NextRequest } from "next/server";
import { auth } from "@/auth";
import { ok, fail } from "@/lib/api-response";
import { denyUnlessSiteVisible } from "@/lib/security/site-guard";
import { db } from "@/lib/db";
import { denyUnlessRole } from "@/lib/security/api-guard";
import { ROLE_GROUPS } from "@/lib/rbac";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/pipelines/leaks
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return fail("UNAUTHORIZED", "Sign in required", 401);

  try {
    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status");
    const severity = searchParams.get("severity");

    const where: any = {};
    if (status) where.status = status;
    if (severity) where.severity = severity;

    const leaks = await db.leakAlert.findMany({
      where,
      orderBy: { detectedAt: "desc" },
      include: {
        pipeline: {
          select: { id: true, code: true, name: true, length: true, productType: true },
        },
      },
    });

    const formatted = leaks.map((l) => ({
      ...l,
      affectedPoints: l.affectedPoints ? JSON.parse(l.affectedPoints) : [],
      aiAnalysis: l.aiAnalysis ? JSON.parse(l.aiAnalysis) : null,
    }));

    const total = await db.leakAlert.count();
    const active = await db.leakAlert.count({ where: { status: "ACTIVE" } });
    const critical = await db.leakAlert.count({
      where: { severity: "CRITICAL", status: "ACTIVE" },
    });
    const investigating = await db.leakAlert.count({ where: { status: "INVESTIGATING" } });

    return ok({
      leaks: formatted,
      kpis: { total, active, critical, investigating },
    });
  } catch (error: any) {
    console.error("Leaks GET error:", error);
    return fail("INTERNAL_ERROR", error.message, 500);
  }
}

// PATCH /api/pipelines/leaks
export async function PATCH(req: NextRequest) {
  const denied = await denyUnlessRole(ROLE_GROUPS.SAFETY);
  if (denied) return denied;
  const session = await auth();
  if (!session?.user) return fail("UNAUTHORIZED", "Sign in required", 401);

  try {
    const body = await req.json();
    const { id, status, resolution } = body;
    if (typeof id !== "string") return fail("VALIDATION", "id required", 400);
    const leakRow = await db.leakAlert.findUnique({ where: { id }, select: { pipelineId: true } });
    if (leakRow) {
      const hidden = await denyUnlessSiteVisible("pipeline", leakRow.pipelineId);
      if (hidden) return hidden;
    }

    const updateData: any = { status };
    if (status === "RESOLVED" || status === "FALSE_ALARM") {
      updateData.resolvedAt = new Date();
      updateData.resolvedBy = session.user?.email || "system";
      if (resolution) updateData.resolution = resolution;
    }

    const leak = await db.leakAlert.update({
      where: { id },
      data: updateData,
    });

    return ok({ leak });
  } catch (error: any) {
    console.error("Leaks PATCH error:", error);
    return fail("INTERNAL_ERROR", error.message, 500);
  }
}