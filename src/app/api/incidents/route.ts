import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth-helpers";
import { ok, serverError } from "@/lib/api-response";
import { getAccessibleSiteIds, applySiteScope } from "@/lib/site-access";
import type { Role } from "@/lib/constants";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const user = await requireAuth();
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    const severity = searchParams.get("severity");
    const siteId = searchParams.get("siteId");
    const limit = Number(searchParams.get("limit") ?? 20);

    const scope = await getAccessibleSiteIds(user.id, user.role as Role);
    let where: Record<string, unknown> = {
      ...(status && { status }),
      ...(severity && { severity }),
      ...(siteId && { siteId }),
    };
    where = applySiteScope(where, scope);

    const [incidents, total] = await Promise.all([
      db.incident.findMany({
        where,
        include: {
          site: { select: { code: true, name: true, nameAr: true } },
          reporter: { select: { name: true, role: true } },
          assignee: { select: { name: true, role: true } },
        },
        orderBy: { occurredAt: "desc" },
        take: limit,
      }),
      db.incident.count({ where }),
    ]);

    // Count by severity (for KPIs) — scoped to user's accessible sites
    const bySeverityWhere = applySiteScope({}, scope);
    const bySeverity = await db.incident.groupBy({
      by: ["severity"],
      where: bySeverityWhere,
      _count: { _all: true },
    });

    const severityCounts: Record<string, number> = {
      LOW: 0,
      MEDIUM: 0,
      HIGH: 0,
      CRITICAL: 0,
    };
    bySeverity.forEach((s) => {
      severityCounts[s.severity] = s._count._all;
    });

    return ok(
      {
        incidents,
        summary: {
          total,
          bySeverity: severityCounts,
          autoEscalated: incidents.filter((i) => i.isAutoEscalated).length,
        },
      },
      { total },
    );
  } catch (error) {
    console.error("[/api/incidents] error:", error);
    return serverError();
  }
}