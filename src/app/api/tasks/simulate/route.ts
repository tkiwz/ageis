/**
 * POST /api/tasks/simulate
 *
 * Creates a realistic set of sample tasks for demonstration.
 * Covers all categories, priorities, statuses — including overdue tasks.
 * Idempotent: clears previous simulated tasks first (by matching [SIM] prefix).
 */

import { NextResponse } from "next/server";
import { auth }         from "@/auth";
import { ok, fail }     from "@/lib/api-response";
import { db }           from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const now  = () => new Date();
const h    = (n: number) => new Date(Date.now() + n * 60 * 60 * 1000);
const ago  = (n: number) => new Date(Date.now() - n * 60 * 60 * 1000);

export async function DELETE() {
  const session = await auth();
  if (!session?.user) return fail("UNAUTHORIZED", "Sign in required", 401) as unknown as Response;

  const { count } = await db.task.deleteMany({ where: { title: { startsWith: "[SIM]" } } });
  return ok({ deleted: count, message: `${count} simulation tasks removed.` });
}

export async function POST() {
  const session = await auth();
  if (!session?.user) return fail("UNAUTHORIZED", "Sign in required", 401) as unknown as Response;

  // Remove previous simulation tasks
  await db.task.deleteMany({ where: { title: { startsWith: "[SIM]" } } });

  // Resolve site + users for realistic data
  const site     = await db.site.findFirst({ orderBy: { createdAt: "asc" } });
  const admin    = await db.user.findFirst({ where: { role: "ADMIN" } });
  const operator = await db.user.findFirst({ where: { role: "OPERATOR" } });
  const supervisor = await db.user.findFirst({ where: { role: "SUPERVISOR" } });

  const SAMPLE_TASKS = [
    // ── CRITICAL — overdue ─────────────────────────────────
    {
      title:          "[SIM] 🔥 Emergency: Gas leak follow-up at Tank Farm A",
      description:    "Auto-detected by ESP32-001 at 14:22. Gas reading: 145 ppm (CRITICAL). Verify area is evacuated, isolate valve V-17, and confirm sensor calibration.",
      category:       "INCIDENT_FOLLOWUP",
      priority:       "CRITICAL",
      status:         "PENDING",
      isAutoAssigned: true,
      dueDate:        ago(3),  // 3 hours overdue
      siteId:         site?.id,
      assigneeId:     supervisor?.id,
    },
    {
      title:          "[SIM] 🚨 Fire alarm inspection — Zone 3",
      description:    "Flame sensor triggered. Physical inspection of Zone 3 required. Check extinguishers, confirm no active fire.",
      category:       "INSPECTION",
      priority:       "CRITICAL",
      status:         "IN_PROGRESS",
      isAutoAssigned: true,
      dueDate:        ago(1),  // 1 hour overdue
      siteId:         site?.id,
      assigneeId:     operator?.id,
    },

    // ── HIGH ───────────────────────────────────────────────
    {
      title:          "[SIM] Pressure relief valve PRV-04 — maintenance check",
      description:    "Scheduled maintenance for PRV-04. Last service: 90 days ago. Inspect seat, disc, and spring. Record findings in maintenance log.",
      category:       "MAINTENANCE",
      priority:       "HIGH",
      status:         "PENDING",
      isAutoAssigned: false,
      dueDate:        h(4),
      siteId:         site?.id,
      assigneeId:     operator?.id,
    },
    {
      title:          "[SIM] Weekly HSSE inspection — Production Area B",
      description:    "Conduct scheduled safety walk-through. Check emergency exits, PPE compliance, housekeeping, and chemical storage.",
      category:       "INSPECTION",
      priority:       "HIGH",
      status:         "IN_PROGRESS",
      isAutoAssigned: false,
      dueDate:        h(2),
      siteId:         site?.id,
      assigneeId:     supervisor?.id,
    },
    {
      title:          "[SIM] Update emergency evacuation plan",
      description:    "New site expansion requires update to muster points. Update EAP document, re-brief all staff, and update floor maps.",
      category:       "SAFETY",
      priority:       "HIGH",
      status:         "PENDING",
      isAutoAssigned: false,
      dueDate:        h(24),
      siteId:         site?.id,
    },

    // ── MEDIUM ────────────────────────────────────────────
    {
      title:          "[SIM] Operator safety induction — 3 new contractors",
      description:    "3 new contractors joining site Monday. Complete AEGIS safety induction module, PPE fitting, and sign-off forms.",
      category:       "TRAINING",
      priority:       "MEDIUM",
      status:         "PENDING",
      isAutoAssigned: false,
      dueDate:        h(48),
      siteId:         site?.id,
      assigneeId:     admin?.id,
    },
    {
      title:          "[SIM] Environmental impact assessment — Q2",
      description:    "Quarterly environmental report due. Collect water quality samples, noise level readings, and waste disposal records.",
      category:       "ENVIRONMENTAL",
      priority:       "MEDIUM",
      status:         "IN_PROGRESS",
      isAutoAssigned: false,
      dueDate:        h(72),
      siteId:         site?.id,
    },
    {
      title:          "[SIM] Replace corroded cable tray — Pump Room 2",
      description:    "Cable tray CT-07 showing visible corrosion. Replace with hot-dip galvanized section. Shutdown window: Saturday 06:00–10:00.",
      category:       "MAINTENANCE",
      priority:       "MEDIUM",
      status:         "PENDING",
      isAutoAssigned: false,
      dueDate:        h(96),
      siteId:         site?.id,
    },

    // ── LOW ───────────────────────────────────────────────
    {
      title:          "[SIM] Update MSDS sheets in site office",
      description:    "12 MSDS sheets expired last month. Download updated versions from supplier portals and replace binders.",
      category:       "SAFETY",
      priority:       "LOW",
      status:         "PENDING",
      isAutoAssigned: false,
      dueDate:        h(120),
      siteId:         site?.id,
    },

    // ── COMPLETED ─────────────────────────────────────────
    {
      title:          "[SIM] Monthly fire extinguisher check",
      description:    "All 24 extinguishers inspected. 2 units recharged, tags updated.",
      category:       "INSPECTION",
      priority:       "MEDIUM",
      status:         "COMPLETED",
      isAutoAssigned: false,
      completedAt:    ago(2),
      siteId:         site?.id,
      assigneeId:     operator?.id,
    },
    {
      title:          "[SIM] PTW training refresher — Electrical team",
      description:    "5 electricians completed Permit to Work refresher. Certificates uploaded to system.",
      category:       "TRAINING",
      priority:       "MEDIUM",
      status:         "COMPLETED",
      isAutoAssigned: false,
      completedAt:    ago(5),
      siteId:         site?.id,
      assigneeId:     admin?.id,
    },
  ];

  let created = 0;
  for (const t of SAMPLE_TASKS) {
    await db.task.create({ data: t as Parameters<typeof db.task.create>[0]["data"] });
    created++;
  }

  return ok({ created, message: `${created} simulation tasks created. Refresh the Tasks page.` });
}
