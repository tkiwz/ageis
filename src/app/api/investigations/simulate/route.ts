/**
 * POST /api/investigations/simulate  — create sample investigations
 * DELETE /api/investigations/simulate — remove them
 */

import { NextResponse } from "next/server";
import { auth }         from "@/auth";
import { ok, fail }     from "@/lib/api-response";
import { db }           from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SIM_TAG = "[SIM-INV]";

const SAMPLES = [
  {
    rootCause: "Inadequate pre-task risk assessment combined with worn safety interlocks that had not been replaced during the last scheduled maintenance window.",
    summary: JSON.stringify({
      whys: [
        { level: 1, question: "Why did the incident occur?", answer: "An operator bypassed the pressure relief valve during routine maintenance." },
        { level: 2, question: "Why was the valve bypassed?", answer: "The bypass procedure was not clearly documented in the work instruction." },
        { level: 3, question: "Why was the work instruction unclear?", answer: "The last revision was done without field validation by the operations team." },
        { level: 4, question: "Why was field validation skipped?", answer: "Time pressure from production schedule caused the MOC process to be shortened." },
        { level: 5, question: "Why was there time pressure?", answer: "Production targets were prioritized over the management of change process." },
      ],
      rootCause: "Inadequate management of change process, driven by production pressure, led to unclear work instructions and operator error.",
      contributingFactors: ["Inadequate MOC process", "Insufficient training on updated procedures", "Time pressure from production schedule"],
      immediateCorrectiveActions: ["Suspend the maintenance task and re-issue work instructions", "Retrain all maintenance operators on valve bypass procedures", "Inspect all similar valves for bypasses"],
      systemicPreventiveActions: ["Revise MOC process to require field validation", "Implement pre-task briefings for high-risk activities", "Quarterly safety culture assessment"],
      riskLevel: "HIGH",
      bowTie: {
        threats: ["Production pressure", "Inadequate procedures"],
        topEvent: "Pressure relief valve bypass during maintenance",
        consequences: ["Overpressure event", "Equipment damage", "Potential injury"],
        barriers: ["Permit to Work system", "Revised work instructions", "Independent safety inspection"],
      },
      summary: "Root cause identified as an inadequate management of change process driven by production pressure. Immediate corrective actions have been issued. Systemic changes to the MOC process and training program are required to prevent recurrence.",
    }),
    hasAIEvidence: true,
    status: "IN_REVIEW",
  },
  {
    rootCause: "Lack of clear stop-work authority culture and inadequate near-miss reporting training.",
    summary: JSON.stringify({
      whys: [
        { level: 1, question: "Why did the near miss occur?", answer: "A contractor worked in an exclusion zone without authorization." },
        { level: 2, question: "Why did they enter without authorization?", answer: "The exclusion zone boundary was not clearly marked on site." },
        { level: 3, question: "Why was it not clearly marked?", answer: "The site supervisor assumed the contractor had received the safety briefing." },
        { level: 4, question: "Why was this assumed?", answer: "Contractor induction records were not verified before work began." },
        { level: 5, question: "Why were records not verified?", answer: "No formal check-in process exists for contractors arriving on site." },
      ],
      rootCause: "Absence of a formal contractor check-in and induction verification process allowed an uninducted contractor to enter a hazardous area.",
      contributingFactors: ["No formal contractor check-in process", "Unclear exclusion zone markings", "Communication gap between client and contractor"],
      immediateCorrectiveActions: ["Stop all contractor work pending induction verification", "Re-mark all exclusion zones with high-visibility barriers", "Brief all site supervisors on contractor management"],
      systemicPreventiveActions: ["Implement contractor management system with digital induction tracking", "Add exclusion zone mapping to daily toolbox talks", "Quarterly contractor safety performance review"],
      riskLevel: "MEDIUM",
      bowTie: {
        threats: ["Contractor unfamiliarity with site", "Poor communication"],
        topEvent: "Unauthorized entry into exclusion zone",
        consequences: ["Injury to contractor", "Equipment damage", "Regulatory violation"],
        barriers: ["Contractor induction system", "Physical barriers", "Daily safety briefings"],
      },
      summary: "The near-miss was caused by the absence of a formal contractor check-in process. Immediate isolation of the hazard and induction verification have been completed. A contractor management system should be implemented to prevent recurrence.",
    }),
    hasAIEvidence: true,
    status: "OPEN",
  },
  {
    rootCause: null,
    summary: null,
    hasAIEvidence: false,
    status: "OPEN",
  },
];

export async function POST() {
  const session = await auth();
  if (!session?.user) return fail("UNAUTHORIZED", "Sign in required", 401) as unknown as Response;

  // Remove previous sim investigations
  const simIncidents = await db.incident.findMany({
    where: { title: { startsWith: SIM_TAG } },
    select: { id: true },
  });
  if (simIncidents.length > 0) {
    await db.investigation.deleteMany({ where: { incidentId: { in: simIncidents.map((i) => i.id) } } });
    await db.incident.deleteMany({ where: { id: { in: simIncidents.map((i) => i.id) } } });
  }

  const site      = await db.site.findFirst({ orderBy: { createdAt: "asc" } });
  const reporter  = await db.user.findFirst({ where: { role: { in: ["ADMIN", "HSSE_MANAGER"] } }, orderBy: { createdAt: "asc" } });
  const lead      = await db.user.findFirst({ where: { role: "SAFETY_OFFICER" } })
                 ?? reporter;

  if (!site || !reporter) return fail("NO_DATA", "No site or users found. Run demo-setup first.", 500) as unknown as Response;

  const incidentTemplates = [
    { number: "INC-SIM-001", title: `${SIM_TAG} Pressure relief valve bypass during maintenance`, type: "PROCESS_SAFETY",  severity: "HIGH",     location: "Pump Room 2",        days: 14 },
    { number: "INC-SIM-002", title: `${SIM_TAG} Contractor near miss — exclusion zone breach`,   type: "NEAR_MISS",       severity: "MEDIUM",   location: "Tank Farm Area C",    days: 7  },
    { number: "INC-SIM-003", title: `${SIM_TAG} Chemical spill during transfer operations`,      type: "ENVIRONMENTAL",   severity: "HIGH",     location: "Loading Bay 1",       days: 3  },
  ];

  let created = 0;
  for (let i = 0; i < incidentTemplates.length; i++) {
    const t   = incidentTemplates[i];
    const s   = SAMPLES[i] ?? SAMPLES[2];
    const occ = new Date(Date.now() - t.days * 24 * 60 * 60 * 1000);

    // Check for duplicate incidentNumber
    const existing = await db.incident.findUnique({ where: { incidentNumber: t.number } });
    const finalNumber = existing ? `${t.number}-${Date.now()}` : t.number;

    const incident = await db.incident.create({
      data: {
        incidentNumber:  finalNumber,
        title:           t.title,
        description:     `Simulation incident for investigation demonstration. Type: ${t.type}. Occurred at ${t.location}.`,
        type:            t.type,
        severity:        t.severity,
        status:          "INVESTIGATING",
        location:        t.location,
        occurredAt:      occ,
        isAutoEscalated: false,
        siteId:          site.id,
        reporterId:      reporter.id,
      },
    });

    await db.investigation.create({
      data: {
        incidentId:          incident.id,
        rootCause:           s.rootCause,
        summary:             s.summary,
        hasAIEvidence:       s.hasAIEvidence,
        status:              s.status,
        leadInvestigatorId:  lead?.id ?? reporter.id,
      },
    });
    created++;
  }

  return ok({ created, message: `${created} simulation investigations created.` });
}

export async function DELETE() {
  const session = await auth();
  if (!session?.user) return fail("UNAUTHORIZED", "Sign in required", 401) as unknown as Response;

  const simIncidents = await db.incident.findMany({
    where: { title: { startsWith: SIM_TAG } },
    select: { id: true },
  });
  await db.investigation.deleteMany({ where: { incidentId: { in: simIncidents.map((i) => i.id) } } });
  const { count } = await db.incident.deleteMany({ where: { id: { in: simIncidents.map((i) => i.id) } } });

  return ok({ deleted: count });
}
