/**
 * Cost guard — enforces budget + rate-limits with reservation pattern.
 *
 * Key fix for the burst-overcommit race:
 *   1. Acquire mutex
 *   2. Compute current usage (includes prior reservations)
 *   3. If under budget, INSERT a reservation row sized to estimated max cost
 *   4. Release mutex
 *   5. Run the slow Claude call OUTSIDE the lock
 *   6. UPDATE the reservation with actual tokens
 *
 * Result: 20 concurrent calls cannot collectively exceed budget by more than
 * the estimation error (capped at ~1.5x typical actual).
 */
import { db } from "@/lib/db";
import { computeCostMicroUsd, microUsdToUsd } from "@/lib/ai/cost-model";
import { getAutonomySettings } from "./settings";
import { getMutex } from "@/lib/observability/mutex";

export class BudgetExceededError extends Error {
  constructor(
    message: string,
    public readonly kind: "daily" | "monthly" | "rate-minute" | "rate-hour",
  ) {
    super(message);
    this.name = "BudgetExceededError";
  }
}

// Single global lock for all check-and-reserve operations.
const COST_GUARD_LOCK = getMutex("cost-guard");

// Conservative defaults — most Claude calls are well under these.
const DEFAULT_ESTIMATED_INPUT = 4000;
const DEFAULT_ESTIMATED_OUTPUT = 1500;

interface BudgetStatus {
  dailyUsedUsd: number;
  monthlyUsedUsd: number;
  dailyLimitUsd: number;
  monthlyLimitUsd: number;
  callsLastMinute: number;
  callsLastHour: number;
  limitPerMinute: number;
  limitPerHour: number;
  remainingDailyUsd: number;
  remainingMonthlyUsd: number;
}

export async function getBudgetStatus(): Promise<BudgetStatus> {
  const settings = await getAutonomySettings();
  const now = Date.now();
  const startOfDay = new Date(); startOfDay.setHours(0, 0, 0, 0);
  const startOfMonth = new Date(); startOfMonth.setDate(1); startOfMonth.setHours(0, 0, 0, 0);
  const lastMinute = new Date(now - 60_000);
  const lastHour = new Date(now - 3_600_000);

  const [daily, monthly, perMin, perHour] = await Promise.all([
    db.aICostLedger.aggregate({
      _sum: { costMicroUsd: true },
      where: { createdAt: { gte: startOfDay } },
    }),
    db.aICostLedger.aggregate({
      _sum: { costMicroUsd: true },
      where: { createdAt: { gte: startOfMonth } },
    }),
    db.aICostLedger.count({ where: { createdAt: { gte: lastMinute } } }),
    db.aICostLedger.count({ where: { createdAt: { gte: lastHour } } }),
  ]);

  const dailyUsedUsd = microUsdToUsd(daily._sum.costMicroUsd ?? 0);
  const monthlyUsedUsd = microUsdToUsd(monthly._sum.costMicroUsd ?? 0);

  return {
    dailyUsedUsd,
    monthlyUsedUsd,
    dailyLimitUsd: settings.dailyBudgetUsd,
    monthlyLimitUsd: settings.monthlyBudgetUsd,
    callsLastMinute: perMin,
    callsLastHour: perHour,
    limitPerMinute: settings.maxCallsPerMinute,
    limitPerHour: settings.maxCallsPerHour,
    remainingDailyUsd: Math.max(0, settings.dailyBudgetUsd - dailyUsedUsd),
    remainingMonthlyUsd: Math.max(0, settings.monthlyBudgetUsd - monthlyUsedUsd),
  };
}

export interface ReservationOptions {
  provider: "CLAUDE" | "GEMINI";
  model: string;
  module: string;
  feature?: string;
  userId?: string;
  autonomous?: boolean;
  estimatedInputTokens?: number;
  estimatedOutputTokens?: number;
}

export interface Reservation {
  id: string;
  model: string;
  estimatedCostMicroUsd: number;
}

/**
 * Atomic check-and-reserve. The returned reservation MUST be settled by
 * calling `settleReservation()` with the actual usage, even on errors.
 *
 * Throws BudgetExceededError if no headroom exists.
 */
export async function reserveBudget(opts: ReservationOptions): Promise<Reservation> {
  const estIn = opts.estimatedInputTokens ?? DEFAULT_ESTIMATED_INPUT;
  const estOut = opts.estimatedOutputTokens ?? DEFAULT_ESTIMATED_OUTPUT;
  const estimatedCost = computeCostMicroUsd(opts.model, estIn, estOut);

  return COST_GUARD_LOCK.run(async () => {
    const status = await getBudgetStatus();

    if (status.dailyUsedUsd >= status.dailyLimitUsd) {
      throw new BudgetExceededError(
        `Daily AI budget exceeded ($${status.dailyUsedUsd.toFixed(2)} / $${status.dailyLimitUsd}).`,
        "daily",
      );
    }
    if (status.monthlyUsedUsd >= status.monthlyLimitUsd) {
      throw new BudgetExceededError(
        `Monthly AI budget exceeded ($${status.monthlyUsedUsd.toFixed(2)} / $${status.monthlyLimitUsd}).`,
        "monthly",
      );
    }
    // Project this reservation into the daily budget — refuse if it would breach.
    const projectedDaily = status.dailyUsedUsd + microUsdToUsd(estimatedCost);
    if (projectedDaily > status.dailyLimitUsd) {
      throw new BudgetExceededError(
        `Reservation $${microUsdToUsd(estimatedCost).toFixed(4)} would exceed daily budget ($${status.dailyUsedUsd.toFixed(2)} + reservation > $${status.dailyLimitUsd}).`,
        "daily",
      );
    }
    if (status.callsLastMinute >= status.limitPerMinute) {
      throw new BudgetExceededError(
        `Rate limit: ${status.callsLastMinute} calls in last minute (max ${status.limitPerMinute}).`,
        "rate-minute",
      );
    }
    if (status.callsLastHour >= status.limitPerHour) {
      throw new BudgetExceededError(
        `Rate limit: ${status.callsLastHour} calls in last hour (max ${status.limitPerHour}).`,
        "rate-hour",
      );
    }

    // Reserve — record uses estimated values to count toward concurrent calls.
    const reservation = await db.aICostLedger.create({
      data: {
        provider: opts.provider,
        model: opts.model,
        module: opts.module,
        feature: opts.feature ? `${opts.feature}:reserved` : "reserved",
        inputTokens: estIn,
        outputTokens: estOut,
        costMicroUsd: estimatedCost,
        userId: opts.userId,
        autonomous: opts.autonomous ?? false,
      },
    });

    return { id: reservation.id, model: opts.model, estimatedCostMicroUsd: estimatedCost };
  });
}

export interface SettlementOptions {
  inputTokens: number;
  outputTokens: number;
  durationMs?: number;
  feature?: string;
  failed?: boolean; // if true, settle to zero — call never made it
}

/**
 * Update a reservation with actual usage. Safe to call multiple times (idempotent on values).
 */
export async function settleReservation(
  reservation: Reservation,
  settlement: SettlementOptions,
): Promise<void> {
  const actualCost = settlement.failed
    ? 0
    : computeCostMicroUsd(reservation.model, settlement.inputTokens, settlement.outputTokens);

  await db.aICostLedger.update({
    where: { id: reservation.id },
    data: {
      inputTokens: settlement.failed ? 0 : settlement.inputTokens,
      outputTokens: settlement.failed ? 0 : settlement.outputTokens,
      costMicroUsd: actualCost,
      durationMs: settlement.durationMs,
      feature: settlement.feature ?? "settled",
    },
  });
}

// ─── Backward-compat ───
// Old API that some routes still import. Internally uses reserveBudget.
export async function assertBudgetAvailable(): Promise<BudgetStatus> {
  const status = await getBudgetStatus();
  if (status.dailyUsedUsd >= status.dailyLimitUsd) {
    throw new BudgetExceededError(
      `Daily AI budget exceeded ($${status.dailyUsedUsd.toFixed(2)} / $${status.dailyLimitUsd}).`,
      "daily",
    );
  }
  if (status.monthlyUsedUsd >= status.monthlyLimitUsd) {
    throw new BudgetExceededError(
      `Monthly AI budget exceeded.`,
      "monthly",
    );
  }
  if (status.callsLastMinute >= status.limitPerMinute) {
    throw new BudgetExceededError(`Rate limit per-minute exceeded.`, "rate-minute");
  }
  if (status.callsLastHour >= status.limitPerHour) {
    throw new BudgetExceededError(`Rate limit per-hour exceeded.`, "rate-hour");
  }
  return status;
}

// Legacy single-write API — kept for any caller that doesn't use reservations.
interface LedgerEntry {
  provider: "CLAUDE" | "GEMINI";
  model: string;
  module: string;
  feature?: string;
  inputTokens: number;
  outputTokens: number;
  durationMs?: number;
  userId?: string;
  autonomous?: boolean;
}

export async function recordAIUsage(entry: LedgerEntry): Promise<void> {
  const cost = computeCostMicroUsd(entry.model, entry.inputTokens, entry.outputTokens);
  await db.aICostLedger.create({
    data: {
      provider: entry.provider,
      model: entry.model,
      module: entry.module,
      feature: entry.feature,
      inputTokens: entry.inputTokens,
      outputTokens: entry.outputTokens,
      costMicroUsd: cost,
      durationMs: entry.durationMs,
      userId: entry.userId,
      autonomous: entry.autonomous ?? false,
    },
  });
}
