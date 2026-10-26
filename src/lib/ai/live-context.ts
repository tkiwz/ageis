/**
 * Compact live snapshot of the platform for the assistant, limited to the
 * sites the user can see. Kept short (~300–600 tokens) to control cost.
 * Record text (titles) is user-written: the prompt marks it as data.
 */
import { db } from "@/lib/db";
import type { ScopedAuthContext } from "@/lib/scoped-auth";

const OPEN_INCIDENT = ["REPORTED", "INVESTIGATING", "ESCALATED", "CONTAINED"];
const PENDING_PERMIT = ["DRAFT", "PENDING", "SUBMITTED", "IN_REVIEW"];

const day = (d: Date) => d.toISOString().slice(0, 16).replace("T", " ");

export async function buildLiveContext(scope: ScopedAuthContext): Promise<string> {
  const site = scope.where("siteId");
  const weekAgo = new Date(Date.now() - 7 * 86_400_000);

  const [sites, openCount, incidents, activePermits, pendingPermits, permits, alertCount, alerts, draftRisk, openInv] =
    await Promise.all([
      db.site.findMany({ where: scope.siteScope === "*" ? {} : { id: { in: scope.siteScope } }, select: { code: true, name: true }, take: 50 }),
      db.incident.count({ where: { ...site, status: { in: OPEN_INCIDENT } } }),
      db.incident.findMany({
        where: { ...site, status: { in: OPEN_INCIDENT } },
        orderBy: { createdAt: "desc" },
        take: 8,
        select: { incidentNumber: true, title: true, type: true, severity: true, status: true, createdAt: true, site: { select: { code: true } } },
      }),
      db.permit.count({ where: { ...site, status: "ACTIVE", validUntil: { gte: new Date() } } }),
      db.permit.count({ where: { ...site, status: { in: PENDING_PERMIT } } }),
      db.permit.findMany({
        where: { ...site, status: "ACTIVE", validUntil: { gte: new Date() } },
        orderBy: { validUntil: "asc" },
        take: 5,
        select: { permitNumber: true, type: true, validUntil: true, site: { select: { code: true } } },
      }),
      db.alert.count({ where: { ...site, acknowledgedAt: null, createdAt: { gte: weekAgo }, type: { in: ["EMERGENCY", "CRITICAL"] } } }),
      db.alert.findMany({
        where: { ...site, acknowledgedAt: null, createdAt: { gte: weekAgo } },
        orderBy: { createdAt: "desc" },
        take: 5,
        select: { type: true, title: true, createdAt: true },
      }),
      db.riskAssessment.count({ where: { ...site, status: "DRAFT" } }),
      db.investigation.count({ where: { status: { in: ["OPEN", "IN_REVIEW"] }, incident: site } }),
    ]);

  const lines = [
    `Snapshot time (UTC): ${day(new Date())}`,
    `User role: ${scope.role}; visible sites (${sites.length}): ${sites.map((s) => `${s.code} ${s.name}`).join(", ") || "none"}`,
    `Open incidents: ${openCount}`,
    ...incidents.map((i) => `- ${i.incidentNumber} [${i.severity}/${i.status}] ${i.type} @${i.site?.code ?? "-"} ${day(i.createdAt)}: ${i.title.slice(0, 100)}`),
    `Open investigations: ${openInv}`,
    `Active permits: ${activePermits}; pending approval: ${pendingPermits}`,
    ...permits.map((p) => `- ${p.permitNumber} ${p.type} @${p.site?.code ?? "-"} ends ${day(p.validUntil)}`),
    `Unacknowledged critical/emergency alerts (7d): ${alertCount}`,
    ...alerts.map((a) => `- [${a.type}] ${day(a.createdAt)}: ${a.title.slice(0, 100)}`),
    `Draft risk assessments awaiting approval: ${draftRisk}`,
  ];
  return lines.join("\n");
}
