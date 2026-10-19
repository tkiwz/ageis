import { NextRequest } from "next/server";
import { auth } from "@/auth";
import { ok, fail } from "@/lib/api-response";
import { db } from "@/lib/db";
import type { FieldDeviceListItem } from "@/types/devices";
import { requireScopedAuth } from "@/lib/scoped-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest) {
  const scope = await requireScopedAuth();
  if (scope instanceof Response) return scope;
  const devices = await db.fieldDevice.findMany({
    where: scope.where("siteId"),
    include: {
      site: { select: { id: true, code: true, name: true } },
    },
    orderBy: { code: "asc" },
  });

  const items: FieldDeviceListItem[] = devices.map((d) => ({
    id: d.id,
    code: d.code,
    name: d.name,
    type: d.type as FieldDeviceListItem["type"],
    status: d.status as FieldDeviceListItem["status"],
    ipAddress: d.ipAddress,
    port: d.port,
    batteryPercent: d.batteryPercent,
    lastSeenAt: d.lastSeenAt?.toISOString() ?? null,
    detectionsCount: d.detectionsCount,
    alertsCount: d.alertsCount,
    site: d.site,
  }));

  return ok(items);
}
