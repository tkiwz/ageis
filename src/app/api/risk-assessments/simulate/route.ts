/**
 * POST /api/risk-assessments/simulate  — create sample assessments
 * DELETE /api/risk-assessments/simulate — remove them
 */

import { NextResponse }  from "next/server";
import { ok, fail }      from "@/lib/api-response";
import { db }            from "@/lib/db";
import { auth }          from "@/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SIM_TAG = "[SIM-RA]";

const SAMPLES = [
  {
    title:             `${SIM_TAG} Chemical Exposure — H2S Release`,
    type:              "CHEMICAL",
    hazardDescription: "Potential hydrogen sulphide (H2S) release during well intervention operations. Personnel working within 10m of wellhead without gas monitors.",
    riskBefore:        "CRITICAL",
    controlsSuggested: "Mandatory H2S monitors for all personnel; wind-sock installed upwind; muster point designated 50m upwind; SCBA available within 30 seconds; buddy system enforced; continuous atmospheric monitoring every 15 minutes.",
    riskAfter:         "LOW",
    status:            "APPROVED",
    aiSuggested:       true,
  },
  {
    title:             `${SIM_TAG} Electrical Isolation — MV Panel Maintenance`,
    type:              "ELECTRICAL",
    hazardDescription: "Medium voltage (11kV) switchgear maintenance with risk of arc flash and electric shock if LOTO procedure not followed.",
    riskBefore:        "HIGH",
    controlsSuggested: "Full LOTO applied and verified; arc flash PPE (Category 4) mandatory; hotwork permit issued; qualified electrician only; second person standby; barriers erected 3m around work area.",
    riskAfter:         "LOW",
    status:            "APPROVED",
    aiSuggested:       true,
  },
  {
    title:             `${SIM_TAG} Working at Height — Flare Stack Inspection`,
    type:              "PHYSICAL",
    hazardDescription: "Inspection of flare stack at 25m height. Risk of fall from height, dropped objects, and proximity to flare.",
    riskBefore:        "HIGH",
    controlsSuggested: "Full-body harness with double lanyard; scaffolding inspected and tagged; exclusion zone 10m radius; weather window confirmed (wind < 15 knots); dropped object prevention nets installed.",
    riskAfter:         "MEDIUM",
    status:            "DRAFT",
    aiSuggested:       false,
  },
  {
    title:             `${SIM_TAG} Manual Handling — Pump Overhaul`,
    type:              "ERGONOMIC",
    hazardDescription: "Manual handling of pump components up to 40kg during overhaul. Risk of musculoskeletal injury.",
    riskBefore:        "MEDIUM",
    controlsSuggested: "Mechanical lifting aids used for items >25kg; team lift with 2+ persons; pre-task stretch; proper lifting technique briefing; anti-fatigue mats installed.",
    riskAfter:         "LOW",
    status:            "APPROVED",
    aiSuggested:       false,
  },
  {
    title:             `${SIM_TAG} Hot Work — Pipeline Welding`,
    type:              "FIRE",
    hazardDescription: "Welding on live pipeline spool. Risk of ignition of flammable vapours and uncontrolled fire.",
    riskBefore:        "CRITICAL",
    controlsSuggested: "Hot work permit issued; gas free certificate obtained; fire watch posted; CO2 extinguisher within 5m; pipeline depressurised and purged; welding screens erected; standby firefighter on-site.",
    riskAfter:         "MEDIUM",
    status:            "DRAFT",
    aiSuggested:       true,
  },
];

export async function POST() {
  const session = await auth();
  if (!session?.user) return fail("UNAUTHORIZED", "Sign in required", 401) as unknown as Response;

  const site      = await db.site.findFirst({ orderBy: { createdAt: "asc" } });
  const conductor = await db.user.findFirst({ where: { role: { in: ["ADMIN", "HSSE_MANAGER", "SAFETY_OFFICER"] } }, orderBy: { createdAt: "asc" } });

  if (!site || !conductor) return fail("NO_DATA", "No site or users found.", 500) as unknown as Response;

  // Remove previous sim records
  await db.riskAssessment.deleteMany({ where: { title: { startsWith: SIM_TAG } } });

  let created = 0;
  for (const s of SAMPLES) {
    await db.riskAssessment.create({
      data: {
        title:             s.title,
        type:              s.type,
        hazardDescription: s.hazardDescription,
        riskBefore:        s.riskBefore,
        controlsSuggested: s.controlsSuggested,
        riskAfter:         s.riskAfter,
        status:            s.status,
        aiSuggested:       s.aiSuggested,
        siteId:            site.id,
        conductedById:     conductor.id,
      },
    });
    created++;
  }

  return ok({ created, message: `${created} simulation risk assessments created.` });
}

export async function DELETE() {
  const session = await auth();
  if (!session?.user) return fail("UNAUTHORIZED", "Sign in required", 401) as unknown as Response;

  const { count } = await db.riskAssessment.deleteMany({ where: { title: { startsWith: SIM_TAG } } });
  return ok({ deleted: count });
}
