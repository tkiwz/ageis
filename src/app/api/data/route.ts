// ============================================================
//  /api/data — ESP32 Vehicle Monitor ingest endpoint
//
//  POST: receives JSON from vehicle ESP32, stores VehicleReading.
//        On CRASH:          auto-creates an Incident.
//        On gas>50 or t≥40: auto-creates an Alert.
//        On every write:    prunes readings older than 7 days
//                           (CRASH events kept for 30 days).
//
//  GET:  returns last readings for the dashboard.
//
//  Auth: X-Device-Key header must match DEVICE_INGEST_SECRET env var.
//        If env var is empty, auth is disabled (development only).
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { verifyDeviceSecret } from "@/lib/security/device-auth";
import { requireScopedAuth } from "@/lib/scoped-auth";
import { nextIncidentNumber } from "@/lib/incidents/number";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ─────────────────────────────────────────────────────────────
//  Helpers
// ─────────────────────────────────────────────────────────────

type Num = number | string;
interface VehiclePayload {
  deviceCode?: string;
  siteCode?: string | null;
  eventType?: string;
  gas_val?: Num;
  temperature?: Num;
  pressure?: Num;
  acceleration?: Num;
  voltage?: Num;
  current_mA?: Num;
  power_mW?: Num;
  uptime_s?: Num;
}

function checkDeviceKey(req: NextRequest): boolean {
  return verifyDeviceSecret(req);
}



// ─────────────────────────────────────────────────────────────
//  POST — ingest a reading from the vehicle ESP32
// ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  if (!checkDeviceKey(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    let body: VehiclePayload = {};
    try {
      const text = await req.text();
      if (text.trim()) body = JSON.parse(text);
    } catch { /* empty or non-JSON body — use defaults */ }

    const {
      deviceCode   = "VEH-001",
      siteCode     = null,
      eventType    = "NORMAL",
      gas_val      = 0,
      temperature  = 0,
      pressure     = 0,
      acceleration = 0,
      voltage      = 0,
      current_mA   = 0,
      power_mW     = 0,
      uptime_s     = 0,
    } = body;

    const gasNum   = Math.round(Number(gas_val));
    const tempNum  = parseFloat(String(temperature));
    const accelNum = parseFloat(String(acceleration));

    // ── 1. Store the reading ──────────────────────────────
    await db.vehicleReading.create({
      data: {
        deviceCode,
        siteCode,
        eventType,
        gasVal:      gasNum,
        temperature: tempNum,
        pressure:    parseFloat(String(pressure)),
        acceleration: accelNum,
        voltage:     parseFloat(String(voltage)),
        currentMa:   parseFloat(String(current_mA)),
        powerMw:     parseFloat(String(power_mW)),
        uptimeS:     parseInt(String(uptime_s)),
      },
    });

    // ── 2. Fetch context (site + system user) for auto-records ─
    const [site, systemUser] = await Promise.all([
      siteCode
        ? db.site.findFirst({ where: { code: siteCode } })
        : db.site.findFirst({ orderBy: { createdAt: "asc" } }),
      db.user.findFirst({
        where: { role: { in: ["ADMIN", "HSSE_MANAGER"] } },
        orderBy: { createdAt: "asc" },
      }),
    ]);

    // ── 3. CRASH → auto-create Incident ──────────────────
    if (eventType === "CRASH" && systemUser && site) {
      // Idempotency: one crash incident per device per 5-minute window
      const windowStart = new Date(Date.now() - 5 * 60 * 1000);
      const existing = await db.incident.findFirst({
        where: {
          idempotencyKey: { startsWith: `veh-crash-${deviceCode}` },
          createdAt: { gte: windowStart },
        },
      });

      if (!existing) {
        const iKey     = `veh-crash-${deviceCode}-${Date.now()}`;

        await db.incident.create({
          data: {
            incidentNumber:  await nextIncidentNumber(),
            idempotencyKey:  iKey,
            title:           `[AUTO] Vehicle Crash Detected — ${deviceCode}`,
            description:     `ESP32 vehicle monitor (${deviceCode}) detected a severe impact.\n` +
                             `Force: ${accelNum.toFixed(1)} m/s²\n` +
                             `Gas: ${gasNum}% | Temperature: ${tempNum.toFixed(1)}°C\n` +
                             `Voltage: ${parseFloat(String(voltage)).toFixed(2)} V`,
            type:            "VEHICLE",
            severity:        accelNum > 50 ? "CRITICAL" : "HIGH",
            status:          "REPORTED",
            location:        siteCode ?? deviceCode,
            occurredAt:      new Date(),
            isAutoEscalated: true,
            siteId:          site.id,
            reporterId:      systemUser.id,
          },
        });
      }
    }

    // ── 4. Gas / Temp thresholds → auto-create Alert ─────
    const alertReasons: string[] = [];
    if (gasNum > 50)    alertReasons.push(`Gas level critical: ${gasNum}%`);
    if (tempNum >= 40)  alertReasons.push(`Temperature critical: ${tempNum.toFixed(1)}°C`);

    if (alertReasons.length > 0) {
      // Deduplicate: skip if same device already has an unacknowledged alert in last 5 min
      const windowStart = new Date(Date.now() - 5 * 60 * 1000);
      const existing = await db.alert.findFirst({
        where: {
          type:            "VEHICLE_SENSOR",
          status:          "PENDING",
          acknowledgedAt:  null,
          createdAt:       { gte: windowStart },
          message:         { contains: deviceCode },
        },
      });

      if (!existing) {
        await db.alert.create({
          data: {
            type:        "VEHICLE_SENSOR",
            title:       `Sensor Alert — ${deviceCode}`,
            message:     `${alertReasons.join(" | ")} on device ${deviceCode}.`,
            channels:    "IN_APP",
            isAutonomous: true,
            siteId:      site?.id ?? null,
          },
        });
      }
    }

    // ── 5. Auto-prune old readings ────────────────────────
    const normalCutoff = new Date(Date.now() - 7  * 24 * 60 * 60 * 1000);
    const crashCutoff  = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    await db.vehicleReading.deleteMany({
      where: {
        OR: [
          { eventType: "NORMAL", recordedAt: { lt: normalCutoff } },
          { eventType: "CRASH",  recordedAt: { lt: crashCutoff  } },
        ],
      },
    });

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (err) {
    console.error("[/api/data POST] Error:", err);
    return NextResponse.json({ ok: false, error: "Internal error" }, { status: 500 });
  }
}

// ─────────────────────────────────────────────────────────────
//  GET — last readings for the dashboard (no device key needed)
// ─────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const scope = await requireScopedAuth();
  if (scope instanceof Response) return scope;
  try {
    const { searchParams } = new URL(req.url);
    const device = searchParams.get("device") ?? "VEH-001";
    const limit  = Math.min(parseInt(searchParams.get("limit") ?? "50"), 200);

    const readings = await db.vehicleReading.findMany({
      where:   { deviceCode: device },
      orderBy: { recordedAt: "desc" },
      take:    limit,
    });

    const latest  = readings[0] ?? null;
    const crashes = readings.filter((r) => r.eventType === "CRASH").length;

    // Latest unacknowledged vehicle alert
    const activeAlert = await db.alert.findFirst({
      where: {
        type:           "VEHICLE_SENSOR",
        status:         "PENDING",
        acknowledgedAt: null,
        message:        { contains: device },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ ok: true, data: { latest, readings, crashes, activeAlert } });
  } catch (err) {
    console.error("[/api/data GET] Error:", err);
    return NextResponse.json({ ok: false, error: "Internal error" }, { status: 500 });
  }
}
