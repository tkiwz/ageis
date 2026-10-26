import { NextRequest, NextResponse } from "next/server";
import { z }                         from "zod";
import { ok, fail }                  from "@/lib/api-response";
import { db }                        from "@/lib/db";
import { requireScopedAuth }         from "@/lib/scoped-auth";
import { denyUnlessRole } from "@/lib/security/api-guard";
import { ROLE_GROUPS } from "@/lib/rbac";
import { appendAuditLog } from "@/lib/security/audit-chain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RISK = z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]);
const TYPE = z.enum([
  "CHEMICAL", "PHYSICAL", "ELECTRICAL", "FIRE", "ERGONOMIC", "BIOLOGICAL",
  "PROCESS_SAFETY", "MECHANICAL", "ENVIRONMENTAL", "GENERAL",
]);
const STATUS = z.enum(["DRAFT", "APPROVED", "EXPIRED"]);
/** Permits a risk assessment can still be attached to. */
const LINKABLE_PERMIT = ["DRAFT", "PENDING", "SUBMITTED", "IN_REVIEW", "APPROVED", "ACTIVE"];

const INCLUDE = {
  site:        { select: { code: true, name: true } },
  conductedBy: { select: { name: true, role: true } },
  permit:      { select: { id: true, permitNumber: true, title: true, status: true } },
} as const;

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
  const status = STATUS.safeParse(sp.get("status"));
  let where: Record<string, unknown> = scope.where("siteId");
  if (status.success) where = { ...where, status: status.data };

  const assessments = await db.riskAssessment.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 100,
    include: INCLUDE,
  });
  return ok({ assessments });
}

/** Permit must exist, be on the same site and still be open. */
async function permitProblem(permitId: string, siteId: string): Promise<string | null> {
  const permit = await db.permit.findUnique({ where: { id: permitId }, select: { siteId: true, status: true } });
  if (!permit || permit.siteId !== siteId) return "Permit not found on this site";
  if (!LINKABLE_PERMIT.includes(permit.status)) return "Permit is closed";
  return null;
}

const createSchema = z.object({
  title:             z.string().trim().min(3).max(200),
  type:              TYPE,
  hazardDescription: z.string().trim().min(10).max(5000),
  riskBefore:        RISK.default("MEDIUM"),
  controlsSuggested: z.string().trim().max(8000).default(""),
  riskAfter:         RISK.default("LOW"),
  siteId:            z.string().min(1).max(40),
  aiSuggested:       z.boolean().default(false),
  permitId:          z.string().min(1).max(40).nullish(),
});

export async function POST(req: NextRequest) {
  const denied = await denyUnlessRole(ROLE_GROUPS.SUPERVISE);
  if (denied) return denied;
  const scope = await requireScopedAuth();
  if (scope instanceof NextResponse) return scope;

  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    const f = parsed.error.issues[0];
    return fail("VALIDATION", `${f?.path.join(".") || "body"}: ${f?.message ?? "invalid"}`, 400);
  }
  const body = parsed.data;
  if (!scope.canSee(body.siteId)) return fail("FORBIDDEN", "No access to that site", 403);
  if (body.permitId) {
    const problem = await permitProblem(body.permitId, body.siteId);
    if (problem) return fail("VALIDATION", problem, 400);
  }

  const assessment = await db.riskAssessment.create({
    data: {
      title:             body.title,
      type:              body.type,
      hazardDescription: body.hazardDescription,
      riskBefore:        body.riskBefore,
      controlsSuggested: body.controlsSuggested,
      riskAfter:         body.riskAfter,
      status:            "DRAFT",
      aiSuggested:       body.aiSuggested,
      siteId:            body.siteId,
      conductedById:     scope.userId,
      permitId:          body.permitId ?? null,
    },
    include: INCLUDE,
  });
  await appendAuditLog({
    module: "RISK",
    action: "RISK_ASSESSMENT_CREATED",
    description: `Risk assessment "${assessment.title}" (${assessment.riskBefore} → ${assessment.riskAfter})`,
    riskLevel: assessment.riskBefore,
    userId: scope.userId,
    siteId: assessment.siteId,
  });
  return ok({ assessment });
}

// ── PATCH — update status / fields ────────────────────────
const patchSchema = z.object({
  id:                z.string().min(1).max(40),
  status:            STATUS.optional(),
  controlsSuggested: z.string().trim().max(8000).optional(),
  riskAfter:         RISK.optional(),
  aiSuggested:       z.boolean().optional(),
  permitId:          z.string().min(1).max(40).nullable().optional(),
}).strict();

/** Allowed status moves: draft → approved → expired. */
const NEXT_STATUS: Record<string, string[]> = { DRAFT: ["APPROVED"], APPROVED: ["EXPIRED"], EXPIRED: [] };

export async function PATCH(req: NextRequest) {
  const denied = await denyUnlessRole(ROLE_GROUPS.SUPERVISE);
  if (denied) return denied;
  const scope = await requireScopedAuth();
  if (scope instanceof NextResponse) return scope;

  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    const f = parsed.error.issues[0];
    return fail("VALIDATION", `${f?.path.join(".") || "body"}: ${f?.message ?? "invalid"}`, 400);
  }
  const body = parsed.data;

  const existing = await db.riskAssessment.findUnique({ where: { id: body.id } });
  if (!existing) return fail("NOT_FOUND", "Assessment not found", 404);
  if (!scope.canSee(existing.siteId)) return fail("FORBIDDEN", "No access", 403);

  const statusChange = body.status !== undefined && body.status !== existing.status;
  if (statusChange) {
    if (!NEXT_STATUS[existing.status]?.includes(body.status!)) {
      return fail("INVALID_STATE", `Cannot move from ${existing.status} to ${body.status}`, 409);
    }
    if (body.status === "APPROVED") {
      // Approval is a safety sign-off: safety roles only, never your own assessment
      if (!(ROLE_GROUPS.SAFETY as readonly string[]).includes(scope.role)) {
        return fail("FORBIDDEN", "Only safety officers or managers can approve", 403);
      }
      if (existing.conductedById === scope.userId) {
        return fail("SELF_APPROVAL", "You cannot approve your own assessment", 403);
      }
      if (!(body.controlsSuggested ?? existing.controlsSuggested).trim()) {
        return fail("VALIDATION", "Controls are required before approval", 400);
      }
    }
  }

  // Content is frozen once approved
  const editsContent = body.controlsSuggested !== undefined || body.riskAfter !== undefined || body.aiSuggested !== undefined;
  if (editsContent && existing.status !== "DRAFT") {
    return fail("INVALID_STATE", "Only draft assessments can be edited", 409);
  }
  if (body.permitId) {
    const problem = await permitProblem(body.permitId, existing.siteId);
    if (problem) return fail("VALIDATION", problem, 400);
  }

  const data: Record<string, unknown> = {};
  if (body.status            !== undefined) data.status            = body.status;
  if (body.controlsSuggested !== undefined) data.controlsSuggested = body.controlsSuggested;
  if (body.riskAfter         !== undefined) data.riskAfter         = body.riskAfter;
  if (body.aiSuggested       !== undefined) data.aiSuggested       = body.aiSuggested;
  if (body.permitId          !== undefined) data.permitId          = body.permitId;

  const updated = await db.riskAssessment.update({ where: { id: body.id }, data, include: INCLUDE });
  await appendAuditLog({
    module: "RISK",
    action: statusChange ? `RISK_ASSESSMENT_${body.status}` : "RISK_ASSESSMENT_UPDATED",
    description: statusChange
      ? `Risk assessment "${existing.title}": ${existing.status} → ${body.status}`
      : `Risk assessment "${existing.title}" updated (${Object.keys(data).join(", ")})`,
    riskLevel: existing.riskBefore,
    userId: scope.userId,
    siteId: existing.siteId,
  });
  return ok({ assessment: updated });
}
