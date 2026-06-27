/**
 * POST /api/knowledge/critical-confirm
 * Body: { suggestionId: string, action: "CONFIRM" | "REJECT" }
 *
 * Two-key confirmation for CRITICAL contributions.
 * Caller must be a DIFFERENT manager from any previous confirmer.
 */
import { NextRequest } from "next/server";
import { auth } from "@/auth";
import { ok, fail, unauthorized, forbidden } from "@/lib/api-response";
import { handleTwoKeyConfirm, sweepExpiredTwoKeys } from "@/lib/knowledge/two-key-confirm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return unauthorized();
  if (!["ADMIN", "HSSE_MANAGER"].includes(session.user.role)) {
    return forbidden("Only ADMIN or HSSE_MANAGER can confirm CRITICAL observations");
  }

  let body: { suggestionId?: string; action?: string };
  try { body = await req.json(); } catch { return fail("INVALID_BODY", "Invalid JSON", 400); }
  if (!body.suggestionId) return fail("MISSING", "suggestionId required", 400);
  if (body.action !== "CONFIRM" && body.action !== "REJECT") {
    return fail("BAD_ACTION", "action must be CONFIRM or REJECT", 400);
  }

  // Sweep any expired TKAs while we're here (lightweight)
  await sweepExpiredTwoKeys().catch(() => { /* swallow */ });

  const result = await handleTwoKeyConfirm({
    suggestionId: body.suggestionId,
    userId: session.user.id!,
    userEmail: session.user.email ?? undefined,
    action: body.action,
  });

  return ok(result);
}
