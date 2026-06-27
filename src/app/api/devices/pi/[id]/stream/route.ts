import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Proxies the Pi's MJPEG stream so the browser can show it via <img>
 * without needing direct LAN access to the Pi.
 *
 * The Pi serves multipart/x-mixed-replace which streams JPEG frames.
 * We pipe its response body straight through.
 */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const { id } = await ctx.params;
  const device = await db.fieldDevice.findUnique({ where: { id } });
  if (!device || !device.ipAddress) {
    return new NextResponse("Device not found", { status: 404 });
  }

  const port = device.port ?? 5000;
  const piUrl = `http://${device.ipAddress}:${port}/video_feed`;

  try {
    const upstream = await fetch(piUrl, {
      cache: "no-store",
      // Long-lived stream; no timeout
    });

    if (!upstream.ok || !upstream.body) {
      return new NextResponse(`Pi stream returned ${upstream.status}`, { status: 502 });
    }

    return new NextResponse(upstream.body, {
      status: 200,
      headers: {
        "Content-Type": upstream.headers.get("Content-Type") ?? "multipart/x-mixed-replace; boundary=frame",
        "Cache-Control": "no-store, no-cache, must-revalidate",
        "Pragma": "no-cache",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Pi unreachable";
    return new NextResponse(`Pi unreachable: ${message}`, { status: 503 });
  }
}
