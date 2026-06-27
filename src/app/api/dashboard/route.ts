import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ok, serverError } from "@/lib/api-response";
import { requireScopedAuth } from "@/lib/scoped-auth";
import type { DashboardKpis } from "@/types";

export const dynamic = "force-dynamic";

export async function GET() {
  const scope = await requireScopedAuth();
  if (scope instanceof NextResponse) return scope;

  try {
    const siteWhere = scope.where("siteId");
    const siteIdWhere = scope.where("id"); // for Site model itself

    const [
      activeSites,
      totalIncidents,
      openIncidents,
      activePermits,
      onlineSensors,
      totalSensors,
      criticalAlerts,
      pendingActions,
      complianceItems,
      overdueTraining,
      activeEmergencies,
    ] = await Promise.all([
      db.site.count({ where: { ...siteIdWhere, status: "ACTIVE" } }),
      db.incident.count({ where: siteWhere }),
      db.incident.count({
        where: { ...siteWhere, status: { in: ["REPORTED", "INVESTIGATING", "ESCALATED"] } },
      }),
      db.permit.count({ where: { ...siteWhere, status: "ACTIVE" } }),
      db.ioTDevice.count({ where: { ...siteWhere, status: "ONLINE" } }),
      db.ioTDevice.count({ where: siteWhere }),
      db.alert.count({
        where: { ...siteWhere, type: { in: ["CRITICAL", "EMERGENCY"] }, status: "SENT" },
      }),
      // AutonomousAction has no siteId — visible to all who can see autonomy.
      db.autonomousAction.count({ where: { status: "PENDING" } }),
      db.complianceItem.findMany({ where: siteWhere, select: { status: true } }),
      // Training enrollments scoped via user only — not site-bound directly.
      db.trainingEnrollment.count({
        where: { status: { in: ["OVERDUE", "EXPIRED"] } },
      }),
      db.emergencyEvent.count({ where: { ...siteWhere, status: "ACTIVE" } }),
    ]);

    const totalCompliance = complianceItems.length;
    const compliantCount = complianceItems.filter((c) => c.status === "COMPLIANT").length;
    const complianceScore =
      totalCompliance === 0 ? 100 : Math.round((compliantCount / totalCompliance) * 100);

    // Recent alerts for the dashboard feed
    const recentAlerts = await db.alert.findMany({
      where: { ...siteWhere, status: "PENDING" },
      orderBy: { createdAt: "desc" },
      take: 15,
      include: { site: { select: { name: true } } },
    });

    const data: DashboardKpis & { activeEmergencies: number; recentAlerts: typeof recentAlerts } = {
      activeSites,
      totalIncidents,
      openIncidents,
      activePermits,
      onlineSensors,
      totalSensors,
      criticalAlerts,
      pendingActions,
      complianceScore,
      overdueTraining,
      activeEmergencies,
      recentAlerts,
    };

    return ok(data);
  } catch (error) {
    console.error("[/api/dashboard] error:", error);
    return serverError();
  }
}
