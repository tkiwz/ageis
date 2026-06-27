import { NextRequest } from "next/server";
import { auth } from "@/auth";
import { ok, unauthorized } from "@/lib/api-response";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return unauthorized();

  const status = req.nextUrl.searchParams.get("status");
  const source = req.nextUrl.searchParams.get("source");
  const mine = req.nextUrl.searchParams.get("mine") === "1";

  const where: Record<string, unknown> = {};
  if (status) where.status = status;
  if (source) where.source = source;
  if (mine) where.contributorId = session.user.id;

  const contribs = await db.knowledgeContribution.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  // Enrich with contributor info
  const ids = Array.from(new Set(contribs.map((c) => c.contributorId)));
  const users = await db.user.findMany({
    where: { id: { in: ids } },
    select: { id: true, name: true, email: true, role: true },
  });
  const userMap = Object.fromEntries(users.map((u) => [u.id, u]));

  // Summary stats
  const [pending, autoApplied, approved, rejected] = await Promise.all([
    db.knowledgeContribution.count({ where: { status: { in: ["PENDING", "AI_PROCESSED"] } } }),
    db.knowledgeContribution.count({ where: { status: "AUTO_APPLIED" } }),
    db.knowledgeContribution.count({ where: { status: "APPROVED" } }),
    db.knowledgeContribution.count({ where: { status: "REJECTED" } }),
  ]);

  return ok({
    contributions: contribs.map((c) => ({
      ...c,
      contributor: userMap[c.contributorId] ?? null,
    })),
    stats: { pending, autoApplied, approved, rejected, total: contribs.length },
  });
}
