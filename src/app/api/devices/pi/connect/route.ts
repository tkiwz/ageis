import { NextRequest } from "next/server";
import { auth } from "@/auth";
import { ok, fail } from "@/lib/api-response";
import { db } from "@/lib/db";
import { piGetStats, piPing } from "@/lib/devices/pi-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface ConnectBody {
  name: string;
  ipAddress: string;
  port?: number;
  siteId?: string;
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return fail("UNAUTHORIZED", "Sign in required", 401);

  // Only admins and HSSE managers can register devices
  if (!["ADMIN", "HSSE_MANAGER"].includes(session.user.role)) {
    return fail("FORBIDDEN", "Only ADMIN or HSSE_MANAGER can register devices", 403);
  }

  let body: ConnectBody;
  try {
    body = (await req.json()) as ConnectBody;
  } catch {
    return fail("INVALID_BODY", "Invalid JSON", 400);
  }

  if (!body.ipAddress || !body.name) {
    return fail("MISSING_FIELDS", "name and ipAddress required", 400);
  }

  const port = body.port ?? 5000;

  // Test connection
  const online = await piPing({ ipAddress: body.ipAddress, port });

  let modelClasses: string[] | null = null;
  if (online) {
    try {
      const stats = await piGetStats({ ipAddress: body.ipAddress, port });
      if (stats.all_scores) {
        modelClasses = Object.keys(stats.all_scores);
      }
    } catch {
      // Already pinged, ignore
    }
  }

  // Find next available code
  const count = await db.fieldDevice.count({ where: { type: "PI_VISION" } });
  const code = `PI-${String(count + 1).padStart(3, "0")}`;

  const device = await db.fieldDevice.create({
    data: {
      code,
      name: body.name,
      type: "PI_VISION",
      ipAddress: body.ipAddress,
      port,
      status: online ? "ONLINE" : "OFFLINE",
      lastSeenAt: online ? new Date() : null,
      modelClasses: modelClasses as never,
      siteId: body.siteId ?? null,
    },
  });

  return ok({ device, online });
}
