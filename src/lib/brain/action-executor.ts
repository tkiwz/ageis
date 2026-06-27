/**
 * Brain Action Executor
 *
 * Translates the Brain's recommendedActions into real database side-effects.
 *
 * ─── POLICY ────────────────────────────────────────────────────────────────
 *
 * AUTO-EXECUTE (no human sign-off required):
 *   CREATE_ALERT           → Alert row + manager notifications
 *   NOTIFY_MANAGER         → Notification rows to ADMIN / HSSE_MANAGER / SAFETY_OFFICER
 *   REST_BREAK_RECOMMENDED → WorkerWellnessAlert row + worker notification
 *   REVIEW_REQUIRED        → AISuggestion row (status=PENDING for soft review)
 *   NO_ACTION              → logged, nothing created
 *
 * GUARDED (create AISuggestion for human approval, never execute directly):
 *   CREATE_INCIDENT        → AISuggestion (type=CREATE_INCIDENT)
 *   CREATE_OBSERVATION     → AISuggestion (type=CREATE_OBSERVATION)
 *   TRIGGER_EMERGENCY      → AISuggestion (type=TRIGGER_EMERGENCY)
 *   EVACUATE_AREA          → AISuggestion (type=EVACUATE_AREA) + CRITICAL notification
 *   APPROVE_PERMIT         → AISuggestion (type=APPROVE_PERMIT)
 *   REJECT_PERMIT          → AISuggestion (type=REJECT_PERMIT)
 *   MODIFY_PERMIT          → AISuggestion (type=MODIFY_PERMIT)
 *   DISPATCH_DRONE         → AISuggestion (type=DISPATCH_DRONE)
 *
 * Guarded actions ALWAYS notify managers so they see the pending suggestion.
 * ───────────────────────────────────────────────────────────────────────────
 */

import { db } from "@/lib/db";
import { log } from "@/lib/observability/logger";
import type { RecommendedAction } from "./types";

// ─── Public types ───────────────────────────────────────────────────────────

export interface ActionExecutionResult {
  actionType: string;
  /** true = something was created / sent. false = guarded or errored. */
  executed: boolean;
  /** AUTO = ran immediately. GUARDED = created AISuggestion. NOOP = intentional no-op. */
  mode: "AUTO" | "GUARDED" | "NOOP";
  entityCreated?: { type: string; id: string };
  error?: string;
}

export interface ExecuteActionsResult {
  sessionId: string;
  total: number;
  /** Actions that ran automatically */
  autoExecuted: number;
  /** Actions held for human approval (AISuggestion created) */
  guarded: number;
  /** NO_ACTION entries */
  noops: number;
  results: ActionExecutionResult[];
}

export interface ExecutionContext {
  sessionId: string;
  /** Brain signal type, e.g. "PIPELINE_ANOMALY" */
  signalType?: string;
  /** Entity type that triggered the brain ("incident", "permit", …) */
  signalEntityType?: string;
  /** ID of the triggering entity */
  signalEntityId?: string;
  siteId?: string;
  /** Worker ID (used for REST_BREAK_RECOMMENDED) */
  userId?: string;
  /** Brain synthesized conclusion, for human-readable context */
  conclusion?: string;
  /** Brain confidence, stored on suggestions */
  confidence?: number;
}

// ─── Auto-execute set ───────────────────────────────────────────────────────

const AUTO_EXECUTE_TYPES = new Set([
  "CREATE_ALERT",
  "NOTIFY_MANAGER",
  "REST_BREAK_RECOMMENDED",
  "REVIEW_REQUIRED",
  "NO_ACTION",
]);

// ─── Main entry point ───────────────────────────────────────────────────────

/**
 * Execute (or guard) all recommended actions from a Brain session.
 * Persists execution results to BrainSession.actionsTaken.
 */
export async function executeActions(
  actions: RecommendedAction[],
  ctx: ExecutionContext,
): Promise<ExecuteActionsResult> {
  if (actions.length === 0) {
    return { sessionId: ctx.sessionId, total: 0, autoExecuted: 0, guarded: 0, noops: 0, results: [] };
  }

  const results: ActionExecutionResult[] = [];

  for (const action of actions) {
    try {
      const result = AUTO_EXECUTE_TYPES.has(action.type)
        ? await executeAutoAction(action, ctx)
        : await guardAction(action, ctx);
      results.push(result);
    } catch (err) {
      log.error("Brain action execution failed", err, {
        actionType: action.type,
        sessionId: ctx.sessionId,
      });
      results.push({
        actionType: action.type,
        executed: false,
        mode: "AUTO",
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const autoExecuted = results.filter((r) => r.mode === "AUTO" && r.executed).length;
  const guarded      = results.filter((r) => r.mode === "GUARDED").length;
  const noops        = results.filter((r) => r.mode === "NOOP").length;

  // Persist execution summary to BrainSession
  await db.brainSession.update({
    where: { id: ctx.sessionId },
    data: { actionsTaken: JSON.stringify(results) },
  });

  log.info("Brain actions executed", {
    sessionId: ctx.sessionId,
    total: actions.length,
    autoExecuted,
    guarded,
    noops,
  });

  return {
    sessionId: ctx.sessionId,
    total: actions.length,
    autoExecuted,
    guarded,
    noops,
    results,
  };
}

// ─── Auto-execute handlers ──────────────────────────────────────────────────

async function executeAutoAction(
  action: RecommendedAction,
  ctx: ExecutionContext,
): Promise<ActionExecutionResult> {
  switch (action.type) {
    case "NO_ACTION":
      return { actionType: "NO_ACTION", executed: true, mode: "NOOP" };

    case "NOTIFY_MANAGER":
      return notifyManagers(action, ctx);

    case "CREATE_ALERT":
      return createAlert(action, ctx);

    case "REST_BREAK_RECOMMENDED":
      return createRestBreak(action, ctx);

    case "REVIEW_REQUIRED":
      return createReviewSuggestion(action, ctx);

    default:
      return { actionType: action.type, executed: false, mode: "AUTO", error: "Unknown auto-execute type" };
  }
}

// ─── NOTIFY_MANAGER ─────────────────────────────────────────────────────────

async function notifyManagers(
  action: RecommendedAction,
  ctx: ExecutionContext,
): Promise<ActionExecutionResult> {
  const managers = await db.user.findMany({
    where: {
      role: { in: ["ADMIN", "HSSE_MANAGER", "SAFETY_OFFICER"] },
      isActive: true,
    },
    select: { id: true },
  });

  if (managers.length === 0) {
    return { actionType: action.type, executed: true, mode: "AUTO" };
  }

  const notifSeverity = toNotifSeverity(action.priority);

  await db.notification.createMany({
    data: managers.map((m) => ({
      userId: m.id,
      type: "SAFETY",
      severity: notifSeverity,
      title: `Brain Decision: ${action.description.slice(0, 80)}`,
      titleAr: `قرار الذكاء الاصطناعي: ${action.description.slice(0, 80)}`,
      body: `${action.description}${ctx.conclusion ? `\n\n${ctx.conclusion}` : ""}`,
      bodyAr: action.description,
      link: `/intelligence/brain`,
      metadata: JSON.stringify({
        sessionId: ctx.sessionId,
        actionType: action.type,
        signalType: ctx.signalType,
      }),
    })),
  });

  return { actionType: action.type, executed: true, mode: "AUTO" };
}

// ─── CREATE_ALERT ────────────────────────────────────────────────────────────

async function createAlert(
  action: RecommendedAction,
  ctx: ExecutionContext,
): Promise<ActionExecutionResult> {
  const alert = await db.alert.create({
    data: {
      type: ctx.signalType ?? "AI_GENERATED",
      title: action.description.slice(0, 200),
      message: action.description,
      channels: "IN_APP",
      status: "PENDING",
      isAutonomous: true,
      siteId: ctx.siteId ?? null,
    },
  });

  // Notify managers of the generated alert
  const managers = await db.user.findMany({
    where: { role: { in: ["ADMIN", "HSSE_MANAGER", "SAFETY_OFFICER"] }, isActive: true },
    select: { id: true },
  });

  if (managers.length > 0) {
    await db.notification.createMany({
      data: managers.map((m) => ({
        userId: m.id,
        type: "ALERT",
        severity: toNotifSeverity(action.priority),
        title: alert.title,
        titleAr: alert.title,
        body: alert.message,
        bodyAr: alert.message,
        link: `/safety/alerts/${alert.id}`,
        metadata: JSON.stringify({ alertId: alert.id, sessionId: ctx.sessionId }),
      })),
    });
  }

  return {
    actionType: action.type,
    executed: true,
    mode: "AUTO",
    entityCreated: { type: "Alert", id: alert.id },
  };
}

// ─── REST_BREAK_RECOMMENDED ──────────────────────────────────────────────────

async function createRestBreak(
  action: RecommendedAction,
  ctx: ExecutionContext,
): Promise<ActionExecutionResult> {
  const targetUserId = (action.params?.userId as string) ?? ctx.userId;
  if (!targetUserId) {
    return {
      actionType: action.type,
      executed: false,
      mode: "AUTO",
      error: "No userId available for REST_BREAK_RECOMMENDED",
    };
  }

  const wa = await db.workerWellnessAlert.create({
    data: {
      userId: targetUserId,
      alertType: "REST_BREAK",
      severity: "MEDIUM",
      message: action.description,
      messageAr: action.description,
      aiReasoning: ctx.conclusion ?? null,
      recommendedAction: "Take a 15-minute rest break in a shaded, cool area with water.",
    },
  });

  await db.notification.create({
    data: {
      userId: targetUserId,
      type: "WELLNESS",
      severity: "WARNING",
      title: "Rest break recommended by AEGIS",
      titleAr: "توصية بأخذ استراحة من نظام AEGIS",
      body: action.description,
      bodyAr: action.description,
      link: `/safety/wellness/${wa.id}`,
      metadata: JSON.stringify({ alertId: wa.id, sessionId: ctx.sessionId }),
    },
  });

  return {
    actionType: action.type,
    executed: true,
    mode: "AUTO",
    entityCreated: { type: "WellnessAlert", id: wa.id },
  };
}

// ─── REVIEW_REQUIRED ─────────────────────────────────────────────────────────

async function createReviewSuggestion(
  action: RecommendedAction,
  ctx: ExecutionContext,
): Promise<ActionExecutionResult> {
  const suggestion = await db.aISuggestion.create({
    data: {
      type: "BRAIN_REVIEW",
      subjectType: ctx.signalEntityType ?? "brain_session",
      subjectId: ctx.signalEntityId ?? ctx.sessionId,
      proposedAction: "REVIEW_REQUIRED",
      severity: action.priority ?? "MEDIUM",
      confidence: ctx.confidence ?? 0.5,
      reasoning: action.description,
      reasoningAr: action.descriptionAr ?? null,
      aiAnalysis: JSON.stringify({
        sessionId: ctx.sessionId,
        action,
        conclusion: ctx.conclusion,
        signalType: ctx.signalType,
      }),
      metadata: JSON.stringify({ sessionId: ctx.sessionId, siteId: ctx.siteId }),
      status: "PENDING",
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // expires in 24h
    },
  });

  return {
    actionType: action.type,
    executed: true,
    mode: "AUTO",
    entityCreated: { type: "AISuggestion", id: suggestion.id },
  };
}

// ─── GUARDED actions → AISuggestion ─────────────────────────────────────────

async function guardAction(
  action: RecommendedAction,
  ctx: ExecutionContext,
): Promise<ActionExecutionResult> {
  // For EVACUATE_AREA / TRIGGER_EMERGENCY — bump to CRITICAL so it's impossible to miss
  const effectivePriority =
    action.type === "EVACUATE_AREA" || action.type === "TRIGGER_EMERGENCY"
      ? "CRITICAL"
      : (action.priority ?? "HIGH");

  const suggestion = await db.aISuggestion.create({
    data: {
      type: action.type,
      subjectType: ctx.signalEntityType ?? "brain_session",
      subjectId: ctx.signalEntityId ?? ctx.sessionId,
      proposedAction: action.type,
      severity: effectivePriority,
      confidence: ctx.confidence ?? 0.5,
      reasoning: action.description,
      reasoningAr: action.descriptionAr ?? null,
      aiAnalysis: JSON.stringify({
        sessionId: ctx.sessionId,
        action,
        conclusion: ctx.conclusion,
        signalType: ctx.signalType,
        siteId: ctx.siteId,
        params: action.params,
      }),
      metadata: JSON.stringify({
        sessionId: ctx.sessionId,
        siteId: ctx.siteId,
        params: action.params,
      }),
      status: "PENDING",
      expiresAt: new Date(Date.now() + 4 * 60 * 60 * 1000), // guarded suggestions expire in 4h
    },
  });

  // Notify managers that a guarded action is waiting for their approval
  const recipientRoles =
    effectivePriority === "CRITICAL"
      ? ["ADMIN", "HSSE_MANAGER"]
      : ["ADMIN", "HSSE_MANAGER", "SAFETY_OFFICER"];

  const managers = await db.user.findMany({
    where: { role: { in: recipientRoles }, isActive: true },
    select: { id: true },
  });

  if (managers.length > 0) {
    await db.notification.createMany({
      data: managers.map((m) => ({
        userId: m.id,
        type: "ACTION_REQUIRED",
        severity: toNotifSeverity(effectivePriority as RecommendedAction["priority"]),
        title: `Action required: ${action.type.replace(/_/g, " ")}`,
        titleAr: `إجراء مطلوب: ${action.type.replace(/_/g, " ")}`,
        body: `${action.description}\n\nBrain confidence: ${((ctx.confidence ?? 0.5) * 100).toFixed(0)}%`,
        bodyAr: action.description,
        link: `/intelligence/brain`,
        metadata: JSON.stringify({
          suggestionId: suggestion.id,
          sessionId: ctx.sessionId,
          actionType: action.type,
        }),
      })),
    });
  }

  return {
    actionType: action.type,
    executed: false,
    mode: "GUARDED",
    entityCreated: { type: "AISuggestion", id: suggestion.id },
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function toNotifSeverity(
  priority: RecommendedAction["priority"] | undefined,
): string {
  switch (priority) {
    case "CRITICAL": return "CRITICAL";
    case "HIGH":     return "WARNING";
    case "MEDIUM":   return "INFO";
    default:         return "INFO";
  }
}
