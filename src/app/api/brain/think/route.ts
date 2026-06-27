/**
 * POST /api/brain/think — central entry point to invoke the AEGIS brain.
 *
 * Body shape:
 *   {
 *     type: SignalType,
 *     trigger: string,
 *     payload: { ... },
 *     siteId?: string,
 *     signalEntityType?: string,
 *     signalEntityId?: string
 *   }
 */
import { NextRequest } from "next/server";
import { auth } from "@/auth";
import { ok, fail, unauthorized } from "@/lib/api-response";
import { think } from "@/lib/brain/orchestrator";
import { friendlyClaudeError } from "@/lib/ai/error-friendly";
import type { BrainSignal, SignalType } from "@/lib/brain/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const VALID_TYPES: SignalType[] = [
  "INCIDENT", "PERMIT_NEW", "SENSOR_ANOMALY", "WELLNESS_ALERT",
  "PIPELINE_ANOMALY", "VISION_DETECTION", "MANUAL_QUERY", "SCHEDULED_REVIEW",
];

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return unauthorized();

  let body: Partial<BrainSignal>;
  try { body = await req.json(); } catch { return fail("INVALID_BODY", "Invalid JSON", 400); }

  if (!body.type || !VALID_TYPES.includes(body.type as SignalType)) {
    return fail("INVALID_TYPE", `type must be one of: ${VALID_TYPES.join(", ")}`, 400);
  }
  if (!body.trigger) return fail("MISSING", "trigger is required", 400);

  const signal: BrainSignal = {
    type: body.type as SignalType,
    trigger: body.trigger,
    payload: body.payload ?? {},
    siteId: body.siteId,
    userId: session.user.id,
    signalEntityType: body.signalEntityType,
    signalEntityId: body.signalEntityId,
  };

  try {
    const decision = await think(signal, { userId: session.user.id });
    return ok(decision);
  } catch (err) {
    console.error("Brain think failed:", err);
    const friendly = friendlyClaudeError(err);
    return fail(friendly.code, friendly.message, friendly.httpStatus);
  }
}
