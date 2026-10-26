/**
 * PATCH /api/compliance/items/[id]  { status, note }
 *   COMPLIANT — the responsible person or a safety role marks it done (note = evidence)
 *   PENDING   — managers reopen it
 *   EXEMPT    — managers only, with a reason
 * The note goes to the audit chain.
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
  status: z.enum(["COMPLIANT", "PENDING", "EXEMPT"]),
  note:   z.string().trim().max(1000).optional(),
}).strict();

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const scope = await requireScopedAuth();
  if (scope instanceof NextResponse) return scope;
  const { id } = await params;

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail("VALIDATION", "status must be COMPLIANT, PENDING or EXEMPT", 400);
  const { status, note } = parsed.data;

  const item = await db.complianceItem.findUnique({ where: { id } });
  if (!item || !scope.canSee(item.siteId)) return fail("NOT_FOUND", "Compliance item not found", 404);
  if (item.status === status) return ok({ item });

  const isManager = (ROLE_GROUPS.MANAGE as readonly string[]).includes(scope.role);
  const isSafety  = (ROLE_GROUPS.SAFETY as readonly string[]).includes(scope.role);
  if (status === "COMPLIANT" && !(isSafety || item.responsibleId === scope.userId)) {
    return fail("FORBIDDEN", "Only the responsible person or a safety officer can mark this compliant", 403);
  }
  if (status !== "COMPLIANT" && !isManager) {
    return fail("FORBIDDEN", "Only HSSE managers can reopen or exempt an item", 403);
  }
  if ((status === "COMPLIANT" || status === "EXEMPT") && !note) {
    return fail("VALIDATION", status === "EXEMPT" ? "A reason is required" : "Describe the evidence (what was done)", 400);
  }

  const updated = await db.complianceItem.update({ where: { id }, data: { status } });
  await appendAuditLog({
    module: "COMPLIANCE",
    action: `COMPLIANCE_ITEM_${status}`,
    description: `"${item.title}" (${item.regulationRef}): ${item.status} → ${status}${note ? ` — ${note}` : ""}`.slice(0, 1500),
    userId: scope.userId,
    siteId: item.siteId,
  });
  return ok({ item: updated });
}
