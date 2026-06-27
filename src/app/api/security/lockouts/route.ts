/**
 * POST /api/security/lockouts — unlock a specific account.
 * Body: { email: string }
 */
import { NextRequest } from "next/server";
import { auth } from "@/auth";
import { ok, fail, unauthorized, forbidden } from "@/lib/api-response";
import { db } from "@/lib/db";
import { appendAuditLog } from "@/lib/security/audit-chain";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return unauthorized();
  if (session.user.role !== "ADMIN") return forbidden("Only ADMIN can unlock accounts");

  let body: { email?: string };
  try { body = await req.json(); } catch { return fail("INVALID_BODY", "Invalid JSON", 400); }
  if (!body.email) return fail("MISSING", "email required", 400);

  const email = body.email.toLowerCase().trim();
  const lockout = await db.accountLockout.findUnique({ where: { email } });
  if (!lockout) return fail("NOT_FOUND", "No lockout record for this email", 404);

  await db.accountLockout.update({
    where: { email },
    data: { failCount: 0, lockedUntil: null, lastFailAt: null },
  });

  await appendAuditLog({
    module: "SECURITY",
    action: "ACCOUNT_UNLOCKED",
    actionType: "MANUAL",
    description: `${session.user.email ?? session.user.id} manually unlocked ${email}`,
    metadata: JSON.stringify({ unlockedEmail: email }),
    riskLevel: "MEDIUM",
    userId: session.user.id,
  });

  return ok({ email, unlocked: true });
}
