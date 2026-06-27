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

  const inspections = await db.inspection.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 100,
    include: {
      site: { select: { code: true, name: true } },
      conductedBy: { select: { name: true, role: true } },
    },
  });
  return ok({ inspections });
}

interface CreateInspectionBody {
  title: string;
  type: string;
  siteId: string;
}

export async function POST(req: NextRequest) {
  const scope = await requireScopedAuth();
  if (scope instanceof NextResponse) return scope;
  if (!["ADMIN", "HSSE_MANAGER", "SAFETY_OFFICER"].includes(scope.role)) {
    return fail("FORBIDDEN", "Only HSSE staff can schedule inspections", 403);
  }

  let body: CreateInspectionBody;
  try { body = await req.json(); } catch { return fail("INVALID_BODY", "Invalid JSON", 400); }
  if (!body.title || !body.type || !body.siteId) {
    return fail("MISSING", "title, type, siteId required", 400);
  }
  if (!scope.canSee(body.siteId)) return fail("FORBIDDEN", "No access to that site", 403);

  const ins = await db.inspection.create({
    data: {
      title: body.title,
      type: body.type,
      status: "SCHEDULED",
      siteId: body.siteId,
      conductedById: scope.userId,
    },
  });
  return ok({ inspection: ins });
}
