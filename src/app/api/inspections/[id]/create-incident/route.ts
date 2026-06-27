// POST /api/inspections/[id]/create-incident
// Creates a new Incident from a FAILED inspection.
// Returns the new incidentId so the UI can redirect.

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { ok, fail } from "@/lib/api-response";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const session = await auth();
  if (!session?.user) return fail("UNAUTHORIZED", "Sign in required", 401) as unknown as Response;

  const inspection = await db.inspection.findUnique({
    where:   { id },
    include: { site: true, conductedBy: true },
  });

  if (!inspection) return fail("NOT_FOUND", "Inspection not found", 404) as unknown as Response;
  if (inspection.status !== "FAILED") {
    return fail("INVALID_STATE", "Only FAILED inspections can create incidents", 422) as unknown as Response;
  }

  // Idempotency — one incident per failed inspection
  const existing = await db.incident.findFirst({
    where: { idempotencyKey: `insp-fail-${id}` },
  });
  if (existing) {
    return NextResponse.json({ ok: true, data: { incidentId: existing.id, existing: true } });
  }

  const count = await db.incident.count();
  const year  = new Date().getFullYear();
  const incidentNumber = `INC-${year}-${String(count + 1).padStart(4, "0")}`;

  const incident = await db.incident.create({
    data: {
      incidentNumber,
      idempotencyKey: `insp-fail-${id}`,
      title:          `[INSPECTION] ${inspection.title.replace(/^\[SIM-INS\] /, "")}`,
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
      reporterId:     (session.user as { id: string }).id,
    },
  });

  return NextResponse.json({ ok: true, data: { incidentId: incident.id, existing: false } });
}
