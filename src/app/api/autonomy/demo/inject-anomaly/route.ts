/**
 * POST /api/autonomy/demo/inject-anomaly
 *
 * Demo-mode trigger: writes a synthetic pressure-drop sequence to a chosen
 * pipeline's pressure points, then immediately runs the autonomous analyzer.
 * Used to script the "AEGIS detected this in front of the audience" moment
 * without depending on real anomalies.
 *
 * Body: { pipelineId?: string, severity?: "minor"|"major"|"critical" }
 *
 * Restricted to ADMIN + HSSE_MANAGER.
 */
import { NextRequest } from "next/server";
import { auth } from "@/auth";
import { ok, fail, forbidden, unauthorized } from "@/lib/api-response";
import { db } from "@/lib/db";
import { analyzeAutonomously } from "@/lib/autonomy/pipeline-analyzer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return unauthorized();
  if (!["ADMIN", "HSSE_MANAGER"].includes(session.user.role)) {
    return forbidden("Only ADMIN/HSSE_MANAGER can inject demo anomalies");
  }

  let body: { pipelineId?: string; severity?: "minor" | "major" | "critical" } = {};
  try {
    body = await req.json();
  } catch { /* default values */ }

  const severity = body.severity ?? "major";

  // Pick a pipeline — explicit, else first OPERATIONAL with pressure points.
  const pipeline = body.pipelineId
    ? await db.pipeline.findUnique({
        where: { id: body.pipelineId },
        include: { pressurePoints: { orderBy: { positionKm: "asc" } } },
      })
    : await db.pipeline.findFirst({
        where: { status: "OPERATIONAL", pressurePoints: { some: {} } },
        include: { pressurePoints: { orderBy: { positionKm: "asc" } } },
      });

  if (!pipeline) return fail("NO_PIPELINE", "No pipeline available for demo", 404);
  if (pipeline.pressurePoints.length < 2) {
    return fail("INSUFFICIENT_POINTS", "Pipeline needs ≥2 pressure points", 400);
  }

  const normalPressure = (pipeline.pressureMin + pipeline.pressureMax) / 2;
  const dropMap = { minor: 6, major: 12, critical: 22 } as const;
  const dropBar = dropMap[severity];

  // Pick a leak location ~30% along the pipeline
  const leakIdx = Math.floor(pipeline.pressurePoints.length * 0.3);

  const now = Date.now();
  const readingsToCreate: Array<{
    pointId: string;
    pressure: number;
    flowRate: number;
    temperature: number;
    status: string;
    recordedAt: Date;
  }> = [];

  // Inject 4 timestamps across the last 12 minutes — first normal, last dropped.
  const stamps = [12, 8, 4, 1].map((m) => new Date(now - m * 60_000));

  for (let i = 0; i < pipeline.pressurePoints.length; i++) {
    const point = pipeline.pressurePoints[i];
    const affected = i >= leakIdx; // points downstream of leak see drop
    for (let t = 0; t < stamps.length; t++) {
      const progress = t / (stamps.length - 1); // 0 → 1
      const pressure = affected
        ? normalPressure - dropBar * progress
        : normalPressure + (Math.random() - 0.5) * 0.4;
      readingsToCreate.push({
        pointId: point.id,
        pressure: Number(pressure.toFixed(2)),
        flowRate: 100 + Math.random() * 20,
        temperature: 35 + Math.random() * 5,
        status:
          pressure < pipeline.pressureMin
            ? "CRITICAL"
            : pressure < pipeline.pressureMin + 2
              ? "WARNING"
              : "NORMAL",
        recordedAt: stamps[t],
      });
    }
  }

  await db.pressureReading.createMany({ data: readingsToCreate });

  // Audit the demo injection
  await db.auditLog.create({
    data: {
      module: "PIPELINE",
      action: "DEMO_ANOMALY_INJECTED",
      actionType: "MANUAL",
      isAutonomous: false,
      description: `Demo anomaly injected on ${pipeline.code} (severity=${severity}, drop=${dropBar} bar)`,
      metadata: JSON.stringify({ pipelineId: pipeline.id, severity, dropBar }),
      riskLevel: "MEDIUM",
      userId: session.user.id,
    },
  });

  // Run the analyzer with manualTrigger=true → bypasses kill switch (demo mode safe)
  const result = await analyzeAutonomously(pipeline.id, {
    manualTrigger: true,
    triggeredByUserId: session.user.id,
  });

  return ok({
    injected: {
      pipelineId: pipeline.id,
      code: pipeline.code,
      severity,
      dropBar,
      readingsWritten: readingsToCreate.length,
    },
    analysis: result,
  });
}
