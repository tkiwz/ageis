/**
 * Per-user AI quota for user-triggered AI routes (chat, analyze, voice...).
 * DB-backed (AICostLedger) so it holds across serverless instances:
 *   1. global daily/monthly budget (shared with autonomous calls)
 *   2. per-user calls per hour, per feature group
 * Each allowed call writes an estimated ledger row (module "user").
 *
 *   const limited = await aiGuard("analyze");
 *   if (limited) return limited;
 */
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { fail, unauthorized } from "@/lib/api-response";
import { computeCostMicroUsd } from "@/lib/ai/cost-model";
import { getBudgetStatus } from "@/lib/autonomy/cost-guard";
import { CLAUDE_MODEL } from "@/lib/ai/claude-client";

type AiFeature = "chat" | "analyze" | "voice" | "brain" | "video";

const PER_HOUR: Record<AiFeature, number> = {
  chat: 40,
  analyze: 30,
  voice: 60,
  brain: 20,
  video: 3,
};

export async function aiGuard(feature: AiFeature) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return unauthorized();

  const budget = await getBudgetStatus();
  if (budget.remainingDailyUsd <= 0 || budget.remainingMonthlyUsd <= 0) {
    return fail("AI_BUDGET_EXCEEDED", "AI budget reached. Try again later.", 429);
  }

  const used = await db.aICostLedger.count({
    where: {
      userId,
      module: "user",
      feature,
      createdAt: { gte: new Date(Date.now() - 3_600_000) },
    },
  });
  if (used >= PER_HOUR[feature]) {
    return fail("RATE_LIMITED", `AI limit reached (${PER_HOUR[feature]}/hour). Try again later.`, 429);
  }

  await db.aICostLedger.create({
    data: {
      provider: feature === "video" ? "GEMINI" : "CLAUDE",
      model: CLAUDE_MODEL,
      module: "user",
      feature,
      inputTokens: 4000,
      outputTokens: 1500,
      costMicroUsd: computeCostMicroUsd(CLAUDE_MODEL, 4000, 1500),
      userId,
    },
  });
  return null;
}
