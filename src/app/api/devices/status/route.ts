/**
 * Devices Status Dashboard
 * GET /api/devices/status
 *
 * يعرض حالة جميع الأجهزة (ESP32 + Raspberry Pi) مع آخر قراءة لكل منها.
 * يُستخدم من الـ Dashboard لعرض الأجهزة في الوقت الفعلي.
 */

import { NextRequest } from "next/server";
import { db }           from "@/lib/db";
import { ok }           from "@/lib/api-response";
import { requireScopedAuth } from "@/lib/scoped-auth";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const scope = await requireScopedAuth();
  if (scope instanceof Response) return scope;
  const type = req.nextUrl.searchParams.get("type"); // ESP32_WEARABLE | PI_VISION | null (all)

  const whereClause = type ? { type } : {};

  const [esp32Devices, rpiDevices, recentAlerts] = await Promise.all([
    // ESP32 devices with last telemetry
    db.fieldDevice.findMany({
      take: 500,
      where:   { type: "ESP32_WEARABLE" },
      include: {
        telemetry: {
          orderBy: { recordedAt: "desc" },
          take:    1,
        },
      },
      orderBy: { lastSeenAt: "desc" },
    }),

    // Raspberry Pi devices with last detection
    db.fieldDevice.findMany({
      take: 500,
      where:   { type: "PI_VISION" },
      include: {
        visionDetections: {
          orderBy: { detectedAt: "desc" },
          take:    3,
        },
      },
      orderBy: { lastSeenAt: "desc" },
    }),

    // Recent device-triggered alerts
    db.alert.findMany({
      where: {
        type: { in: ["FLAME", "GAS_CRITICAL", "FIRE", "SMOKE", "OIL_LEAK", "NO_HELMET", "NO_VEST"] },
      },
      orderBy: { createdAt: "desc" },
      take:    10,
    }),
  ]);

  // If type filter requested, only return relevant data
  if (type === "ESP32_WEARABLE") {
    return ok({ esp32: esp32Devices, alerts: recentAlerts });
  }
  if (type === "PI_VISION") {
    return ok({ rpi: rpiDevices, alerts: recentAlerts });
  }

  return ok({
    esp32:  esp32Devices,
    rpi:    rpiDevices,
    alerts: recentAlerts,
    summary: {
      totalDevices:  esp32Devices.length + rpiDevices.length,
      onlineDevices: [...esp32Devices, ...rpiDevices].filter(d => d.status === "ONLINE").length,
      activeAlerts:  recentAlerts.filter(a => a.status === "PENDING").length,
    },
  });
}
