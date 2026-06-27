import { NextRequest, NextResponse } from "next/server";
import { ok, fail } from "@/lib/api-response";
import { db } from "@/lib/db";
import { requireScopedAuth } from "@/lib/scoped-auth";
import { analyzeAutonomously } from "@/lib/autonomy/pipeline-analyzer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const scope = await requireScopedAuth();
  if (scope instanceof NextResponse) return scope;
  if (!["ADMIN", "HSSE_MANAGER", "SAFETY_OFFICER"].includes(scope.role)) {
    return fail("FORBIDDEN", "Only HSSE staff can review AI suggestions", 403);
  }

  const status = req.nextUrl.searchParams.get("status") ?? "PENDING";
  const where: Record<string, unknown> = { status };

  // Scope by site (suggestions store siteId)
  if (!scope.unrestricted) {
    Object.assign(where, scope.where("siteId"));
  }

  const suggestions = await db.aISuggestion.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  return ok({ suggestions });
}

interface ReviewBody {
  id: string;
  action: "APPROVE" | "REJECT";
  notes?: string;
}

export async function PATCH(req: NextRequest) {
  const scope = await requireScopedAuth();
  if (scope instanceof NextResponse) return scope;
  if (!["ADMIN", "HSSE_MANAGER", "SAFETY_OFFICER"].includes(scope.role)) {
    return fail("FORBIDDEN", "Only HSSE staff can approve AI suggestions", 403);
  }

  let body: ReviewBody;
  try { body = await req.json(); } catch { return fail("INVALID_BODY", "Invalid JSON", 400); }
  if (!body.id || !["APPROVE", "REJECT"].includes(body.action)) {
    return fail("INVALID", "id + action (APPROVE|REJECT) required", 400);
  }

  const suggestion = await db.aISuggestion.findUnique({ where: { id: body.id } });
  if (!suggestion) return fail("NOT_FOUND", "Suggestion not found", 404);
  if (suggestion.status !== "PENDING") {
    return fail("ALREADY_HANDLED", `Suggestion already ${suggestion.status}`, 409);
  }

  // Enforce site scope
  if (!scope.canSee(suggestion.siteId)) {
    return fail("NOT_FOUND", "Suggestion not found", 404);
  }

  if (body.action === "REJECT") {
    const rejected = await db.aISuggestion.update({
      where: { id: body.id },
      data: {
        status: "REJECTED",
        reviewedById: scope.userId,
        reviewedAt: new Date(),
        reviewerNotes: body.notes ?? null,
      },
    });
    await db.auditLog.create({
      data: {
        module: "INTELLIGENCE",
        action: "AI_SUGGESTION_REJECTED",
        actionType: "MANUAL",
        isAutonomous: false,
        description: `${scope.email ?? scope.userId} rejected suggestion ${suggestion.id} (type=${suggestion.type})`,
        metadata: JSON.stringify({ suggestionId: suggestion.id, notes: body.notes }),
        riskLevel: "LOW",
        siteId: suggestion.siteId,
        userId: scope.userId,
      },
    });
    return ok({ suggestion: rejected });
  }

  // APPROVE → run the cascade with autoCascadeThreshold = 0 (force)
  if (suggestion.type === "PIPELINE_LEAK") {
    const result = await analyzeAutonomously(suggestion.subjectId, {
      manualTrigger: true,
      triggeredByUserId: scope.userId,
      autoCascadeThreshold: 0, // force cascade regardless of confidence
    });

    const approved = await db.aISuggestion.update({
      where: { id: body.id },
      data: {
        status: result.leakAlertId ? "EXECUTED" : "APPROVED",
        reviewedById: scope.userId,
        reviewedAt: new Date(),
        reviewerNotes: body.notes ?? null,
        resultRefs: JSON.stringify({
          leakAlertId: result.leakAlertId,
          incidentId: result.incidentId,
          emergencyId: result.emergencyId,
        }),
      },
    });

    await db.auditLog.create({
      data: {
        module: "INTELLIGENCE",
        action: "AI_SUGGESTION_APPROVED",
        actionType: "MANUAL",
        isAutonomous: false,
        description: `${scope.email ?? scope.userId} approved suggestion ${suggestion.id} → cascade executed`,
        metadata: JSON.stringify({ suggestionId: suggestion.id, result }),
        riskLevel: suggestion.severity ?? "MEDIUM",
        siteId: suggestion.siteId,
        userId: scope.userId,
      },
    });

    return ok({ suggestion: approved, executed: result });
  }

  return fail("UNSUPPORTED_TYPE", `Approval flow for type=${suggestion.type} not implemented`, 501);
}
