/**
 * Guarded Claude wrapper — single entry point for all autonomous AI calls.
 *
 * Pipeline (P0-hardened):
 *   1. Kill switch check (per-module)
 *   2. Mutex-protected reservation — INSERTs estimated cost row before the call
 *   3. Claude call (outside the mutex, so concurrency stays high)
 *   4. Settle reservation with actual tokens
 *   5. AIDecision log for explainability
 *
 * Concurrent bursts can no longer exceed the daily budget by more than the
 * estimation error — the reservation row counts toward the budget for every
 * subsequent caller.
 */
import { claudeChat, CLAUDE_MODEL } from "./claude-client";
import {
  reserveBudget, settleReservation, BudgetExceededError,
  type Reservation,
} from "@/lib/autonomy/cost-guard";
import { checkAutonomyAllowed, type AutonomyModule } from "@/lib/autonomy/settings";
import { db } from "@/lib/db";
import { log } from "@/lib/observability/logger";

export interface GuardedChatOptions {
  module: AutonomyModule;
  feature?: string;
  system: string;
  messages: { role: "user" | "assistant"; content: string }[];
  maxTokens?: number;
  temperature?: number;
  /** If true, kill switch + budget enforced. If false, only metered. */
  autonomous?: boolean;
  userId?: string;
  inputSnapshot?: Record<string, unknown>;
  links?: {
    visionDetectionId?: string;
    telemetryId?: string;
    alertId?: string;
    incidentId?: string;
  };
  decisionType?: string;
  skipDecisionLog?: boolean;
  /** Rough estimate to size the reservation — defaults are conservative. */
  estimatedInputTokens?: number;
  estimatedOutputTokens?: number;
}

export interface GuardedChatResult {
  content: string;
  model: string;
  usage: { inputTokens: number; outputTokens: number };
  durationMs: number;
  decisionId?: string;
  blocked?: { reason: string };
  reservationId?: string;
}

export async function guardedClaudeChat(
  opts: GuardedChatOptions,
): Promise<GuardedChatResult> {
  const autonomous = opts.autonomous ?? true;

  // 1. Kill switch (autonomous only)
  if (autonomous) {
    const gate = await checkAutonomyAllowed(opts.module);
    if (!gate.allowed) {
      return {
        content: "",
        model: CLAUDE_MODEL,
        usage: { inputTokens: 0, outputTokens: 0 },
        durationMs: 0,
        blocked: { reason: gate.reason ?? "Blocked" },
      };
    }
  }

  // 2. Reserve budget atomically (mutex-protected)
  let reservation: Reservation;
  try {
    reservation = await reserveBudget({
      provider: "CLAUDE",
      model: CLAUDE_MODEL,
      module: opts.module,
      feature: opts.feature,
      userId: opts.userId,
      autonomous,
      // Estimates default to ~$0.03 — conservative for a 4k-input/1.5k-output call.
      estimatedInputTokens: opts.estimatedInputTokens ?? opts.maxTokens ?? 4000,
      estimatedOutputTokens: opts.estimatedOutputTokens ?? opts.maxTokens ?? 1500,
    });
  } catch (err) {
    if (err instanceof BudgetExceededError) {
      return {
        content: "",
        model: CLAUDE_MODEL,
        usage: { inputTokens: 0, outputTokens: 0 },
        durationMs: 0,
        blocked: { reason: err.message },
      };
    }
    throw err;
  }

  // 3. Claude call — outside the mutex, allowing concurrency
  let result;
  try {
    result = await claudeChat({
      system: opts.system,
      messages: opts.messages,
      maxTokens: opts.maxTokens,
      temperature: opts.temperature,
    });
  } catch (err) {
    // Failed call → settle to zero so the slot frees up immediately.
    await settleReservation(reservation, {
      inputTokens: 0,
      outputTokens: 0,
      failed: true,
      feature: `${opts.feature ?? "unknown"}:failed`,
    }).catch((settleErr) => {
      log.error("Failed to settle reservation after call failure", settleErr);
    });
    throw err;
  }

  // 4. Settle reservation with actuals
  await settleReservation(reservation, {
    inputTokens: result.usage.inputTokens,
    outputTokens: result.usage.outputTokens,
    durationMs: result.durationMs,
    feature: opts.feature,
  });

  // 5. AIDecision log
  let decisionId: string | undefined;
  if (!opts.skipDecisionLog) {
    const decision = await db.aIDecision.create({
      data: {
        type: opts.decisionType ?? "CHAT",
        provider: "CLAUDE",
        modelUsed: result.model,
        inputData: (opts.inputSnapshot ?? {
          messageCount: opts.messages.length,
          lastUserMessage: opts.messages[opts.messages.length - 1]?.content?.slice(0, 500),
        }) as object,
        outputData: { content: result.content } as object,
        reasoning: result.content.slice(0, 2000),
        tokensInput: result.usage.inputTokens,
        tokensOutput: result.usage.outputTokens,
        durationMs: result.durationMs,
        autonomous,
        visionDetectionId: opts.links?.visionDetectionId,
        telemetryId: opts.links?.telemetryId,
        alertId: opts.links?.alertId,
        incidentId: opts.links?.incidentId,
      },
    });
    decisionId = decision.id;
  }

  return {
    content: result.content,
    model: result.model,
    usage: result.usage,
    durationMs: result.durationMs,
    decisionId,
    reservationId: reservation.id,
  };
}
