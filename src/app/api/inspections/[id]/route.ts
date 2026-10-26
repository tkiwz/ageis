/**
 * PATCH /api/inspections/[id]  { result: "PASSED" | "FAILED", notes }
 * Finishes a scheduled / in-progress inspection. Failing needs notes (what was found).
 * Safety roles only; the result goes to the audit chain.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { ok, fail } from "@/lib/api-response";
import { db } from "@/lib/db";
import { requireScopedAuth } from "@/lib/scoped-auth";
import { ROLE_GROUPS } from "@/lib/rbac";
import { appendAuditLog } from "@/lib/security/audit-chain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  result: z.enum(["PASSED", "FAILED"]),
  notes:  z.string().trim().max(2000).optional(),
}).strict();

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const scope = await requireScopedAuth();
  if (scope instanceof NextResponse) return scope;
  if (!(ROLE_GROUPS.SAFETY as readonly string[]).includes(scope.role)) {
    return fail("FORBIDDEN", "Only HSSE staff can complete inspections", 403);
  }
  const { id } = await params;

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail("VALIDATION", "result must be PASSED or FAILED", 400);
  const { result, notes } = parsed.data;
  if (result === "FAILED" && !notes) return fail("VALIDATION", "Describe what failed", 400);

  const ins = await db.inspection.findUnique({ where: { id } });
  if (!ins || !scope.canSee(ins.siteId)) return fail("NOT_FOUND", "Inspection not found", 404);
  if (!["SCHEDULED", "IN_PROGRESS"].includes(ins.status)) {
    return fail("INVALID_STATE", "This inspection is already finished", 409);
  }

  const updated = await db.inspection.update({
    where: { id },
    data: {
      status: result === "PASSED" ? "COMPLETED" : "FAILED",
      conductedAt: new Date(),
      conductedById: scope.userId,
      notes: notes ?? ins.notes,
    },
  });
  await appendAuditLog({
    module: "INSPECTION",
    action: `INSPECTION_${result}`,
    description: `Inspection "${ins.title}" ${result.toLowerCase()}${notes ? ` — ${notes}` : ""}`.slice(0, 1500),
    riskLevel: result === "FAILED" ? "MEDIUM" : "LOW",
    userId: scope.userId,
    siteId: ins.siteId,
  });
  return ok({ inspection: updated });
}
