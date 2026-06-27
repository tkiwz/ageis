import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import type { ApiResponse } from "@/types";

export const dynamic = "force-dynamic";

interface HealthData {
  status: "healthy" | "degraded" | "down";
  uptime: number;
  timestamp: string;
  checks: {
    database: boolean;
    anthropicKey: boolean;
    nextAuthSecret: boolean;
  };
  counts: {
    users: number;
    sites: number;
    incidents: number;
    sensors: number;
  };
}

const bootTime = Date.now();

export async function GET() {
  const checks = {
    database: false,
    anthropicKey: !!process.env.ANTHROPIC_API_KEY,
    nextAuthSecret: !!process.env.NEXTAUTH_SECRET,
  };

  const counts = { users: 0, sites: 0, incidents: 0, sensors: 0 };

  try {
    const [users, sites, incidents, sensors] = await Promise.all([
      db.user.count(),
      db.site.count(),
      db.incident.count(),
      db.ioTDevice.count(),
    ]);
    counts.users = users;
    counts.sites = sites;
    counts.incidents = incidents;
    counts.sensors = sensors;
    checks.database = true;
  } catch {
    checks.database = false;
  }

  const allOk = Object.values(checks).every(Boolean);
  const status: HealthData["status"] = allOk
    ? "healthy"
    : checks.database
      ? "degraded"
      : "down";

  const data: HealthData = {
    status,
    uptime: Math.round((Date.now() - bootTime) / 1000),
    timestamp: new Date().toISOString(),
    checks,
    counts,
  };

  const response: ApiResponse<HealthData> = { ok: true, data };
  return NextResponse.json(response, {
    status: status === "down" ? 503 : 200,
  });
}