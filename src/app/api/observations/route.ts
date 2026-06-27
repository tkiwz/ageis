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
  const type = req.nextUrl.searchParams.get("type");
  let where: Record<string, unknown> = scope.where("siteId");
  if (status) where = { ...where, status };
  if (type) where = { ...where, type };

  const observations = await db.observation.findMany({
    where,
    orderBy: { observedAt: "desc" },
    take: 100,
    include: {
      site: { select: { code: true, name: true } },
      reportedBy: { select: { name: true, role: true } },
    },
  });
  return ok({ observations });
}

interface CreateObservationBody {
  type: string;
  location: string;
  findings: string;
  unsafeDetail?: string;
  contractor?: string;
  siteId: string;
}

export async function POST(req: NextRequest) {
  const scope = await requireScopedAuth();
  if (scope instanceof NextResponse) return scope;

  let body: CreateObservationBody;
  try { body = await req.json(); } catch { return fail("INVALID_BODY", "Invalid JSON", 400); }
  if (!body.type || !body.location || !body.findings || !body.siteId) {
    return fail("MISSING", "type, location, findings, siteId required", 400);
  }
  if (!scope.canSee(body.siteId)) return fail("FORBIDDEN", "No access to that site", 403);

  const count = await db.observation.count();
  const recordNumber = `OBS-${new Date().getFullYear()}-${String(count + 1).padStart(4, "0")}`;
  const obs = await db.observation.create({
    data: {
      recordNumber,
      type: body.type,
      status: "OPEN",
      location: body.location,
      findings: body.findings,
      unsafeDetail: body.unsafeDetail,
      contractor: body.contractor,
      observedAt: new Date(),
      siteId: body.siteId,
      reportedById: scope.userId,
    },
  });
  return ok({ observation: obs });
}
