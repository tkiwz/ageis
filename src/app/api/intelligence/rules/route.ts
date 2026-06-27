import { auth } from "@/auth";
import { ok, fail } from "@/lib/api-response";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth();
  if (!session?.user) return fail("UNAUTHORIZED", "Sign in required", 401);

  const rules = await db.rule.findMany({
    orderBy: [{ createdAt: "desc" }],
  });

  const stats = {
    total:       rules.length,
    active:      rules.filter((r) => r.isActive).length,
    triggered:   rules.reduce((sum, r) => sum + (r.triggerCount ?? 0), 0),
    autoActions: rules.filter((r) => r.isActive).length,
  };

  return ok({
    rules: rules.map((r) => ({
      id: r.id,
      name: r.name,
      description: r.description,
      module: r.module,
      severity: r.severity,
      enabled: r.isActive,
      conditions: r.conditions,
      actions: r.actions,
      requiresApproval: r.requiresApproval,
      triggerCount: r.triggerCount ?? 0,
      lastTriggered: r.lastTriggeredAt?.toISOString() ?? null,
    })),
    stats,
  });
}
