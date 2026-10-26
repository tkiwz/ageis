// POST /api/inspections/[id]/create-incident
// Creates a new Incident from a FAILED inspection.
// Returns the new incidentId so the UI can redirect.

import { NextRequest } from "next/server";
import { auth } from "@/auth";
import { ok, fail } from "@/lib/api-response";
import { db } from "@/lib/db";
import { denyUnlessRole } from "@/lib/security/api-guard";
import { ROLE_GROUPS } from "@/lib/rbac";
import { denyUnlessSiteVisible } from "@/lib/security/site-guard";
import { appendAuditLog } from "@/lib/security/audit-chain";
import { isNumberClash, nextIncidentNumber } from "@/lib/incidents/number";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const denied = await denyUnlessRole(ROLE_GROUPS.SAFETY);
  if (denied) return denied;
  const { id } = await params;
  const hidden = await denyUnlessSiteVisible("inspection", id);
  if (hidden) return hidden;

  const session = await auth();
  if (!session?.user) return fail("UNAUTHORIZED", "Sign in required", 401);

  const inspection = await db.inspection.findUnique({
    where:   { id },
    include: { site: true, conductedBy: true },
  });

  if (!inspection) return fail("NOT_FOUND", "Inspection not found", 404);
  if (inspection.status !== "FAILED") {
    return fail("INVALID_STATE", "Only FAILED inspections can create incidents", 422);
  }

  // Idempotency — one incident per failed inspection
  const key = `insp-fail-${id}`;
  const existing = await db.incident.findFirst({ where: { idempotencyKey: key } });
  if (existing) return ok({ incidentId: existing.id, existing: true });

  const data = {
    idempotencyKey: key,
    title:          `[INSPECTION] ${inspection.title}`,
    description:    `Incident created from failed inspection.\n\n` +
                    `Type: ${inspection.type}\n` +
                    `Inspector: ${inspection.conductedBy.name}\n` +
                    `Notes: ${inspection.notes ?? "None"}`,
    type:           "INSPECTION_FAILURE",
    severity:       "MEDIUM",
    status:         "REPORTED",
    location:       inspection.site.name,
    occurredAt:     inspection.conductedAt ?? new Date(),
    isAutoEscalated: false,
    siteId:         inspection.siteId,
    reporterId:     session.user.id,
  };

  // Retry on a number clash (two reports at the same moment)
  let incident;
  for (let attempt = 0; ; attempt++) {
    try {
      incident = await db.incident.create({ data: { ...data, incidentNumber: await nextIncidentNumber(db, attempt) } });
      break;
    } catch (err) {
      if (!isNumberClash(err) || attempt >= 4) throw err;
    }
  }

  await appendAuditLog({
    module: "INCIDENT",
    action: "INCIDENT_FROM_INSPECTION",
    description: `${incident.incidentNumber} created from failed inspection "${inspection.title}"`,
    riskLevel: "MEDIUM",
    userId: session.user.id,
    siteId: inspection.siteId,
  });
  return ok({ incidentId: incident.id, existing: false });
}
