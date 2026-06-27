/**
 * GET /api/security/audit-verify
 *
 * Walks the entire audit-log chain and verifies integrity.
 * ADMIN-only. Returns the first detected break, or "all good".
 *
 * Wire to a cron job: hit this daily and alert if `valid: false`.
 */
import { auth } from "@/auth";
import { ok, unauthorized, forbidden } from "@/lib/api-response";
import { verifyAuditChain } from "@/lib/security/audit-chain";

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
