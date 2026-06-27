import { NextRequest, NextResponse } from "next/server";
import { ok, fail } from "@/lib/api-response";
import { db } from "@/lib/db";
import { requireScopedAuth } from "@/lib/scoped-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const scope = await requireScopedAuth();
  if (scope instanceof NextResponse) return scope;

  // Restrict the visible site list to ones the user has access to.
  const where = scope.where("id"); // Site.id (not siteId here)
  const sites = await db.site.findMany({
    where,
    orderBy: { name: "asc" },
    include: {
      _count: {
        select: {
          incidents: { where: { status: { in: ["REPORTED", "INVESTIGATING"] } } },
          permits:   { where: { status: "ACTIVE" } },
          devices:   true,
        },
      },
    },
  });

  return ok(sites.map((s) => ({
    id: s.id,
    code: s.code,
    name: s.name,
    nameAr: s.nameAr,
    productionType: s.productionType,
    status: s.status,
    riskLevel: s.riskLevel,
    latitude: s.latitude,
    longitude: s.longitude,
    capacity: s.capacity,
    activeIncidents: s._count.incidents,
    activePermits:   s._count.permits,
    sensorCount:     s._count.devices,
  })));
}

interface SitePayload {
  code: string;
  name: string;
  nameAr?: string;
  productionType: string;
  status?: string;
  riskLevel?: string;
  latitude: number;
  longitude: number;
  capacity?: number;
}

export async function POST(req: NextRequest) {
  const scope = await requireScopedAuth();
  if (scope instanceof NextResponse) return scope;
  if (!["ADMIN", "HSSE_MANAGER"].includes(scope.role)) {
    return fail("FORBIDDEN", "Only ADMIN/HSSE_MANAGER can create sites", 403);
  }

  let body: SitePayload;
  try { body = await req.json(); }
  catch { return fail("INVALID_BODY", "Invalid JSON", 400); }

  if (!body.code || !body.name || !body.productionType ||
      typeof body.latitude !== "number" || typeof body.longitude !== "number") {
    return fail("MISSING_FIELDS", "code, name, productionType, latitude, longitude required", 400);
  }

  const existing = await db.site.findUnique({ where: { code: body.code } });
  if (existing) return fail("DUPLICATE", `Site code ${body.code} already exists`, 409);

  const site = await db.site.create({
    data: {
      code:           body.code,
      name:           body.name,
      nameAr:         body.nameAr ?? null,
      productionType: body.productionType,
      status:         body.status    ?? "ACTIVE",
      riskLevel:      body.riskLevel ?? "LOW",
      latitude:       body.latitude,
      longitude:      body.longitude,
      capacity:       body.capacity  ?? 0,
    },
  });

  return ok({ site, message: "Site created successfully" });
}
