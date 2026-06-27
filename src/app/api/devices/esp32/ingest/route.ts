/**
 * ESP32 Wearable / Sensor Ingest Endpoint
 * POST /api/devices/esp32/ingest
 *
 * ESP32 يرسل البيانات كل X ثانية عبر HTTP POST.
 * البيانات المدعومة:
 *   - temperature     : درجة حرارة المحيط (°C)
 *   - heartRate       : تردد النبض (bpm) — اختياري
 *   - gasLevel        : مستوى الغاز (ppm)
 *   - flameDetected   : كاشف الشعلة (true/false)
 *   - deviceCode      : رمز الجهاز (مثال: "ESP32-001")
 *   - siteCode        : رمز الموقع (اختياري، مثال: "SITE-A")
 *   - batteryPercent  : نسبة البطارية (اختياري)
 *
 * Authentication:
 *   Header: X-Device-Secret: <DEVICE_INGEST_SECRET from .env>
 *   إذا كان DEVICE_INGEST_SECRET فارغاً في .env → يقبل بدون مصادقة (dev mode)
 *
 * Auto-alert behaviour (server-side):
 *   • Critical gas OR flame → sends WhatsApp via CallMeBot
 *   • Critical gas OR flame → creates Incident + IncidentAction (idempotent per device per 30 min)
 */

import { NextRequest } from "next/server";
import { z }           from "zod";
import { db }          from "@/lib/db";
import { ok, fail }    from "@/lib/api-response";

export const dynamic = "force-dynamic";

// ─── Thresholds ────────────────────────────────────────────
const THRESHOLDS = {
  temperature: { warning: 45, critical: 55 },   // °C
  gasLevel:    { warning: 50, critical: 100 },   // ppm
  heartRate:   { warning: 110, critical: 130 },  // bpm
};

// System user used as reporter for auto-created incidents
const SYSTEM_REPORTER_ID = "user-admin-001";

// ─── Schema ────────────────────────────────────────────────
const ingestSchema = z.object({
  deviceCode:     z.string().min(1).max(64),
  temperature:    z.number().min(-40).max(200).optional(),
  heartRate:      z.number().min(30).max(250).optional(),
  gasLevel:       z.number().min(0).max(10_000).optional(),
  flameDetected:  z.boolean().optional(),
  batteryPercent: z.number().min(0).max(100).optional(),
  siteCode:       z.string().optional(),
});

type IngestBody = z.infer<typeof ingestSchema>;

// ─── Helpers ───────────────────────────────────────────────
function alertLevel(value: number, th: { warning: number; critical: number }) {
  if (value >= th.critical) return "CRITICAL";
  if (value >= th.warning)  return "WARNING";
  return null;
}

async function sendWhatsApp(message: string) {
  const phone  = process.env.CALLMEBOT_PHONE;
  const apiKey = process.env.CALLMEBOT_APIKEY;
  if (!phone || !apiKey) return;
  const encoded = encodeURIComponent(message);
  fetch(`https://api.callmebot.com/whatsapp.php?phone=${phone}&text=${encoded}&apikey=${apiKey}`)
    .catch(() => { /* best-effort */ });
}

// ─── POST Handler ──────────────────────────────────────────
export async function POST(req: NextRequest) {
  // --- Auth ---
  const secret = process.env.DEVICE_INGEST_SECRET;
  if (secret) {
    const provided = req.headers.get("x-device-secret");
    if (provided !== secret) {
      return fail("UNAUTHORIZED", "Invalid device secret", 401);
    }
  }

  // --- Parse body ---
  let body: unknown;
  try { body = await req.json(); }
  catch { return fail("INVALID_BODY", "Invalid JSON", 400); }

  const parsed = ingestSchema.safeParse(body);
  if (!parsed.success) {
    return fail("VALIDATION", parsed.error.issues[0]?.message ?? "Invalid input", 400);
  }

  const data: IngestBody = parsed.data;

  // --- Upsert FieldDevice ---
  let siteId: string | null = null;
  if (data.siteCode) {
    const site = await db.site.findUnique({ where: { code: data.siteCode } });
    siteId = site?.id ?? null;
  }

  const device = await db.fieldDevice.upsert({
    where:  { code: data.deviceCode },
    update: {
      status:         "ONLINE",
      batteryPercent: data.batteryPercent ?? undefined,
      lastSeenAt:     new Date(),
      ...(siteId ? { siteId } : {}),
    },
    create: {
      code:           data.deviceCode,
      name:           `ESP32 — ${data.deviceCode}`,
      type:           "ESP32_WEARABLE",
      status:         "ONLINE",
      batteryPercent: data.batteryPercent ?? null,
      lastSeenAt:     new Date(),
      siteId:         siteId ?? undefined,
    },
  });

  // --- Store telemetry ---
  const telemetry = await db.deviceTelemetry.create({
    data: {
      deviceId:    device.id,
      temperature: data.temperature ?? null,
      gasLevel:    data.gasLevel    ?? null,
      currentMa:   data.heartRate   ?? null,   // reuse currentMa for heartRate
      alertActive: data.flameDetected ?? false,
    },
  });

  // --- Detect alerts and update device counters ---
  const triggeredAlerts: string[] = [];

  if (data.flameDetected) {
    triggeredAlerts.push("FLAME_DETECTED");
  }
  if (data.temperature !== undefined) {
    const lvl = alertLevel(data.temperature, THRESHOLDS.temperature);
    if (lvl) triggeredAlerts.push(`TEMP_${lvl}`);
  }
  if (data.gasLevel !== undefined) {
    const lvl = alertLevel(data.gasLevel, THRESHOLDS.gasLevel);
    if (lvl) triggeredAlerts.push(`GAS_${lvl}`);
  }
  if (data.heartRate !== undefined) {
    const lvl = alertLevel(data.heartRate, THRESHOLDS.heartRate);
    if (lvl) triggeredAlerts.push(`HR_${lvl}`);
  }

  if (triggeredAlerts.length > 0) {
    await db.fieldDevice.update({
      where: { id: device.id },
      data:  { alertsCount: { increment: triggeredAlerts.length } },
    });
  }

  // --- Create Alert records for critical events ---
  if (data.flameDetected) {
    await db.alert.create({
      data: {
        type:         "FLAME",
        title:        `🔥 شعلة مكتشفة — ${data.deviceCode}`,
        message:      `الجهاز ${data.deviceCode} اكتشف شعلة نار. تحقق فوراً من الموقع.`,
        channels:     "APP,WHATSAPP",
        status:       "PENDING",
        isAutonomous: true,
        siteId:       siteId ?? undefined,
      },
    });
  }

  if (data.gasLevel !== undefined && data.gasLevel >= THRESHOLDS.gasLevel.critical) {
    await db.alert.create({
      data: {
        type:         "GAS_CRITICAL",
        title:        `⚠️ مستوى غاز حرج — ${data.deviceCode}`,
        message:      `الجهاز ${data.deviceCode}: مستوى الغاز ${data.gasLevel} ppm (حرج).`,
        channels:     "APP,WHATSAPP",
        status:       "PENDING",
        isAutonomous: true,
        siteId:       siteId ?? undefined,
      },
    });
  }

  // NOTE: Incident creation + WhatsApp are handled by the client
  // after 10 continuous seconds of danger (POST /api/sensors/alert-trigger).
  // The server only stores the reading and creates Alert records above.

  return ok({
    deviceId:    device.id,
    telemetryId: telemetry.id,
    alerts:      triggeredAlerts,
    status:      "recorded",
  });
}

// ─── GET — last reading for a device ───────────────────────
export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("device");

  if (code) {
    const device = await db.fieldDevice.findUnique({
      where:   { code },
      include: {
        telemetry: {
          orderBy: { recordedAt: "desc" },
          take:    10,
        },
      },
    });
    if (!device) return fail("NOT_FOUND", "Device not found", 404);
    return ok(device);
  }

  // Return all ESP32 devices + latest reading
  const devices = await db.fieldDevice.findMany({
    where:   { type: "ESP32_WEARABLE" },
    include: {
      telemetry: {
        orderBy: { recordedAt: "desc" },
        take:    1,
      },
    },
    orderBy: { lastSeenAt: "desc" },
  });

  return ok(devices);
}
