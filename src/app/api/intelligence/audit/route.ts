import { NextRequest } from "next/server";
import { auth } from "@/auth";
import { ok, fail } from "@/lib/api-response";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return fail("UNAUTHORIZED", "Sign in required", 401);

  const url = new URL(req.url);
  const limit = parseInt(url.searchParams.get("limit") ?? "100", 10);
  const type = url.searchParams.get("type");
  const provider = url.searchParams.get("provider");

  const where: Record<string, unknown> = {};
  if (type) where.type = type;
  if (provider) where.provider = provider;

  const decisions = await db.aIDecision.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  const stats = {
    total: await db.aIDecision.count(),
    today: await db.aIDecision.count({
      where: { createdAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) } },
    }),
    autonomous: await db.aIDecision.count({ where: { autonomous: true } }),
    requiresHuman: await db.aIDecision.count({ where: { requiresHuman: true } }),
  };

  return ok({
    decisions: decisions.map((d) => ({
      id: d.id,
      type: d.type,
      provider: d.provider,
      modelUsed: d.modelUsed,
      reasoning: d.reasoning,
      autonomous: d.autonomous,
      requiresHuman: d.requiresHuman,
      createdAt: d.createdAt.toISOString(),
      inputData: d.inputData,
      outputData: d.outputData,
    })),
    stats,
  });
}