/**
 * GET /api/live — lightweight liveness probe.
 *
 * For load-balancer health checks: returns 200 if the process can respond.
 * Does NOT touch DB or external services. Cheap to call every second.
 */
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bootTime = Date.now();

export async function GET() {
  return NextResponse.json({
    ok: true,
    alive: true,
    uptime: Math.round((Date.now() - bootTime) / 1000),
    timestamp: new Date().toISOString(),
  });
}
