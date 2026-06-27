/**
 * PATCH /api/knowledge/contributions/[id]
 * Body: { verdict: "APPROVE" | "REJECT", notes?: string }
 *
 * Approves or rejects a non-CRITICAL contribution.
 * CRITICAL ones go through /api/knowledge/[id]/critical-confirm.
 */
import { NextRequest } from "next/server";
import { auth } from "@/auth";
import { ok, fail, unauthorized, forbidden } from "@/lib/api-response";
import { reviewContribution } from "@/lib/knowledge/review";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) return unauthorized();
  if (!["ADMIN", "HSSE_MANAGER", "SAFETY_OFFICER"].includes(session.user.role)) {
    return forbidden("Only HSSE staff can review contributions");
  }

  const { id } = await ctx.params;
  let body: { verdict?: string; notes?: string };
  try { body = await req.json(); } catch { return fail("INVALID_BODY", "Invalid JSON", 400); }
  if (body.verdict !== "APPROVE" && body.verdict !== "REJECT") {
    return fail("BAD_VERDICT", "verdict must be APPROVE or REJECT", 400);
  }

  try {
    const result = await reviewContribution({
      contributionId: id,
      reviewerId: session.user.id!,
      reviewerEmail: session.user.email ?? undefined,
      verdict: body.verdict,
      notes: body.notes,
    });
    return ok(result);
  } catch (err) {
    return fail("REVIEW_FAILED", err instanceof Error ? err.message : "Unknown", 400);
  }
}
