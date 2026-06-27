import { NextRequest } from "next/server";
import { auth } from "@/auth";
import { ok, fail } from "@/lib/api-response";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) return fail("UNAUTHORIZED", "Sign in required", 401);

  const { id } = await ctx.params;

  const device = await db.fieldDevice.findUnique({ where: { id } });
  if (!device) return fail("NOT_FOUND", "Device not found", 404);

  const latest = await db.deviceTelemetry.findFirst({
    where: { deviceId: id },
    orderBy: { recordedAt: "desc" },
  });

  const history = await db.deviceTelemetry.findMany({
    where: { deviceId: id },
    orderBy: { recordedAt: "desc" },
    take: 20,
    select: {
      gasLevel: true,
      temperature: true,
      alertActive: true,
      recordedAt: true,
    },
  });

  return ok({
    device: {
      id: device.id,
      code: device.code,
      name: device.name,
      status: device.status,
      batteryPercent: device.batteryPercent,
      lastSeenAt: device.lastSeenAt?.toISOString() ?? null,
    },
    latest: latest ? {
      temperature:  latest.temperature,
      pressure:     latest.pressure,
      gasLevel:     latest.gasLevel,
      voltage:      latest.voltage,
      currentMa:    latest.currentMa,
      acceleration: latest.acceleration,
      alertActive:  latest.alertActive,
      recordedAt:   latest.recordedAt.toISOString(),
    } : null,
    history: history.map((h) => ({
      gasLevel:    h.gasLevel,
      temperature: h.temperature,
      alertActive: h.alertActive,
      recordedAt:  h.recordedAt.toISOString(),
    })),
  });
}