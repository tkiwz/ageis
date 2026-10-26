import { NextRequest, NextResponse } from "next/server";
import { ok, fail } from "@/lib/api-response";
import { db } from "@/lib/db";
import { requireScopedAuth } from "@/lib/scoped-auth";
import { z } from "zod";
import { zodMessage } from "@/lib/validations/api";
import { appendAuditLog } from "@/lib/security/audit-chain";

const APPROVER_ROLES = ["ADMIN", "HSSE_MANAGER", "SAFETY_OFFICER"] as const;
const PENDING_STATES = ["PENDING", "DRAFT", "SUBMITTED", "IN_REVIEW"];
const RISK = z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]);

const permitEditSchema = z.object({
  title: z.string().trim().min(3).max(200).optional(),
  description: z.string().trim().max(5000).optional(),
  type: z.string().trim().min(2).max(40).optional(),
  riskLevel: RISK.optional(),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
});

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const scope = await requireScopedAuth();
  if (scope instanceof NextResponse) return scope;

  const { id } = await ctx.params;
  const permit = await db.permit.findUnique({
    where: { id },
    include: {
      site:      { select: { id: true, code: true, name: true, nameAr: true } },
      requester: { select: { name: true, role: true, email: true } },
      approver:  { select: { name: true, role: true } },
      conditions: true,
    },
  });

  if (!permit) return fail("NOT_FOUND", "Permit not found", 404);
  // Site-scope enforcement: cannot view a permit on a site you can't access.
  if (!scope.canSee(permit.siteId)) {
    return fail("NOT_FOUND", "Permit not found", 404); // mask existence
  }

  return ok({
    ...permit,
    validFrom: permit.validFrom.toISOString(),
    validUntil: permit.validUntil.toISOString(),
    createdAt: permit.createdAt.toISOString(),
    updatedAt: permit.updatedAt.toISOString(),
  });
}

export async function PUT(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const scope = await requireScopedAuth();
  if (scope instanceof NextResponse) return scope;

  const { id } = await ctx.params;
  const body = await req.json().catch(() => null);
  if (!body) return fail("INVALID_BODY", "Invalid JSON", 400);

  // Pre-check existence + site access (mask via NOT_FOUND on access failure)
  const existing = await db.permit.findUnique({
    where: { id },
    select: { siteId: true, status: true, requesterId: true, permitNumber: true, validUntil: true },
  });
  if (!existing) return fail("NOT_FOUND", "Permit not found", 404);
  if (!scope.canSee(existing.siteId)) return fail("NOT_FOUND", "Permit not found", 404);

  const reason = typeof body.reason === "string" ? body.reason.trim().slice(0, 500) : "";

  // Approve / Reject (pending permits only) · Revoke (active permits)
  if (body.action === "APPROVE" || body.action === "REJECT" || body.action === "REVOKE") {
    if (!(APPROVER_ROLES as readonly string[]).includes(scope.role)) {
      return fail("FORBIDDEN", "Only HSSE/Safety can approve permits", 403);
    }
    if (body.action === "REVOKE") {
      if (existing.status !== "ACTIVE") return fail("INVALID_STATE", "Only active permits can be revoked", 409);
    } else {
      if (!PENDING_STATES.includes(existing.status)) return fail("INVALID_STATE", "Permit is not waiting for approval", 409);
      // Separation of duties: nobody approves their own permit
      if (body.action === "APPROVE" && existing.requesterId === scope.userId) {
        return fail("SELF_APPROVAL", "You can't approve your own permit", 403);
      }
      if (body.action === "APPROVE" && existing.validUntil < new Date()) {
        return fail("INVALID_STATE", "This permit's end time has passed", 409);
      }
    }
    if (body.action !== "APPROVE" && !reason) return fail("VALIDATION", "A reason is required", 400);

    const status = body.action === "APPROVE" ? "ACTIVE" : body.action === "REJECT" ? "REJECTED" : "REVOKED";
    const updated = await db.permit.update({
      where: { id },
      data: { status, approverId: scope.userId, ...(reason ? { revocationReason: reason } : {}) },
    });
    appendAuditLog({
      module: "PERMITS",
      action: `PERMIT_${body.action}`,
      actionType: "MANUAL",
      description: `${existing.permitNumber} ${status}${reason ? `: ${reason}` : ""}`,
      userId: scope.userId,
      siteId: existing.siteId,
    }).catch(() => {});
    return ok({ permit: updated, message: `Permit ${status.toLowerCase()}` });
  }

  // Regular edit: only the requester (or HSSE) and only while it is still pending
  if (!PENDING_STATES.includes(existing.status)) {
    return fail("INVALID_STATE", "Approved or closed permits can't be edited", 409);
  }
  if (existing.requesterId !== scope.userId && !(APPROVER_ROLES as readonly string[]).includes(scope.role)) {
    return fail("FORBIDDEN", "Only the requester can edit this permit", 403);
  }
  const parsed = permitEditSchema.safeParse(body);
  if (!parsed.success) return fail("VALIDATION", zodMessage(parsed.error), 400);
  const e = parsed.data;
  if (e.startDate && e.endDate && e.endDate <= e.startDate) return fail("VALIDATION", "End must be after start", 400);

  const updated = await db.permit.update({
    where: { id },
    data: { title: e.title, description: e.description, type: e.type, riskLevel: e.riskLevel, validFrom: e.startDate, validUntil: e.endDate },
  });
  return ok({ permit: updated, message: "Permit updated" });
}

export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const scope = await requireScopedAuth();
  if (scope instanceof NextResponse) return scope;
  if (!["ADMIN", "HSSE_MANAGER"].includes(scope.role)) {
    return fail("FORBIDDEN", "Insufficient permissions", 403);
  }

  const { id } = await ctx.params;
  const existing = await db.permit.findUnique({ where: { id }, select: { siteId: true } });
  if (!existing) return fail("NOT_FOUND", "Permit not found", 404);
  if (!scope.canSee(existing.siteId)) return fail("NOT_FOUND", "Permit not found", 404);

  await db.permit.delete({ where: { id } });
  return ok({ message: "Permit deleted" });
}
