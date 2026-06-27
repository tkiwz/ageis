/**
 * POST /api/brain/sessions/[id]/feedback
 *
 * Mark a brain session's reasoning as correct or incorrect.
 * This reinforces or contradicts the memories the brain recalled during that session,
 * so future sessions about similar signals get better-calibrated recall.
 *
 * Body: { outcome: "CORRECT" | "INCORRECT" }
 */
import { NextRequest } from "next/server";
import { auth } from "@/auth";
import { ok, fail, unauthorized } from "@/lib/api-response";
import { db } from "@/lib/db";
import { recordOutcome } from "@/lib/brain/learning";
import { log } from "@/lib/observability/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) return unauthorized();

  const { id } = await params;

  const brainSession = await db.brainSession.findUnique({
    where: { id },
    select: {
      id: true,
      status: true,
      signalId: true,
      recalledMemoryIds: true,
      trigger: true,
    },
  });

  if (!brainSession) return fail("NOT_FOUND", "Brain session not found", 404);
  if (brainSession.status !== "COMPLETED") {
    return fail("BAD_REQUEST", "Can only give feedback on COMPLETED sessions", 400);
  }

  let body: { outcome?: string };
  try { body = await req.json(); } catch { return fail("INVALID_BODY", "Invalid JSON", 400); }

  if (body.outcome !== "CORRECT" && body.outcome !== "INCORRECT") {
    return fail("BAD_REQUEST", "outcome must be CORRECT or INCORRECT", 400);
  }

  try {
    // If there's a signalId (a linked entity), use recordOutcome on it.
    // Fall back to direct memory feedback using recalledMemoryIds.
    let memoriesUpdated = 0;

    if (brainSession.signalId) {
      const result = await recordOutcome({
        entityType: "incident", // generic — the function queries by signalId regardless of type
        entityId: brainSession.signalId,
        outcome: body.outcome as "CORRECT" | "INCORRECT",
      });
      memoriesUpdated = result.updated;
    } else if (brainSession.recalledMemoryIds) {
      // No linked entity — feedback memory IDs directly
      const ids = JSON.parse(brainSession.recalledMemoryIds) as string[];
      const { feedback } = await import("@/lib/brain/memory");
      const direction = body.outcome === "CORRECT" ? "REINFORCE" : "CONTRADICT";
      for (const memId of ids) {
        await feedback(memId, direction);
      }
      memoriesUpdated = ids.length;
    }

    // Mark the session as reviewed
    await db.brainSession.update({
      where: { id },
      data: {
        reviewedById: session.user.id,
        reviewedAt: new Date(),
      },
    });

    await db.auditLog.create({
      data: {
        module: "AI",
        action: "BRAIN_FEEDBACK",
        actionType: "MANUAL",
        isAutonomous: false,
        description: `Brain session "${brainSession.trigger.slice(0, 80)}" marked ${body.outcome} by ${session.user.name ?? session.user.email}`,
        metadata: JSON.stringify({ sessionId: id, outcome: body.outcome, memoriesUpdated }),
        userId: session.user.id,
      },
    });

    log.info("Brain feedback recorded", { sessionId: id, outcome: body.outcome, memoriesUpdated });

    return ok({ memoriesUpdated, outcome: body.outcome });
  } catch (err) {
    log.error("Brain feedback failed", err, { sessionId: id });
    return fail("SERVER_ERROR", "Failed to record feedback", 500);
  }
}
