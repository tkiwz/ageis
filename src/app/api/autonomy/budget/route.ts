import { auth } from "@/auth";
import { ok, unauthorized } from "@/lib/api-response";
import { getBudgetStatus } from "@/lib/autonomy/cost-guard";
import { db } from "@/lib/db";

export const runtime = "nodejs";

export async function GET() {
  const session = await auth();
  if (!session?.user) return unauthorized();

  const status = await getBudgetStatus();

  // Top-5 modules by cost today for the dashboard breakdown.
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const byModule = await db.aICostLedger.groupBy({
    by: ["module"],
    where: { createdAt: { gte: startOfDay } },
    _sum: { costMicroUsd: true, inputTokens: true, outputTokens: true },
    _count: { _all: true },
    orderBy: { _sum: { costMicroUsd: "desc" } },
    take: 5,
  });

  return ok({
    ...status,
    todayByModule: byModule.map((b) => ({
      module: b.module,
      costUsd: (b._sum.costMicroUsd ?? 0) / 1_000_000,
      inputTokens: b._sum.inputTokens ?? 0,
      outputTokens: b._sum.outputTokens ?? 0,
      callCount: b._count._all,
    })),
  });
}
