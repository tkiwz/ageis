import { requireRole } from "@/lib/auth-helpers";
import { getAutonomySettings } from "@/lib/autonomy/settings";
import { getBudgetStatus } from "@/lib/autonomy/cost-guard";
import { db } from "@/lib/db";
import { AutonomyControlPanel } from "./autonomy-control";

export const dynamic = "force-dynamic";

export default async function AutonomyPage() {
  await requireRole(["ADMIN", "HSSE_MANAGER"]);
  const [settings, baseBudget] = await Promise.all([
    getAutonomySettings(),
    getBudgetStatus(),
  ]);

  // Enrich budget with per-module breakdown for today (matches /api/autonomy/budget shape)
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
  const budget = {
    ...baseBudget,
    todayByModule: byModule.map((b) => ({
      module: b.module,
      costUsd: (b._sum.costMicroUsd ?? 0) / 1_000_000,
      inputTokens: b._sum.inputTokens ?? 0,
      outputTokens: b._sum.outputTokens ?? 0,
      callCount: b._count._all,
    })),
  };

  return (
    <div className="container mx-auto max-w-5xl px-6 py-8">
      <div className="mb-8">
        <h1 className="font-display text-3xl tracking-tight">Autonomy Control</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Master kill switch, per-module gates, demo mode, and AI budget guards.
          <span className="mx-2 opacity-50">·</span>
          <span dir="rtl" className="inline-block">التحكم في الاستقلالية ومراقبة التكلفة</span>
        </p>
      </div>
      <AutonomyControlPanel initialSettings={settings} initialBudget={budget} />
    </div>
  );
}
