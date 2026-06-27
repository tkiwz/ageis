/**
 * POST /api/wellness/ingest
 * Endpoint for ESP32 wearables to push a wellness reading.
 *
 * Auth: x-device-secret header against env DEVICE_INGEST_SECRET, OR a logged-in session.
 * Body:
 *   {
 *     userId: string,
 *     deviceId?: string,
 *     heartRate?, hrVariability?, bodyTemperature?, ambientTemp?, humidity?,
 *     h2sPpm?, coPpm?, o2Level?, stepsCount?, fallDetected?, intervalSeconds?
 *   }
 */
import { NextRequest } from "next/server";
import { ok, fail } from "@/lib/api-response";
import { ingestWellnessReading } from "@/lib/wellness/analyzer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const deviceSecret = req.headers.get("x-device-secret");
  const expected = process.env.DEVICE_INGEST_SECRET;
  let authorized = Boolean(expected && deviceSecret === expected);

  if (!authorized) {
    const { auth } = await import("@/auth");
    const session = await auth();
    authorized = Boolean(session?.user);
  }
  if (!authorized) return fail("UNAUTHORIZED", "Provide x-device-secret or sign in", 401);

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return fail("INVALID_BODY", "Invalid JSON", 400); }

  if (!body.userId || typeof body.userId !== "string") {
    return fail("MISSING_USER", "userId required", 400);
  }

  const outcome = await ingestWellnessReading({
    userId: body.userId,
    deviceId: typeof body.deviceId === "string" ? body.deviceId : undefined,
    heartRate: typeof body.heartRate === "number" ? body.heartRate : undefined,
    hrVariability: typeof body.hrVariability === "number" ? body.hrVariability : undefined,
    bodyTemperature: typeof body.bodyTemperature === "number" ? body.bodyTemperature : undefined,
    ambientTemp: typeof body.ambientTemp === "number" ? body.ambientTemp : undefined,
    humidity: typeof body.humidity === "number" ? body.humidity : undefined,
    h2sPpm: typeof body.h2sPpm === "number" ? body.h2sPpm : undefined,
    coPpm: typeof body.coPpm === "number" ? body.coPpm : undefined,
    o2Level: typeof body.o2Level === "number" ? body.o2Level : undefined,
    stepsCount: typeof body.stepsCount === "number" ? body.stepsCount : undefined,
    fallDetected: body.fallDetected === true,
    intervalSeconds: typeof body.intervalSeconds === "number" ? body.intervalSeconds : 60,
  });

  return ok(outcome);
}
