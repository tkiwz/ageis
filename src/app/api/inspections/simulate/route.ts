import { NextResponse } from "next/server";
import { ok, fail }     from "@/lib/api-response";
import { db }           from "@/lib/db";
import { auth }         from "@/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SIM_TAG = "[SIM-INS]";

const SAMPLES = [
  { title: `${SIM_TAG} Monthly Process Safety Walkthrough`, type: "PROCESS_SAFETY", status: "COMPLETED", fraudDetected: false, notes: "All pressure relief valves verified. Permit-to-work board updated. No deficiencies found.", days: 5 },
  { title: `${SIM_TAG} Electrical Systems Inspection — Substation B`, type: "ELECTRICAL", status: "COMPLETED", fraudDetected: false, notes: "LOTO compliance confirmed. Arc flash labels current. One emergency light defective — work order raised.", days: 12 },
  { title: `${SIM_TAG} Fire & Gas Detection System Check`, type: "FIRE_GAS", status: "COMPLETED", fraudDetected: false, notes: "All 42 detectors tested. 3 sensors require calibration — scheduled for next week.", days: 20 },
  { title: `${SIM_TAG} Scaffolding & Working at Height Audit`, type: "PHYSICAL", status: "FAILED", fraudDetected: false, notes: "Scaffolding tag system not followed at 3 locations. Immediate stop-work order issued. Re-inspection required.", days: 8 },
  { title: `${SIM_TAG} Contractor Safety Compliance Audit`, type: "CONTRACTOR", status: "IN_PROGRESS", fraudDetected: false, notes: "Audit in progress. Initial walkthrough completed — detailed report pending.", days: 1 },
  { title: `${SIM_TAG} Environmental & Spill Prevention Inspection`, type: "ENVIRONMENTAL", status: "SCHEDULED", fraudDetected: false, notes: null, days: -3 },
  { title: `${SIM_TAG} PTW System Compliance Check`, type: "GOVERNANCE", status: "COMPLETED", fraudDetected: true, fraudReason: "Photo evidence timestamp inconsistency: submitted photos show equipment in daylight but work order shows night shift only. Possible pre-staged evidence.", notes: "Fraud flags raised — pending investigation.", days: 15 },
  { title: `${SIM_TAG} Emergency Response Equipment Inspection`, type: "EMERGENCY", status: "COMPLETED", fraudDetected: false, notes: "All fire extinguishers within service date. SCBA units checked — 2 cylinders below 80% pressure, replaced immediately.", days: 25 },
];

export async function POST() {
  const session = await auth();
  if (!session?.user) return fail("UNAUTHORIZED", "Sign in required", 401) as unknown as Response;

  const site      = await db.site.findFirst({ orderBy: { createdAt: "asc" } });
  const conductor = await db.user.findFirst({ where: { role: { in: ["SAFETY_OFFICER", "HSSE_MANAGER"] } }, orderBy: { createdAt: "asc" } });

  if (!site || !conductor) return fail("NO_DATA", "No site or users found.", 500) as unknown as Response;

  await db.inspection.deleteMany({ where: { title: { startsWith: SIM_TAG } } });

  let created = 0;
  for (const s of SAMPLES) {
    const conductedAt = s.status === "COMPLETED" || s.status === "FAILED"
      ? new Date(Date.now() - s.days * 864e5) : null;

    await db.inspection.create({
      data: {
        title:         s.title,
        type:          s.type,
        status:        s.status,
        fraudDetected: s.fraudDetected,
        fraudReason:   (s as { fraudReason?: string }).fraudReason ?? null,
        notes:         s.notes,
        conductedAt,
        siteId:        site.id,
        conductedById: conductor.id,
      },
    });
    created++;
  }

  return ok({ created });
}

export async function DELETE() {
  const session = await auth();
  if (!session?.user) return fail("UNAUTHORIZED", "Sign in required", 401) as unknown as Response;

  const { count } = await db.inspection.deleteMany({ where: { title: { startsWith: SIM_TAG } } });
  return ok({ deleted: count });
}
