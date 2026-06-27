import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth-helpers";
import { ok, serverError } from "@/lib/api-response";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    await requireAuth();
    const { searchParams } = new URL(request.url);
    const siteId = searchParams.get("siteId");
    const type = searchParams.get("type");
    const status = searchParams.get("status");

    const devices = await db.ioTDevice.findMany({
      where: {
        ...(siteId && { siteId }),
        ...(type && { type }),
        ...(status && { status }),
      },
      include: {
        site: { select: { code: true, name: true } },
        readings: {
          orderBy: { recordedAt: "desc" },
          take: 1,
        },
      },
      orderBy: { name: "asc" },
    });

    const data = devices.map((d) => {
      const latest = d.readings[0];
      return {
        id: d.id,
        code: d.code,
        name: d.name,
        type: d.type,
        status: d.status,
        location: d.location,
        unit: d.unit,
        siteId: d.siteId,
        siteCode: d.site.code,
        siteName: d.site.name,
        thresholds: {
          warningHigh: d.warningHigh,
          criticalHigh: d.criticalHigh,
          warningLow: d.warningLow,
          criticalLow: d.criticalLow,
        },
        latestReading: latest
          ? {
              value: latest.value,
              alertLevel: latest.alertLevel,
              isAnomaly: latest.isAnomaly,
              recordedAt: latest.recordedAt,
            }
          : null,
        lastReadingAt: d.lastReadingAt,
      };
    });

    // Summary stats
    const summary = {
      total: devices.length,
      online: devices.filter((d) => d.status === "ONLINE").length,
      offline: devices.filter((d) => d.status === "OFFLINE").length,
      maintenance: devices.filter((d) => d.status === "MAINTENANCE").length,
      anomalies: data.filter((d) => d.latestReading?.isAnomaly).length,
    };

    return ok({ devices: data, summary });
  } catch (error) {
    console.error("[/api/sensors] error:", error);
    return serverError();
  }
}