import { NextRequest } from "next/server";
import { auth } from "@/auth";
import { ok, fail } from "@/lib/api-response";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return fail("UNAUTHORIZED", "Sign in required", 401);

  const { id } = await ctx.params;
  const url = new URL(req.url);
  const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "30", 10) || 30, 100);

  const detections = await db.visionDetection.findMany({
    where: { deviceId: id },
    orderBy: { detectedAt: "desc" },
    take: limit,
  });

  const items = detections.map((d) => ({
    id: d.id,
    label: d.label,
    confidence: d.confidence,
    status: d.status,
    aiAnalyzed: d.aiAnalyzed,
    aiSeverity: d.aiSeverity,
    aiReasoning: d.aiReasoning,
    aiActions: d.aiActions,
    alertId: d.alertId,
    detectedAt: d.detectedAt.toISOString(),
  }));

  return ok(items);
}
