/**
 * Raspberry Pi Vision Detection Endpoint
 * POST /api/devices/rpi/detect
 *
 * Raspberry Pi يرسل نتائج الكشف بعد تحليل كل إطار بالكاميرا.
 * البيانات المدعومة:
 *   - deviceCode   : رمز الجهاز (مثال: "RPI-001")
 *   - label        : ما تم اكتشافه (helmet | no_helmet | vest | no_vest | oil_leak | mesh_guard | person | fire | smoke)
 *   - confidence   : درجة الثقة 0.0 - 1.0
 *   - imageUrl     : رابط الصورة (اختياري)
 *   - allScores    : جميع نتائج النموذج كـ JSON (اختياري)
 *   - siteCode     : رمز الموقع (اختياري)
 *
 * Authentication: X-Device-Secret header (كما في ESP32)
 */

import { NextRequest } from "next/server";
import { z }           from "zod";
import { db }          from "@/lib/db";
import { ok, fail }    from "@/lib/api-response";

export const dynamic = "force-dynamic";

// ─── Labels المدعومة ────────────────────────────────────────
const DETECTION_LABELS = [
  "helmet",       // ✅ خوذة مرتداة
  "no_helmet",    // ❌ بدون خوذة
  "vest",         // ✅ سترة مرتداة
  "no_vest",      // ❌ بدون سترة
  "oil_leak",     // ⚠️ تسرب نفط
  "mesh_guard",   // ✅ حارس شبكي
  "no_mesh_guard",// ❌ بدون حارس شبكي
  "person",       // 👤 شخص
  "fire",         // 🔥 حريق
  "smoke",        // 💨 دخان
  "cooler_check", // 🌡 فحص الكولر
] as const;

type DetectionLabel = typeof DETECTION_LABELS[number];

// Labels التي تتطلب إنشاء تنبيه تلقائي
const ALERT_LABELS: Partial<Record<DetectionLabel, { title: string; message: string; channels: string }>> = {
  no_helmet:     { title: "⚠️ عامل بدون خوذة",      message: "تم رصد عامل بدون معدات حماية (خوذة)",  channels: "APP" },
  no_vest:       { title: "⚠️ عامل بدون سترة",       message: "تم رصد عامل بدون سترة الأمان",         channels: "APP" },
  oil_leak:      { title: "🛢 تسرب نفط مكتشف",       message: "كاميرا Raspberry Pi رصدت تسرب نفط",    channels: "APP,WHATSAPP" },
  fire:          { title: "🔥 حريق مكتشف",           message: "كاميرا Raspberry Pi رصدت حريقاً",      channels: "APP,WHATSAPP" },
  smoke:         { title: "💨 دخان مكتشف",           message: "كاميرا Raspberry Pi رصدت دخاناً",      channels: "APP,WHATSAPP" },
  no_mesh_guard: { title: "⚠️ حارس شبكي مفقود",      message: "تم رصد آلة بدون حارس شبكي",           channels: "APP" },
};

// ─── Schema ────────────────────────────────────────────────
const detectSchema = z.object({
  deviceCode:  z.string().min(1).max(64),
  label:       z.enum(DETECTION_LABELS),
  confidence:  z.number().min(0).max(1),
  imageUrl:    z.string().url().optional(),
  allScores:   z.record(z.number()).optional(),
  siteCode:    z.string().optional(),
});

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

  // --- Parse ---
  let body: unknown;
  try { body = await req.json(); }
  catch { return fail("INVALID_BODY", "Invalid JSON", 400); }

  const parsed = detectSchema.safeParse(body);
  if (!parsed.success) {
    return fail("VALIDATION", parsed.error.issues[0]?.message ?? "Invalid input", 400);
  }

  const { deviceCode, label, confidence, imageUrl, allScores, siteCode } = parsed.data;

  // --- Resolve site ---
  let siteId: string | null = null;
  if (siteCode) {
    const site = await db.site.findUnique({ where: { code: siteCode } });
    siteId = site?.id ?? null;
  }

  // --- Upsert FieldDevice ---
  const device = await db.fieldDevice.upsert({
    where:  { code: deviceCode },
    update: {
      status:     "ONLINE",
      lastSeenAt: new Date(),
      detectionsCount: { increment: 1 },
      ...(siteId ? { siteId } : {}),
    },
    create: {
      code:            deviceCode,
      name:            `Raspberry Pi — ${deviceCode}`,
      type:            "PI_VISION",
      status:          "ONLINE",
      lastSeenAt:      new Date(),
      detectionsCount: 1,
      siteId:          siteId ?? undefined,
    },
  });

  // --- Determine status ---
  const safeLabels: DetectionLabel[] = ["helmet", "vest", "mesh_guard", "person", "cooler_check"];
  const status = safeLabels.includes(label) ? "OK"
    : label === "oil_leak" || label === "fire" || label === "smoke" ? "WARNING"
    : "INFO";

  // --- Store detection ---
  const detection = await db.visionDetection.create({
    data: {
      deviceId:   device.id,
      label,
      confidence,
      status,
      imageUrl:   imageUrl ?? null,
      allScores:  allScores ? JSON.stringify(allScores) : undefined,
    },
  });

  // --- Auto-alert for dangerous detections ---
  let alertId: string | null = null;
  const alertDef = ALERT_LABELS[label];

  if (alertDef && confidence >= 0.60) {
    const alert = await db.alert.create({
      data: {
        type:         label.toUpperCase(),
        title:        alertDef.title,
        message:      `${alertDef.message} (${deviceCode}, ثقة: ${Math.round(confidence * 100)}%)`,
        channels:     alertDef.channels,
        status:       "PENDING",
        isAutonomous: true,
        siteId:       siteId ?? undefined,
      },
    });
    alertId = alert.id;

    // Increment device alert counter
    await db.fieldDevice.update({
      where: { id: device.id },
      data:  { alertsCount: { increment: 1 } },
    });
  }

  return ok({
    deviceId:    device.id,
    detectionId: detection.id,
    label,
    status,
    alertCreated: !!alertId,
    alertId,
  });
}

// ─── GET — detections for a device or all RPi devices ─────
export async function GET(req: NextRequest) {
  const code  = req.nextUrl.searchParams.get("device");
  const limit = Math.min(Number(req.nextUrl.searchParams.get("limit") ?? 20), 100);

  if (code) {
    const device = await db.fieldDevice.findUnique({
      where:   { code },
      include: {
        visionDetections: {
          orderBy: { detectedAt: "desc" },
          take:    limit,
        },
      },
    });
    if (!device) return fail("NOT_FOUND", "Device not found", 404);
    return ok(device);
  }

  const devices = await db.fieldDevice.findMany({
    where:   { type: "PI_VISION" },
    include: {
      visionDetections: {
        orderBy: { detectedAt: "desc" },
        take:    5,
      },
    },
    orderBy: { lastSeenAt: "desc" },
  });

  return ok(devices);
}
