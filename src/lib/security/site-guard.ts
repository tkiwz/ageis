/**
 * Site isolation for /[id] routes: a site-restricted user gets 404 for
 * records that belong to sites they cannot see (prevents IDOR by id).
 *
 *   const hidden = await denyUnlessSiteVisible("incident", id);
 *   if (hidden) return hidden;
 */
import { db } from "@/lib/db";
import { notFound } from "@/lib/api-response";
import { requireScopedAuth } from "@/lib/scoped-auth";

type Kind = "incident" | "permit" | "inspection" | "site" | "pipeline" | "device";

async function siteIdsOf(kind: Kind, id: string): Promise<(string | null)[] | null> {
  switch (kind) {
    case "site":
      return [id];
    case "incident":
      return db.incident.findUnique({ where: { id }, select: { siteId: true } }).then((r) => r && [r.siteId]);
    case "permit":
      return db.permit.findUnique({ where: { id }, select: { siteId: true } }).then((r) => r && [r.siteId]);
    case "inspection":
      return db.inspection.findUnique({ where: { id }, select: { siteId: true } }).then((r) => r && [r.siteId]);
    case "pipeline":
      return db.pipeline
        .findUnique({ where: { id }, select: { startSiteId: true, endSiteId: true } })
        .then((r) => r && [r.startSiteId, r.endSiteId]);
    case "device":
      return db.fieldDevice.findUnique({ where: { id }, select: { siteId: true } }).then((r) => r && [r.siteId]);
  }
}

export async function denyUnlessSiteVisible(kind: Kind, id: string) {
  const scope = await requireScopedAuth();
  if (scope instanceof Response) return scope;
  if (scope.unrestricted) return null;

  const siteIds = await siteIdsOf(kind, id);
  if (!siteIds) return null; // missing record → let the route return its own 404
  return siteIds.some((s) => scope.canSee(s)) ? null : notFound();
}
