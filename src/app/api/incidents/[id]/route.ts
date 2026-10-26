import { NextRequest } from "next/server";
import { z } from "zod";
import { zodMessage } from "@/lib/validations/api";
import { auth } from "@/auth";
import { ok, fail } from "@/lib/api-response";
import { db } from "@/lib/db";
import { log } from "@/lib/observability/logger";
import { denyUnlessSiteVisible } from "@/lib/security/site-guard";
import { appendAuditLog } from "@/lib/security/audit-chain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return fail("UNAUTHORIZED", "Sign in required", 401);

  const { id } = await ctx.params;

  const hidden = await denyUnlessSiteVisible("incident", id);

  if (hidden) return hidden;

  const incident = await db.incident.findUnique({
    where: { id },
    include: {
      site:     { select: { id: true, code: true, name: true, nameAr: true } },
      reporter: { select: { id: true, name: true, role: true } },
      assignee: { select: { id: true, name: true, role: true } },
      actions:  { orderBy: { dueDate: "asc" } },
      photos:   { select: { id: true }, orderBy: { createdAt: "asc" } },
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
const incidentPatchSchema = z
  .object({
    status: z.enum(["REPORTED", "INVESTIGATING", "ESCALATED", "CONTAINED", "RESOLVED", "CLOSED"]),
    severity: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]),
    assigneeId: z.string().min(1).max(40).nullable(),
    title: z.string().trim().min(3).max(200),
    description: z.string().trim().min(3).max(8000),
    location: z.string().trim().max(300),
    type: z.string().trim().min(2).max(40),
  })
  .partial()
  .strict();

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return fail("UNAUTHORIZED", "Sign in required", 401);

  const userRole = session.user.role as string;
  if (!ALLOWED_ROLES.includes(userRole as typeof ALLOWED_ROLES[number])) {
    return fail("FORBIDDEN", "Insufficient role to update incidents", 403);
  }

  const { id } = await ctx.params;

  const hidden = await denyUnlessSiteVisible("incident", id);

  if (hidden) return hidden;

  const existing = await db.incident.findUnique({
    where: { id },
    select: { id: true, status: true, incidentNumber: true, severity: true },
  });
  if (!existing) return fail("NOT_FOUND", "Incident not found", 404);

  const parsed = incidentPatchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail("VALIDATION", zodMessage(parsed.error), 400);
  const data: Record<string, unknown> = { ...parsed.data };
  if (Object.keys(data).length === 0) {
    return fail("BAD_REQUEST", "No updatable fields provided", 400);
  }

  // Assignee must be an active user who can work on this incident's site
  if (parsed.data.assigneeId) {
    const incidentSite = await db.incident.findUnique({ where: { id }, select: { siteId: true } });
    const assignee = await db.user.findUnique({ where: { id: parsed.data.assigneeId }, select: { isActive: true, role: true } });
    const siteOk =
      assignee && ["ADMIN", "HSSE_MANAGER"].includes(assignee.role)
        ? true
        : !!(await db.userSiteAccess.findFirst({ where: { userId: parsed.data.assigneeId, siteId: incidentSite!.siteId }, select: { id: true } }));
    if (!assignee?.isActive || !siteOk) return fail("VALIDATION", "assigneeId: user can't be assigned to this site", 400);
  }

  // Timestamp status transitions (reopen clears the resolution time)
  const newStatus = data.status as string | undefined;
  const statusChanged = newStatus && newStatus !== existing.status;
  if (statusChanged && (newStatus === "RESOLVED" || newStatus === "CLOSED")) {
    data.resolvedAt = new Date();
  } else if (statusChanged && ["RESOLVED", "CLOSED"].includes(existing.status)) {
    data.resolvedAt = null;
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
  await appendAuditLog({
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