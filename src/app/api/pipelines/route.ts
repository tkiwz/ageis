import { NextRequest } from "next/server";
import { auth } from "@/auth";
import { ok, fail } from "@/lib/api-response";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/pipelines — List all pipelines + KPIs
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return fail("UNAUTHORIZED", "Sign in required", 401);

  try {
    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status");
    const productType = searchParams.get("productType");

    const where: any = {};
    if (status) where.status = status;
    if (productType) where.productType = productType;

    const pipelines = await db.pipeline.findMany({
      where,
      orderBy: { code: "asc" },
      include: {
        _count: {
          select: {
            pressurePoints: true,
            leakAlerts: { where: { status: "ACTIVE" } },
          },
        },
      },
    });

    const total = await db.pipeline.count();
    const operational = await db.pipeline.count({ where: { status: "OPERATIONAL" } });
    const totalLength = await db.pipeline.aggregate({ _sum: { length: true } });
    const activeLeaks = await db.leakAlert.count({ where: { status: "ACTIVE" } });
    const criticalPoints = await db.pressurePoint.count({ where: { status: "CRITICAL" } });
    const warningPoints = await db.pressurePoint.count({ where: { status: "WARNING" } });

    return ok({
      pipelines,
      kpis: {
        total,
        operational,
        totalLength: totalLength._sum.length || 0,
        activeLeaks,
        criticalPoints,
        warningPoints,
      },
    });
  } catch (error: any) {
    console.error("Pipelines GET error:", error);
    return fail("INTERNAL_ERROR", error.message, 500);
  }
}

// POST /api/pipelines — Create new pipeline
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return fail("UNAUTHORIZED", "Sign in required", 401);

  try {
    const body = await req.json();

    const pipeline = await db.pipeline.create({
      data: {
        code: body.code,
        name: body.name,
        nameAr: body.nameAr || null,
        length: body.length,
        diameter: body.diameter,
        material: body.material,
        status: body.status || "OPERATIONAL",
        productType: body.productType,
        pressureMin: body.pressureMin,
        pressureMax: body.pressureMax,
        flowRate: body.flowRate || null,
        startSiteId: body.startSiteId || null,
        endSiteId: body.endSiteId || null,
        startLat: body.startLat,
        startLng: body.startLng,
        endLat: body.endLat,
        endLng: body.endLng,
        midPoints: body.midPoints || null,
        installedAt: new Date(body.installedAt),
        notes: body.notes || null,
      },
    });

    return ok({ pipeline });
  } catch (error: any) {
    console.error("Pipeline POST error:", error);
    return fail("INTERNAL_ERROR", error.message, 500);
  }
}