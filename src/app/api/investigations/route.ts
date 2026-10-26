import { NextRequest, NextResponse } from "next/server";
import { ok, fail }                  from "@/lib/api-response";
import { db }                        from "@/lib/db";
import { requireScopedAuth }         from "@/lib/scoped-auth";
import { appendAuditLog } from "@/lib/security/audit-chain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const scope = await requireScopedAuth();
  if (scope instanceof NextResponse) return scope;

  const sp = req.nextUrl.searchParams;

  // ── ?stats=1 ──────────────────────────────────────────────
  if (sp.get("stats") === "1") {
    const siteFilter = !scope.unrestricted && Array.isArray(scope.siteScope)
      ? { incident: { siteId: { in: scope.siteScope } } }
      : {};
    const [total, open, inReview, closed, withAI] = await Promise.all([
      db.investigation.count({ where: siteFilter }),
      db.investigation.count({ where: { ...siteFilter, status: "OPEN" } }),
      db.investigation.count({ where: { ...siteFilter, status: "IN_REVIEW" } }),
      db.investigation.count({ where: { ...siteFilter, status: "CLOSED" } }),
      db.investigation.count({ where: { ...siteFilter, hasAIEvidence: true } }),
    ]);
    return ok({ total, open, inReview, closed, withAI });
  }

  // ── ?openIncidents=1 — incidents without an investigation ─
  if (sp.get("openIncidents") === "1") {
    const siteWhere = scope.where("siteId");
    const incidents = await db.incident.findMany({
      where: { ...siteWhere, investigation: null },
      orderBy: { occurredAt: "desc" },
      take: 50,
      select: { id: true, incidentNumber: true, title: true, severity: true, status: true, occurredAt: true },
    });
    return ok({ incidents });
  }

  // ── Regular list ──────────────────────────────────────────
  const status = sp.get("status");
  const siteFilter = !scope.unrestricted && Array.isArray(scope.siteScope)
    ? { incident: { siteId: { in: scope.siteScope } } }
    : {};
  const where = { ...siteFilter, ...(status ? { status } : {}) };

  const investigations = await db.investigation.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 100,
    include: {
      incident:         { select: { id: true, incidentNumber: true, title: true, severity: true, siteId: true, occurredAt: true, location: true } },
      leadInvestigator: { select: { name: true, role: true } },
    },
  });
  return ok({ investigations });
}

export async function POST(req: NextRequest) {
  const scope = await requireScopedAuth();
  if (scope instanceof NextResponse) return scope;
  if (!["ADMIN", "HSSE_MANAGER", "SAFETY_OFFICER"].includes(scope.role)) {
    return fail("FORBIDDEN", "Only HSSE staff can open investigations", 403);
  }

  let body: { incidentId: string; rootCause?: string; summary?: string; leadInvestigatorId?: string };
  try { body = await req.json(); }
  catch { return fail("INVALID_BODY", "Invalid JSON", 400); }
  if (!body.incidentId) return fail("MISSING", "incidentId required", 400);

  const incident = await db.incident.findUnique({ where: { id: body.incidentId } });
  if (!incident) return fail("NOT_FOUND", "Incident not found", 404);
  if (!scope.canSee(incident.siteId)) return fail("FORBIDDEN", "No access to that site", 403);

  // Check if investigation already exists
  const existing = await db.investigation.findUnique({ where: { incidentId: body.incidentId } });
  if (existing) return fail("CONFLICT", "Investigation already exists for this incident", 409);

  if (body.leadInvestigatorId && body.leadInvestigatorId !== scope.userId) {
    const lead = await db.user.findUnique({ where: { id: body.leadInvestigatorId }, select: { isActive: true, role: true } });
    if (!lead?.isActive || !["ADMIN", "HSSE_MANAGER", "SAFETY_OFFICER"].includes(lead.role)) {
      return fail("VALIDATION", "leadInvestigatorId: must be an active HSSE user", 400);
    }
  }

  const investigation = await db.investigation.create({
    data: {
      incidentId:         body.incidentId,
      rootCause:          body.rootCause          ?? null,
      summary:            body.summary            ?? null,
      status:             "OPEN",
      leadInvestigatorId: body.leadInvestigatorId ?? scope.userId,
    },
    include: {
      incident:         { select: { incidentNumber: true, title: true, severity: true } },
      leadInvestigator: { select: { name: true, role: true } },
    },
  });

  await appendAuditLog({
      action:      "INVESTIGATION_OPENED",
      module:      "SAFETY",
      actionType:  "MANUAL",
      description: `Opened investigation for ${incident.incidentNumber}`,
      userId:      scope.userId,
    }).catch(() => {});

  return ok({ investigation });
}

// Updates go through PATCH /api/investigations/:id (site-scoped).
