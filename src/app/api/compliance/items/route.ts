import { NextRequest, NextResponse } from "next/server";
import { ok, fail } from "@/lib/api-response";
import { db } from "@/lib/db";
import { requireScopedAuth } from "@/lib/scoped-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const scope = await requireScopedAuth();
  if (scope instanceof NextResponse) return scope;

  const status = req.nextUrl.searchParams.get("status");
  let where: Record<string, unknown> = scope.where("siteId");
  if (status) where = { ...where, status };

  const items = await db.complianceItem.findMany({
    where,
    orderBy: [{ status: "asc" }, { dueDate: "asc" }],
    take: 100,
    include: {
      site: { select: { code: true, name: true } },
      responsible: { select: { name: true, role: true } },
    },
  });
  return ok({ items });
}

interface CreateItemBody {
  title: string;
  regulationRef: string;
  dueDate: string;
  siteId: string;
  responsibleId: string;
  triggersLockdown?: boolean;
}

export async function POST(req: NextRequest) {
  const scope = await requireScopedAuth();
  if (scope instanceof NextResponse) return scope;
  if (!["ADMIN", "HSSE_MANAGER"].includes(scope.role)) {
    return fail("FORBIDDEN", "Only HSSE managers can create compliance items", 403);
  }
  let body: CreateItemBody;
  try { body = await req.json(); } catch { return fail("INVALID_BODY", "Invalid JSON", 400); }
  if (!body.title || !body.regulationRef || !body.dueDate || !body.siteId || !body.responsibleId) {
    return fail("MISSING", "title, regulationRef, dueDate, siteId, responsibleId required", 400);
  }
  if (!scope.canSee(body.siteId)) return fail("FORBIDDEN", "No access to that site", 403);

  const item = await db.complianceItem.create({
    data: {
      title: body.title,
      regulationRef: body.regulationRef,
      status: "PENDING",
      dueDate: new Date(body.dueDate),
      triggersLockdown: body.triggersLockdown ?? false,
      siteId: body.siteId,
      responsibleId: body.responsibleId,
    },
  });
  return ok({ item });
}
