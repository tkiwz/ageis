import { NextRequest, NextResponse } from "next/server";
import { ok, fail }                  from "@/lib/api-response";
import { db }                        from "@/lib/db";
import { requireScopedAuth }         from "@/lib/scoped-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const scope = await requireScopedAuth();
  if (scope instanceof NextResponse) return scope;

  const sp = req.nextUrl.searchParams;

  // ── ?stats=1 ──────────────────────────────────────────────
  if (sp.get("stats") === "1") {
    const where = scope.where("siteId");
    const [total, draft, approved, expired, withAI] = await Promise.all([
      db.riskAssessment.count({ where }),
      db.riskAssessment.count({ where: { ...where, status: "DRAFT" } }),
      db.riskAssessment.count({ where: { ...where, status: "APPROVED" } }),
      db.riskAssessment.count({ where: { ...where, status: "EXPIRED" } }),
      db.riskAssessment.count({ where: { ...where, aiSuggested: true } }),
    ]);
    return ok({ total, draft, approved, expired, withAI });
  }

  // ── Regular list ──────────────────────────────────────────
  const status = sp.get("status");
  let where: Record<string, unknown> = scope.where("siteId");
  if (status) where = { ...where, status };

  const assessments = await db.riskAssessment.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 100,
    include: {
      site:        { select: { code: true, name: true } },
      conductedBy: { select: { name: true, role: true } },
      permit:      { select: { id: true, permitNumber: true, title: true, status: true } },
    },
  });
  return ok({ assessments });
}

interface CreateBody {
  title:             string;
  type:              string;
  hazardDescription: string;
  riskBefore:        string;
  controlsSuggested: string;
  riskAfter:         string;
  siteId:            string;
  aiSuggested?:      boolean;
  permitId?:         string;
}

export async function POST(req: NextRequest) {
  const scope = await requireScopedAuth();
  if (scope instanceof NextResponse) return scope;

  let body: CreateBody;
  try { body = await req.json(); } catch { return fail("INVALID_BODY", "Invalid JSON", 400); }
  if (!body.title || !body.type || !body.hazardDescription || !body.siteId) {
    return fail("MISSING", "title, type, hazardDescription, siteId required", 400);
  }
  if (!scope.canSee(body.siteId)) return fail("FORBIDDEN", "No access to that site", 403);

  const assessment = await db.riskAssessment.create({
    data: {
      title:             body.title,
      type:              body.type,
      hazardDescription: body.hazardDescription,
      riskBefore:        body.riskBefore        ?? "MEDIUM",
      controlsSuggested: body.controlsSuggested ?? "",
      riskAfter:         body.riskAfter         ?? "LOW",
      status:            "DRAFT",
      aiSuggested:       body.aiSuggested       ?? false,
      siteId:            body.siteId,
      conductedById:     scope.userId,
      permitId:          body.permitId          ?? null,
    },
    include: {
      site:        { select: { code: true, name: true } },
      conductedBy: { select: { name: true, role: true } },
      permit:      { select: { id: true, permitNumber: true, title: true, status: true } },
    },
  });
  return ok({ assessment });
}

// ── PATCH — update status / fields ────────────────────────
export async function PATCH(req: NextRequest) {
  const scope = await requireScopedAuth();
  if (scope instanceof NextResponse) return scope;

  let body: { id: string; status?: string; controlsSuggested?: string; riskAfter?: string; aiSuggested?: boolean; permitId?: string | null };
  try { body = await req.json(); } catch { return fail("INVALID_BODY", "Invalid JSON", 400); }
  if (!body.id) return fail("MISSING", "id required", 400);

  const existing = await db.riskAssessment.findUnique({ where: { id: body.id } });
  if (!existing) return fail("NOT_FOUND", "Assessment not found", 404);
  if (!scope.canSee(existing.siteId)) return fail("FORBIDDEN", "No access", 403);

  const data: Record<string, unknown> = {};
  if (body.status            !== undefined) data.status            = body.status;
  if (body.controlsSuggested !== undefined) data.controlsSuggested = body.controlsSuggested;
  if (body.riskAfter         !== undefined) data.riskAfter         = body.riskAfter;
  if (body.aiSuggested       !== undefined) data.aiSuggested       = body.aiSuggested;
  if (body.permitId          !== undefined) data.permitId          = body.permitId;

  const updated = await db.riskAssessment.update({ where: { id: body.id }, data });
  return ok({ assessment: updated });
}
