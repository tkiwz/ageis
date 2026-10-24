import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth-helpers";
import { ok, fail, serverError } from "@/lib/api-response";
import { z } from "zod";
import { requireScopedAuth } from "@/lib/scoped-auth";
import { zodMessage } from "@/lib/validations/api";
import { appendAuditLog } from "@/lib/security/audit-chain";
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
// ── POST /api/incidents — structured field report (mobile app) ──────────────
const REPORT_TYPES = ["FIRE", "GAS_LEAK", "SPILL", "INJURY", "EQUIPMENT", "VEHICLE", "NEAR_MISS", "SECURITY", "OTHER"] as const;

const reportSchema = z.object({
  clientId: z.string().uuid(),
  type: z.enum(REPORT_TYPES),
  severity: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]),
  description: z.string().trim().min(3).max(4000),
  title: z.string().trim().max(200).optional(),
  location: z.string().trim().max(300).optional(),
  siteId: z.string().max(40).optional().nullable(),
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
  occurredAt: z.string().datetime().optional(),
});

/** Next INC-YYYY-NNNN for this year (max existing + 1). */
async function nextNumber(offset = 0): Promise<string> {
  const year = new Date().getFullYear();
  const last = await db.incident.findFirst({
    where: { incidentNumber: { startsWith: `INC-${year}-` } },
    orderBy: { incidentNumber: "desc" },
    select: { incidentNumber: true },
  });
  const n = last ? parseInt(last.incidentNumber.split("-")[2] ?? "0", 10) || 0 : 0;
  return `INC-${year}-${String(n + 1 + offset).padStart(4, "0")}`;
}

export async function POST(req: Request) {
  const scope = await requireScopedAuth();
  if (scope instanceof Response) return scope;

  const parsed = reportSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail("VALIDATION", zodMessage(parsed.error), 400);
  const b = parsed.data;

  // Offline retries send the same clientId → return the existing incident.
  const existing = await db.incident.findUnique({
    where: { idempotencyKey: `mobile-${b.clientId}` },
    select: { id: true, incidentNumber: true },
  });
  if (existing) return ok(existing);

  // Site: the one chosen (must be visible), else the nearest visible site, else the first.
  let siteId: string | null = null;
  if (b.siteId) {
    if (!scope.canSee(b.siteId)) return fail("SITE_FORBIDDEN", "Site not allowed", 403);
    siteId = b.siteId;
  } else {
    const sites = await db.site.findMany({
      where: { ...scope.where("id"), status: "ACTIVE" },
      select: { id: true, latitude: true, longitude: true },
      take: 200,
    });
    if (sites.length && b.lat !== undefined && b.lng !== undefined) {
      const d = (s: { latitude: number; longitude: number }) => (s.latitude - b.lat!) ** 2 + (s.longitude - b.lng!) ** 2;
      siteId = sites.sort((x, y) => d(x) - d(y))[0].id;
    } else {
      siteId = sites[0]?.id ?? null;
    }
  }
  if (!siteId) return fail("NO_SITE", "No site linked to this user", 422);

  const location = [b.location, b.lat !== undefined && b.lng !== undefined ? `GPS ${b.lat.toFixed(5)}, ${b.lng.toFixed(5)}` : null]
    .filter(Boolean)
    .join(" · ") || "—";

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const incident = await db.incident.create({
        data: {
          incidentNumber: await nextNumber(attempt),
          idempotencyKey: `mobile-${b.clientId}`,
          title: b.title || b.description.slice(0, 80),
          description: b.description,
          type: b.type,
          severity: b.severity,
          status: "REPORTED",
          location,
          occurredAt: b.occurredAt ? new Date(b.occurredAt) : new Date(),
          isAutoEscalated: b.severity === "CRITICAL",
          siteId,
          reporterId: scope.userId,
        },
        select: { id: true, incidentNumber: true },
      });
      appendAuditLog({
        module: "SAFETY",
        action: "INCIDENT_REPORTED",
        actionType: "MANUAL",
        description: `Field report ${incident.incidentNumber} (${b.type}, ${b.severity})`,
        userId: scope.userId,
        siteId,
      }).catch(() => {});
      return ok(incident);
    } catch (e) {
      const code = (e as { code?: string }).code;
      if (code === "P2002") {
        // Same clientId raced in, or number collision → check, then retry with next number
        const dup = await db.incident.findUnique({ where: { idempotencyKey: `mobile-${b.clientId}` }, select: { id: true, incidentNumber: true } });
        if (dup) return ok(dup);
        continue;
      }
      console.error("[/api/incidents POST]", e);
      return serverError();
    }
  }
  return serverError();
}
