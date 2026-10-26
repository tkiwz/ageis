import { NextRequest } from "next/server";
import { auth } from "@/auth";
import { ok, fail } from "@/lib/api-response";
import { db } from "@/lib/db";
import { denyUnlessRole } from "@/lib/security/api-guard";
import { ROLE_GROUPS } from "@/lib/rbac";
import { denyUnlessSiteVisible } from "@/lib/security/site-guard";
import { pipelineUpdateSchema, zodMessage } from "@/lib/validations/api";
import { syncSimulatedPipelines } from "@/lib/simulation/pipeline-sim";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/pipelines/[id]
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return fail("UNAUTHORIZED", "Sign in required", 401);

  try {
    const { id } = await params;
    const hidden = await denyUnlessSiteVisible("pipeline", id);
    if (hidden) return hidden;
    // Simulated lines get their readings brought up to date on read (at most once a minute)
    await syncSimulatedPipelines().catch((e) => console.error("[pipeline-sim]", e?.message));

    const pipeline = await db.pipeline.findUnique({
      where: { id },
      include: {
        pressurePoints: { orderBy: { positionKm: "asc" } },
        leakAlerts: { orderBy: { detectedAt: "desc" }, take: 10 },
      },
    });

    if (!pipeline) return fail("NOT_FOUND", "Pipeline not found", 404);

    const activeLeaks = pipeline.leakAlerts.filter((l) => l.status === "ACTIVE").length;
    const criticalPoints = pipeline.pressurePoints.filter((p) => p.status === "CRITICAL").length;
    const warningPoints = pipeline.pressurePoints.filter((p) => p.status === "WARNING").length;

    return ok({
      pipeline,
      stats: {
        activeLeaks,
        criticalPoints,
        warningPoints,
        totalPoints: pipeline.pressurePoints.length,
      },
    });
  } catch (error: any) {
    console.error("Pipeline GET error:", error);
    return fail("INTERNAL_ERROR", "Internal server error", 500);
  }
}

// PUT /api/pipelines/[id]
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await denyUnlessRole(ROLE_GROUPS.SAFETY);
  if (denied) return denied;
  const session = await auth();
  if (!session?.user) return fail("UNAUTHORIZED", "Sign in required", 401);

  try {
    const { id } = await params;
    const hidden = await denyUnlessSiteVisible("pipeline", id);
    if (hidden) return hidden;
    const parsed = pipelineUpdateSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return fail("VALIDATION", zodMessage(parsed.error), 400);
    const body = parsed.data;

    const pipeline = await db.pipeline.update({
      where: { id },
      data: {
        name: body.name,
        nameAr: body.nameAr,
        status: body.status,
        notes: body.notes,
        lastInspection: body.lastInspection ? new Date(body.lastInspection) : undefined,
      },
    });

    return ok({ pipeline });
  } catch (error: any) {
    console.error("Pipeline PUT error:", error);
    return fail("INTERNAL_ERROR", "Internal server error", 500);
  }
}

// DELETE /api/pipelines/[id]
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await denyUnlessRole(ROLE_GROUPS.MANAGE);
  if (denied) return denied;
  const session = await auth();
  if (!session?.user) return fail("UNAUTHORIZED", "Sign in required", 401);

  try {
    const { id } = await params;
    const hidden = await denyUnlessSiteVisible("pipeline", id);
    if (hidden) return hidden;
    await db.pipeline.delete({ where: { id } });
    return ok({ success: true });
  } catch (error: any) {
    console.error("Pipeline DELETE error:", error);
    return fail("INTERNAL_ERROR", "Internal server error", 500);
  }
}