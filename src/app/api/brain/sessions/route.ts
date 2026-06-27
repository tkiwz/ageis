import { NextRequest, NextResponse } from "next/server";
import { ok } from "@/lib/api-response";
import { db } from "@/lib/db";
import { requireScopedAuth } from "@/lib/scoped-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const scope = await requireScopedAuth();
  if (scope instanceof NextResponse) return scope;

  const status = req.nextUrl.searchParams.get("status");
  const limit = Math.min(100, parseInt(req.nextUrl.searchParams.get("limit") ?? "30", 10));

  const where: Record<string, unknown> = {};
  if (status) where.status = status;
  if (!scope.unrestricted && Array.isArray(scope.siteScope)) {
    where.OR = [{ siteId: null }, { siteId: { in: scope.siteScope } }];
  }

  const [sessions, totals] = await Promise.all([
    db.brainSession.findMany({
      where,
      orderBy: { startedAt: "desc" },
      take: limit,
      select: {
        id: true,
        trigger: true,
        signalType: true,
        signalId: true,
        status: true,
        conclusion: true,
        conclusionAr: true,
        confidence: true,
        requiresApproval: true,
        durationMs: true,
        totalTokens: true,
        startedAt: true,
        agentsConsulted: true,
        actionsRecommended: true,
        actionsTaken: true,
        recalledMemoryIds: true,
        reviewedAt: true,
        agentRuns: {
          select: {
            id: true, agentName: true, confidence: true,
            durationMs: true, status: true, tokensUsed: true,
          },
        },
      },
    }),
    db.brainSession.groupBy({
      by: ["status"],
      _count: { _all: true },
    }),
  ]);

  return ok({
    sessions,
    totals: Object.fromEntries(totals.map((t) => [t.status, t._count._all])),
  });
}
