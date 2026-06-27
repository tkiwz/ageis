import { NextRequest } from "next/server";
import { auth } from "@/auth";
import { ok, fail } from "@/lib/api-response";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/pipelines/[id]/readings
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return fail("UNAUTHORIZED", "Sign in required", 401);

  try {
    const { id } = await params;
    const { searchParams } = new URL(req.url);
    const hours = parseInt(searchParams.get("hours") || "24");

    const since = new Date(Date.now() - hours * 3600000);

    const points = await db.pressurePoint.findMany({
      where: { pipelineId: id },
      orderBy: { positionKm: "asc" },
      include: {
        readings: {
          where: { recordedAt: { gte: since } },
          orderBy: { recordedAt: "asc" },
        },
      },
    });

    const series = points.map((point) => ({
      pointId: point.id,
      code: point.code,
      positionKm: point.positionKm,
      readings: point.readings.map((r) => ({
        time: r.recordedAt,
        pressure: r.pressure,
        flowRate: r.flowRate,
        temperature: r.temperature,
        status: r.status,
      })),
    }));

    return ok({ series, hours });
  } catch (error: any) {
    console.error("Readings GET error:", error);
    return fail("INTERNAL_ERROR", error.message, 500);
  }
}