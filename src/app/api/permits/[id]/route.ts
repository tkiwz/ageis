import { NextRequest, NextResponse } from "next/server";
import { ok, fail } from "@/lib/api-response";
import { db } from "@/lib/db";
import { requireScopedAuth } from "@/lib/scoped-auth";

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
  const existing = await db.permit.findUnique({ where: { id }, select: { siteId: true } });
  if (!existing) return fail("NOT_FOUND", "Permit not found", 404);
  if (!scope.canSee(existing.siteId)) return fail("NOT_FOUND", "Permit not found", 404);

  // Approve / Reject action
  if (body.action === "APPROVE" || body.action === "REJECT") {
    if (!["ADMIN", "HSSE_MANAGER", "SAFETY_OFFICER"].includes(scope.role)) {
      return fail("FORBIDDEN", "Only HSSE/Safety can approve permits", 403);
    }
    const updated = await db.permit.update({
      where: { id },
      data: {
        status:     body.action === "APPROVE" ? "ACTIVE" : "REJECTED",
        approverId: scope.userId,
      },
    });
    return ok({ permit: updated, message: `Permit ${body.action === "APPROVE" ? "approved" : "rejected"}` });
  }

  // Regular update
  try {
    const updated = await db.permit.update({
      where: { id },
      data: {
        title:       body.title,
        description: body.description,
        type:        body.type,
        riskLevel:   body.riskLevel,
        validFrom:   body.startDate ? new Date(body.startDate) : undefined,
        validUntil:  body.endDate   ? new Date(body.endDate)   : undefined,
      },
    });
    return ok({ permit: updated, message: "Permit updated" });
  } catch {
    return fail("NOT_FOUND", "Permit not found", 404);
  }
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
