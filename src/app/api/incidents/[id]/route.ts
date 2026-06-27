import { NextRequest } from "next/server";
import { auth } from "@/auth";
import { ok, fail } from "@/lib/api-response";
import { db } from "@/lib/db";
import { log } from "@/lib/observability/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return fail("UNAUTHORIZED", "Sign in required", 401);

  const { id } = await ctx.params;

  const incident = await db.incident.findUnique({
    where: { id },
    include: {
      site:     { select: { id: true, code: true, name: true, nameAr: true } },
      reporter: { select: { id: true, name: true, role: true } },
      assignee: { select: { id: true, name: true, role: true } },
      actions:  { orderBy: { dueDate: "asc" } },
    },
  });

  if (!incident) return fail("NOT_FOUND", "Incident not found", 404);

  let aiAnalysis: Record<string, unknown> | null = null;
  if (incident.aiAnalysis) {
    try { aiAnalysis = JSON.parse(incident.aiAnalysis); } catch { /* ignore */ }
  }

  return ok({
    ...incident,
    occurredAt:  incident.occurredAt.toISOString(),
    reportedAt:  incident.reportedAt.toISOString(),
    resolvedAt:  incident.resolvedAt?.toISOString() ?? null,
    createdAt:   incident.createdAt.toISOString(),
    updatedAt:   incident.updatedAt.toISOString(),
    aiAnalysis,
  });
}

// ─── PATCH ────────────────────────────────────────────────────────────────────

const ALLOWED_ROLES = ["ADMIN", "HSSE_MANAGER", "SAFETY_OFFICER", "SUPERVISOR"] as const;

// Only fields that exist on the Incident model
const UPDATABLE_FIELDS = [
  "status",
  "severity",
  "assigneeId",
  "title",
  "description",
  "location",
  "type",
] as const;

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return fail("UNAUTHORIZED", "Sign in required", 401);

  const userRole = session.user.role as string;
  if (!ALLOWED_ROLES.includes(userRole as typeof ALLOWED_ROLES[number])) {
    return fail("FORBIDDEN", "Insufficient role to update incidents", 403);
  }

  const { id } = await ctx.params;

  const existing = await db.incident.findUnique({
    where: { id },
    select: { id: true, status: true, incidentNumber: true, severity: true },
  });
  if (!existing) return fail("NOT_FOUND", "Incident not found", 404);

  const body = (await req.json()) as Record<string, unknown>;

  // Only allow safe fields
  const data: Record<string, unknown> = {};
  for (const key of UPDATABLE_FIELDS) {
    if (key in body) data[key] = body[key];
  }
  if (Object.keys(data).length === 0) {
    return fail("BAD_REQUEST", "No updatable fields provided", 400);
  }

  // Timestamp status transitions
  const newStatus = data.status as string | undefined;
  const statusChanged = newStatus && newStatus !== existing.status;
  if (statusChanged && (newStatus === "RESOLVED" || newStatus === "CLOSED")) {
    data.resolvedAt = new Date();
  }

  const updated = await db.incident.update({
    where: { id },
    data: data as Parameters<typeof db.incident.update>[0]["data"],
    select: {
      id: true,
      incidentNumber: true,
      status: true,
      severity: true,
      title: true,
      updatedAt: true,
    },
  });

  // Audit log
  await db.auditLog.create({
    data: {
      module: "SAFETY",
      action: "INCIDENT_UPDATED",
      actionType: "MANUAL",
      isAutonomous: false,
      description: `Incident ${existing.incidentNumber} updated${
        statusChanged ? ` — status: ${existing.status} → ${newStatus}` : ""
      }`,
      metadata: JSON.stringify({
        incidentId: id,
        changes: data,
        previousStatus: existing.status,
      }),
      riskLevel: updated.severity,
      userId: session.user.id,
    },
  });

  // ── Brain learning hooks (fire-and-forget, never blocks the response) ──────
  if (statusChanged && (newStatus === "RESOLVED" || newStatus === "CLOSED")) {
    fireIncidentLearning(id);
  }

  return ok(updated);
}

// ─── Fire-and-forget learning hooks ──────────────────────────────────────────

function fireIncidentLearning(incidentId: string) {
  void (async () => {
    try {
      const { recordOutcome, distillIncidentLearning } = await import("@/lib/brain/learning");

      const { updated } = await recordOutcome({
        entityType: "incident",
        entityId: incidentId,
        outcome: "CORRECT",
      });
      log.info("Brain outcome recorded for resolved incident", { incidentId, memoriesUpdated: updated });

      const memoryId = await distillIncidentLearning(incidentId);
      if (memoryId) {
        log.info("Brain distilled learning from resolved incident", { incidentId, memoryId });
      }
    } catch (err) {
      log.error("Brain learning hooks failed", err, { incidentId });
    }
  })();
}