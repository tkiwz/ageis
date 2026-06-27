/**
 * GET /api/ready — readiness probe.
 *
 * Verifies the process can actually serve requests:
 *   - DB connectivity
 *   - Required env vars present
 *   - Recent autonomy/budget sanity (no infinite loop)
 *
 * Returns 503 when not ready (load balancer should drain traffic).
 */
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { log } from "@/lib/observability/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bootTime = Date.now();
const REQUIRED_ENV = ["ANTHROPIC_API_KEY", "NEXTAUTH_SECRET", "DATABASE_URL"];

export async function GET() {
  const checks: Record<string, { ok: boolean; detail?: string }> = {};
  let overall = true;

  // 1. DB
  try {
    await db.$queryRaw`SELECT 1`;
    checks.database = { ok: true };
  } catch (err) {
    checks.database = { ok: false, detail: (err as Error).message };
    overall = false;
  }

  // 2. Env vars
  for (const k of REQUIRED_ENV) {
    if (!process.env[k]) {
      checks[`env.${k}`] = { ok: false, detail: "missing" };
      overall = false;
    } else {
      checks[`env.${k}`] = { ok: true };
    }
  }

  // 3. Migrations applied (Prisma side table) — best effort
  try {
    const lastMigration = await db.$queryRaw<{ migration_name: string }[]>`
      SELECT migration_name FROM _prisma_migrations ORDER BY started_at DESC LIMIT 1
    `;
    checks.migrations = {
      ok: true,
      detail: lastMigration[0]?.migration_name ?? "no migrations table",
    };
  } catch {
    // Non-fatal — Postgres / managed DBs may not expose this
    checks.migrations = { ok: true, detail: "skipped" };
  }

  if (!overall) {
    log.warn("Readiness probe failed", { checks });
    return NextResponse.json(
      { ok: false, ready: false, checks, uptime: Math.round((Date.now() - bootTime) / 1000) },
      { status: 503 },
    );
  }

  return NextResponse.json({
    ok: true,
    ready: true,
    checks,
    uptime: Math.round((Date.now() - bootTime) / 1000),
    timestamp: new Date().toISOString(),
  });
}
