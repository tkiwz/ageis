/**
 * POST /api/brain/sessions/[id]/execute-actions
 *
 * Manually trigger action execution for a completed Brain session.
 * Useful for sessions that ran before the automatic executor was wired in,
 * or for sessions with GUARDED actions that the manager has reviewed and wants to retry.
 *
 * Only allowed for ADMIN / HSSE_MANAGER.
 */
import { NextRequest } from "next/server";
import { auth } from "@/auth";
import { ok, fail, unauthorized } from "@/lib/api-response";
import { db } from "@/lib/db";
import { executeActions } from "@/lib/brain/action-executor";
import type { RecommendedAction } from "@/lib/brain/types";
import { log } from "@/lib/observability/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const ALLOWED_ROLES = ["ADMIN", "HSSE_MANAGER"] as const;

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) return unauthorized();

  if (!ALLOWED_ROLES.includes(session.user.role as typeof ALLOWED_ROLES[number])) {
    return fail("FORBIDDEN", "Only ADMIN and HSSE_MANAGER can manually execute brain actions", 403);
  }

  const { id } = await params;

  const brainSession = await db.brainSession.findUnique({
    where: { id },
    select: {
      id: true,
      status: true,
      trigger: true,
      signalType: true,
      signalId: true,
      siteId: true,
      userId: true,
      conclusion: true,
      confidence: true,
      actionsRecommended: true,
      actionsTaken: true,
    },
  });

  if (!brainSession) return fail("NOT_FOUND", "Brain session not found", 404);
  if (brainSession.status !== "COMPLETED") {
    return fail("BAD_REQUEST", "Can only execute actions on COMPLETED sessions", 400);
  }

  if (!brainSession.actionsRecommended) {
    return ok({ message: "No actions to execute", total: 0 });
  }

  let actions: RecommendedAction[];
  try {
    actions = JSON.parse(brainSession.actionsRecommended) as RecommendedAction[];
  } catch {
    return fail("PARSE_ERROR", "Failed to parse actionsRecommended JSON", 500);
  }

  if (actions.length === 0) {
    return ok({ message: "No actions to execute", total: 0 });
  }

  try {
    const result = await executeActions(actions, {
      sessionId: id,
      signalType: brainSession.signalType ?? undefined,
      signalEntityId: brainSession.signalId ?? undefined,
      siteId: brainSession.siteId ?? undefined,
      userId: brainSession.userId ?? undefined,
      conclusion: brainSession.conclusion ?? undefined,
      confidence: brainSession.confidence ?? undefined,
    });

    await db.auditLog.create({
      data: {
        module: "AI",
        action: "BRAIN_ACTIONS_MANUALLY_EXECUTED",
        actionType: "MANUAL",
        isAutonomous: false,
        description: `Manual execution of ${result.total} actions from brain session "${brainSession.trigger.slice(0, 80)}" — auto: ${result.autoExecuted}, guarded: ${result.guarded}`,
        metadata: JSON.stringify({ sessionId: id, result }),
        userId: session.user.id,
      },
    });

    log.info("Brain actions manually executed", {
      sessionId: id,
      triggeredBy: session.user.id,
      total: result.total,
      autoExecuted: result.autoExecuted,
      guarded: result.guarded,
    });

    return ok(result);
  } catch (err) {
    log.error("Manual brain action execution failed", err, { sessionId: id });
    return fail("SERVER_ERROR", "Action execution failed", 500);
  }
}
