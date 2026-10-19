import { NextRequest } from "next/server";
import { auth } from "@/auth";
import { ok, fail } from "@/lib/api-response";
import { db } from "@/lib/db";
import { piGetStats } from "@/lib/devices/pi-client";
import { requireScopedAuth } from "@/lib/scoped-auth";
import { denyUnlessSiteVisible } from "@/lib/security/site-guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const scope = await requireScopedAuth();
  if (scope instanceof Response) return scope;
  const session = await auth();
  if (!session?.user) return fail("UNAUTHORIZED", "Sign in required", 401);

  const { id } = await ctx.params;

  const hidden = await denyUnlessSiteVisible("device", id);

  if (hidden) return hidden;
  const device = await db.fieldDevice.findUnique({ where: { id } });
  if (!device) return fail("NOT_FOUND", "Device not found", 404);
  if (!device.ipAddress) return fail("NO_IP", "Device has no IP address", 400);

  try {
    const stats = await piGetStats({
      ipAddress: device.ipAddress,
      port: device.port ?? 5000,
      timeoutMs: 3000,
    });

    // Update lastSeenAt + status
    await db.fieldDevice.update({
      where: { id },
      data: { status: "ONLINE", lastSeenAt: new Date() },
    });

    return ok(stats);
  } catch (err) {
    // Mark offline
    await db.fieldDevice.update({
      where: { id },
      data: { status: "OFFLINE" },
    });
    const message = err instanceof Error ? err.message : "Pi unreachable";
    return fail("PI_UNREACHABLE", message, 503);
  }
}
