/**
 * Instant alert for serious field reports.
 * Rule: severity HIGH/CRITICAL, or type FIRE / GAS_LEAK / INJURY.
 * Does three things, each best-effort:
 *  1. an Alert row → shows in the dashboard "Needs action" queue
 *  2. in-app notifications (bell) for managers / safety officers, and
 *     supervisors of that site
 *  3. WhatsApp to the configured duty phone(s)
 */
import { db } from "@/lib/db";
import { sendWhatsApp } from "./whatsapp";

const URGENT_TYPES = new Set(["FIRE", "GAS_LEAK", "INJURY"]);

const TYPE_AR: Record<string, string> = {
  FIRE: "حريق", GAS_LEAK: "تسرب غاز", SPILL: "انسكاب", INJURY: "إصابة", EQUIPMENT: "معدات",
  VEHICLE: "مركبة", NEAR_MISS: "حادث وشيك", SECURITY: "حادث أمني", OTHER: "أخرى",
};
const SEV_AR: Record<string, string> = { LOW: "منخفض", MEDIUM: "متوسط", HIGH: "مرتفع", CRITICAL: "حرج" };

export function isUrgent(type: string, severity: string): boolean {
  return severity === "CRITICAL" || severity === "HIGH" || URGENT_TYPES.has(type);
}

export async function alertIncident(incident: {
  id: string;
  incidentNumber: string;
  type: string;
  severity: string;
  description: string;
  location: string;
  siteId: string;
  reporterId: string;
  photoCount?: number;
}) {
  const [site, reporter] = await Promise.all([
    db.site.findUnique({ where: { id: incident.siteId }, select: { name: true, nameAr: true } }),
    db.user.findUnique({ where: { id: incident.reporterId }, select: { name: true } }),
  ]);
  const typeEn = incident.type.replace(/_/g, " ").toLowerCase();
  const typeAr = TYPE_AR[incident.type] ?? incident.type;
  const critical = incident.severity === "CRITICAL" || incident.type === "FIRE";
  const link = `/safety/incidents/${incident.id}`;
  const base = process.env.NEXTAUTH_URL?.replace(/\/$/, "") ?? "";

  // 1. Alert (dashboard queue)
  const alert = db.alert.create({
    data: {
      type: critical ? "EMERGENCY" : incident.severity === "HIGH" ? "CRITICAL" : "WARNING",
      title: `${incident.incidentNumber} · ${typeEn} at ${site?.name ?? "site"}`,
      message: incident.description.slice(0, 500),
      channels: "IN_APP,WHATSAPP",
      status: "SENT",
      siteId: incident.siteId,
    },
  });

  // 2. In-app notifications
  const siteUsers = await db.userSiteAccess.findMany({ where: { siteId: incident.siteId }, select: { userId: true }, take: 500 });
  const recipients = await db.user.findMany({
    where: {
      isActive: true,
      OR: [
        { role: { in: ["ADMIN", "HSSE_MANAGER", "SAFETY_OFFICER"] } },
        { role: "SUPERVISOR", id: { in: siteUsers.map((u) => u.userId) } },
      ],
    },
    select: { id: true },
    take: 200,
  });
  const notes = db.notification.createMany({
    data: recipients.map((r) => ({
      userId: r.id,
      type: "INCIDENT",
      severity: critical ? "CRITICAL" : "WARNING",
      title: `New ${incident.severity.toLowerCase()} report: ${typeEn}`,
      titleAr: `بلاغ جديد (${SEV_AR[incident.severity] ?? incident.severity}): ${typeAr}`,
      body: `${incident.incidentNumber} · ${site?.name ?? ""} · ${incident.description.slice(0, 200)}`,
      bodyAr: `${incident.incidentNumber} · ${site?.nameAr || site?.name || ""} · ${incident.description.slice(0, 200)}`,
      link,
    })),
  });

  // 3. WhatsApp (Arabic first, English second)
  const message =
    `🚨 AEGIS — ${SEV_AR[incident.severity] ?? incident.severity} / ${incident.severity}\n` +
    `${typeAr} · ${typeEn}\n` +
    `${incident.incidentNumber}\n` +
    `الموقع / Site: ${site?.nameAr || site?.name || "-"}\n` +
    `المكان / Place: ${incident.location}\n` +
    `المبلّغ / By: ${reporter?.name ?? "-"}\n` +
    (incident.photoCount ? `صور / Photos: ${incident.photoCount}\n` : "") +
    `\n${incident.description.slice(0, 400)}\n` +
    (base ? `\n${base}${link}` : "");

  const [, , sent] = await Promise.allSettled([alert, notes, sendWhatsApp(message)]);
  return { whatsapp: sent.status === "fulfilled" ? sent.value : 0, notified: recipients.length };
}
