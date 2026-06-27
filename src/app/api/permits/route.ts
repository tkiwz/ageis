import { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { ok, fail } from "@/lib/api-response";
import { db } from "@/lib/db";
import { requireScopedAuth } from "@/lib/scoped-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const scope = await requireScopedAuth();
  if (scope instanceof NextResponse) return scope;

  const url = new URL(req.url);
  const limit = parseInt(url.searchParams.get("limit") ?? "50", 10);
  const status = url.searchParams.get("status");
  const mine = url.searchParams.get("mine") === "1";

  // Build where clause: site scope + optional status + optional "mine" filter
  let where: Record<string, unknown> = scope.where("siteId");
  if (status) where = { ...where, status };
  if (mine) where = { ...where, requesterId: scope.userId };

  const permits = await db.permit.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: limit,
    include: {
      site:      { select: { code: true, name: true, nameAr: true } },
      requester: { select: { name: true, role: true } },
      approver:  { select: { name: true, role: true } },
    },
  });

  return ok({
    permits: permits.map((p) => ({
      id: p.id,
      permitNumber: p.permitNumber,
      title: p.title,
      description: p.description,
      type: p.type,
      status: p.status,
      riskLevel: p.riskLevel,
      location: p.location,
      validFrom: p.validFrom.toISOString(),
      validUntil: p.validUntil.toISOString(),
      createdAt: p.createdAt.toISOString(),
      site: p.site,
      requestedBy: p.requester,
      approvedBy: p.approver,
    })),
  });
}

interface PermitPayload {
  title: string;
  description: string;
  type: string;
  siteId: string;
  startDate?: string;
  endDate?: string;
  riskLevel?: string;
}

export async function POST(req: NextRequest) {
  const scope = await requireScopedAuth();
  if (scope instanceof NextResponse) return scope;

  let body: PermitPayload;
  try { body = await req.json(); }
  catch { return fail("INVALID_BODY", "Invalid JSON", 400); }

  if (!body.title || !body.description || !body.type || !body.siteId) {
    return fail("MISSING_FIELDS", "title, description, type, siteId required", 400);
  }

  // CRITICAL: enforce site scope on create as well — a contractor cannot create
  // a permit for a site they don't have access to.
  if (!scope.canSee(body.siteId)) {
    return fail("FORBIDDEN", "You do not have access to this site", 403);
  }

  const site = await db.site.findUnique({
    where: { id: body.siteId },
    select: { name: true },
  });
  if (!site) return fail("SITE_NOT_FOUND", "Site does not exist", 404);

  const now = new Date();
  const end = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const startD = body.startDate ? new Date(body.startDate) : now;
  const endD   = body.endDate   ? new Date(body.endDate)   : end;

  const permit = await db.permit.create({
    data: {
      permitNumber: `PTW-${Date.now().toString().slice(-8)}`,
      title:        body.title,
      description:  body.description,
      type:         body.type,
      status:       "PENDING",
      riskLevel:    body.riskLevel ?? "MEDIUM",
      location:     site.name,
      siteId:       body.siteId,
      requesterId:  scope.userId,
      validFrom:    startD,
      validUntil:   endD,
    },
    include: {
      site: { select: { code: true, name: true } },
    },
  });

  return ok({ permit, message: "Permit created successfully" });
}
