import { NextRequest } from "next/server";
import { auth } from "@/auth";
import { ok, fail } from "@/lib/api-response";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/pipelines/[id]/simulate
 *
 * Simulates a pressure anomaly on a pipeline by injecting
 * gradually-declining pressure readings on a target point.
 *
 * This is a LIVE DEMO feature — generates realistic leak pattern
 * over the last 90 minutes to be detected by Claude.
 *
 * Body: { targetPointCode?: string, severity?: "MEDIUM" | "HIGH" | "CRITICAL" }
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) return fail("UNAUTHORIZED", "Sign in required", 401);

  try {
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const severity = (body.severity || "HIGH") as "MEDIUM" | "HIGH" | "CRITICAL";

    // Get pipeline + pressure points
    const pipeline = await db.pipeline.findUnique({
      where: { id },
      include: { pressurePoints: { orderBy: { positionKm: "asc" } } },
    });

    if (!pipeline) return fail("NOT_FOUND", "Pipeline not found", 404);
    if (pipeline.pressurePoints.length === 0) {
      return fail("NO_POINTS", "Pipeline has no pressure points", 400);
    }

    // Pick target point — middle of pipeline by default (most realistic)
    const targetCode = body.targetPointCode;
    const targetPoint = targetCode
      ? pipeline.pressurePoints.find((p) => p.code === targetCode)
      : pipeline.pressurePoints[Math.floor(pipeline.pressurePoints.length / 2)];

    if (!targetPoint) {
      return fail("INVALID_POINT", "Target point not found", 400);
    }

    // Severity → pressure drop magnitude
    const dropMagnitude = {
      MEDIUM: 8,    // ~10% drop
      HIGH: 15,     // ~20% drop
      CRITICAL: 25, // ~35% drop
    }[severity];

    const baselinePressure = (pipeline.pressureMin + pipeline.pressureMax) / 2;
    const finalPressure = Math.max(baselinePressure - dropMagnitude, pipeline.pressureMin - 5);

    // Generate 12 readings spanning last 90 minutes
    // Pattern: starts normal → gradually drops → ends critical
    const numReadings = 12;
    const readings = [];
    const now = Date.now();

    for (let i = 0; i < numReadings; i++) {
      // Time: from 90 minutes ago to now
      const minutesAgo = (numReadings - 1 - i) * 7.5; // 90 min / 12 = 7.5 min apart
      const recordedAt = new Date(now - minutesAgo * 60 * 1000);

      // Pressure curve: stays normal for first 4 readings, then drops
      let pressure: number;
      if (i < 4) {
        // Normal range
        pressure = baselinePressure + (Math.random() - 0.5) * 2;
      } else {
        // Drop progression (sigmoid-ish)
        const dropProgress = (i - 3) / (numReadings - 3); // 0 to 1
        pressure = baselinePressure - dropMagnitude * dropProgress + (Math.random() - 0.5) * 1.5;
      }

      // Determine status
      let status = "NORMAL";
      if (pressure < pipeline.pressureMin || pressure > pipeline.pressureMax) {
        status = "CRITICAL";
      } else if (
        pressure < pipeline.pressureMin + 3 ||
        pressure > pipeline.pressureMax - 3
      ) {
        status = "WARNING";
      }

      // Slight flow rate decrease (consistent with leak physics)
      const flowDrop = i < 4 ? 0 : (i - 3) / (numReadings - 3) * 50;
      const flowRate = pipeline.flowRate
        ? pipeline.flowRate - flowDrop + (Math.random() - 0.5) * 10
        : null;

      readings.push({
        pointId: targetPoint.id,
        pressure,
        flowRate,
        temperature: 25 + Math.random() * 12,
        status,
        recordedAt,
      });
    }

    // Delete recent readings for this point (last 2 hours)
    // to avoid mixed signals
    await db.pressureReading.deleteMany({
      where: {
        pointId: targetPoint.id,
        recordedAt: { gte: new Date(now - 2 * 3600 * 1000) },
      },
    });

    // Insert new simulated readings
    await db.pressureReading.createMany({
      data: readings,
    });

    // Update the point's current state
    const lastReading = readings[readings.length - 1];
    await db.pressurePoint.update({
      where: { id: targetPoint.id },
      data: {
        currentPressure: lastReading.pressure,
        currentFlow: lastReading.flowRate,
        currentTemp: lastReading.temperature,
        status: lastReading.status,
        lastReadingAt: lastReading.recordedAt,
      },
    });

    // Log to audit
    await db.auditLog.create({
      data: {
        action: "SIMULATE_PRESSURE_ANOMALY",
        module: "PIPELINE",
        userId: session.user.id ?? null,
        actionType: "MANUAL",
        description: `Simulated pressure anomaly on ${pipeline.code} at ${targetPoint.code} (severity=${severity})`,
        metadata: JSON.stringify({
          pipelineCode: pipeline.code,
          targetPoint: targetPoint.code,
          severity,
          dropMagnitude,
          numReadings,
          actorEmail: session.user.email ?? null,
        }),
        isAutonomous: false,
      },
    }).catch(() => { /* audit log is best-effort */ });

    return ok({
      message: "Pressure anomaly simulated successfully",
      pipeline: {
        id: pipeline.id,
        code: pipeline.code,
        name: pipeline.name,
      },
      targetPoint: {
        id: targetPoint.id,
        code: targetPoint.code,
        positionKm: targetPoint.positionKm,
        latitude: targetPoint.latitude,
        longitude: targetPoint.longitude,
      },
      simulation: {
        severity,
        dropMagnitude,
        baselinePressure,
        finalPressure: lastReading.pressure,
        readingsGenerated: numReadings,
        timespan: "90 minutes",
      },
      nextStep: "Run AI analysis to detect the anomaly",
    });
  } catch (error: any) {
    console.error("Pipeline simulate error:", error);
    return fail("INTERNAL_ERROR", error.message, 500);
  }
}