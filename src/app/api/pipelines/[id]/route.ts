import { NextRequest } from "next/server";
import { auth } from "@/auth";
import { ok, fail } from "@/lib/api-response";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/pipelines/[id]
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return fail("UNAUTHORIZED", "Sign in required", 401);

  try {
    const { id } = await params;

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
    return fail("INTERNAL_ERROR", error.message, 500);
  }
}

// PUT /api/pipelines/[id]
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return fail("UNAUTHORIZED", "Sign in required", 401);

  try {
    const { id } = await params;
    const body = await req.json();

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
    return fail("INTERNAL_ERROR", error.message, 500);
  }
}

// DELETE /api/pipelines/[id]
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return fail("UNAUTHORIZED", "Sign in required", 401);

  try {
    const { id } = await params;
    await db.pipeline.delete({ where: { id } });
    return ok({ success: true });
  } catch (error: any) {
    console.error("Pipeline DELETE error:", error);
    return fail("INTERNAL_ERROR", error.message, 500);
  }
}