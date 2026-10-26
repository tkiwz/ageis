/**
 * GET  /api/security/audit-verify
 *   Walks the entire audit-log chain and verifies integrity.
 *   ADMIN / HSSE_MANAGER. Returns the first detected break, or "all good".
 *   Wire to a cron job: hit this daily and alert if `valid: false`.
 *
 * POST /api/security/audit-verify  { reason }
 *   ADMIN only. Re-anchors the chain with a signed checkpoint (see sealAuditChain).
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { ok, fail, unauthorized, forbidden } from "@/lib/api-response";
import { sealAuditChain, verifyAuditChain } from "@/lib/security/audit-chain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET() {
  const session = await auth();
  if (!session?.user) return unauthorized();
  if (!["ADMIN", "HSSE_MANAGER"].includes(session.user.role)) return forbidden();

  const report = await verifyAuditChain();
  return ok(report);
}

const sealSchema = z.object({ reason: z.string().trim().min(5).max(300) });

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return unauthorized();
  if (session.user.role !== "ADMIN") return forbidden();

  const parsed = sealSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail("VALIDATION", "A reason (5–300 characters) is required", 400);

  const result = await sealAuditChain(session.user.id, parsed.data.reason);
  return ok({ ...result, report: await verifyAuditChain() });
}
