/**
 * POST /api/autonomy/pipeline/tick
 *
 * The heartbeat endpoint for the Autonomous Monitoring Loop.
 *
 * Flow:
 *   1. Run cheap pre-filter to detect suspicious pipelines
 *   2. For each hit (max 3 per tick), invoke autonomous analyzer
 *   3. Return summary of work done
 *
 * Called by:
 *   - <AutonomyHeartbeat /> client component on /dashboard
 *   - External cron schedulers (Vercel Cron, etc.)
 *   - Admin "Run Now" button on /admin/autonomy
 */
import { NextRequest } from "next/server";
import { ok, fail } from "@/lib/api-response";
import { pipelineLoopTick } from "@/lib/autonomy/pipeline-loop";
import { analyzeAutonomously } from "@/lib/autonomy/pipeline-analyzer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_ANALYSES_PER_TICK = 3;

export async function POST(req: NextRequest) {
  // Auth: accept either a valid CRON_SECRET header OR an authenticated session.
  // This lets external schedulers + the dashboard heartbeat both invoke it.
  const cronSecret = process.env.CRON_SECRET;
  const headerSecret = req.headers.get("x-cron-secret");
  let authorized = Boolean(cronSecret && headerSecret === cronSecret);

  if (!authorized) {
    const { auth } = await import("@/auth");
    const session = await auth();
    authorized = Boolean(session?.user);
  }
  if (!authorized) return fail("UNAUTHORIZED", "Sign in or provide x-cron-secret", 401);

  const tick = await pipelineLoopTick();
  if (tick.blocked) {
    return ok({ ...tick, analyzed: [] });
  }

  // Limit how many we analyze in a single tick (cost containment).
  const targets = tick.hits.slice(0, MAX_ANALYSES_PER_TICK);
  const analyzed = [];
  for (const hit of targets) {
    try {
      const result = await analyzeAutonomously(hit.pipelineId);
      analyzed.push({ ...hit, result });
      if (result.blocked) break; // budget exhausted — stop the loop for this tick
    } catch (err) {
      analyzed.push({
        ...hit,
        error: err instanceof Error ? err.message : "Unknown error",
      });
    }
  }

  return ok({ ...tick, analyzed, queuedButSkipped: Math.max(0, tick.hits.length - targets.length) });
}

export async function GET() {
  // Dry-run — preview without analyzing.
  const tick = await pipelineLoopTick();
  return ok(tick);
}
