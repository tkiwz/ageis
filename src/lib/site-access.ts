/**
 * Site-based access control — beyond RBAC role checks.
 *
 * A user's role tells you *what features* they can use; UserSiteAccess
 * tells you *which sites' data* they can see. ADMIN / HSSE_MANAGER are
 * site-unrestricted by convention.
 *
 * Use `getAccessibleSiteIds()` to scope queries:
 *   const siteIds = await getAccessibleSiteIds(userId, role);
 *   db.incident.findMany({ where: siteIds === "*" ? {} : { siteId: { in: siteIds } } });
 */
import { db } from "@/lib/db";
import type { Role } from "@/lib/constants";

const ALL_SITES = "*" as const;

export type SiteScope = typeof ALL_SITES | string[];

const UNRESTRICTED_ROLES: Role[] = ["ADMIN", "HSSE_MANAGER"];

export function isSiteUnrestricted(role: Role): boolean {
  return UNRESTRICTED_ROLES.includes(role);
}

/**
 * Returns the list of site IDs the user can access, or "*" for unrestricted.
 * Honors validFrom/validUntil and shift hours when set.
 */
export async function getAccessibleSiteIds(userId: string, role: Role): Promise<SiteScope> {
  if (isSiteUnrestricted(role)) return ALL_SITES;

  const now = new Date();
  const hour = now.getHours();

  const grants = await db.userSiteAccess.findMany({
    where: {
      userId,
      AND: [
        { OR: [{ validFrom: null }, { validFrom: { lte: now } }] },
        { OR: [{ validUntil: null }, { validUntil: { gte: now } }] },
      ],
    },
  });

  return grants
    .filter((g) => {
      // Shift-window check — only enforced when both bounds set.
      if (g.shiftStartHour === null || g.shiftEndHour === null) return true;
      const s = g.shiftStartHour as number;
      const e = g.shiftEndHour as number;
      // Handle overnight shifts (e.g. 22-6)
      if (s <= e) return hour >= s && hour < e;
      return hour >= s || hour < e;
    })
    .map((g) => g.siteId);
}

/** Cheap check for a single site. */
export async function canAccessSite(userId: string, role: Role, siteId: string): Promise<boolean> {
  const scope = await getAccessibleSiteIds(userId, role);
  return scope === ALL_SITES || scope.includes(siteId);
}

/** Helper to apply scoping to a Prisma `where` clause. */
export function applySiteScope<T extends Record<string, unknown>>(
  where: T,
  scope: SiteScope,
  field = "siteId",
): T {
  if (scope === ALL_SITES) return where;
  return { ...where, [field]: { in: scope } } as T;
}

export async function grantSiteAccess(
  userId: string,
  siteId: string,
  options: {
    accessLevel?: "READ" | "WRITE" | "ADMIN";
    validFrom?: Date;
    validUntil?: Date;
    shiftStartHour?: number;
    shiftEndHour?: number;
  } = {},
): Promise<void> {
  await db.userSiteAccess.upsert({
    where: { userId_siteId: { userId, siteId } },
    update: {
      accessLevel: options.accessLevel ?? "READ",
      validFrom: options.validFrom,
      validUntil: options.validUntil,
      shiftStartHour: options.shiftStartHour,
      shiftEndHour: options.shiftEndHour,
    },
    create: {
      userId,
      siteId,
      accessLevel: options.accessLevel ?? "READ",
      validFrom: options.validFrom,
      validUntil: options.validUntil,
      shiftStartHour: options.shiftStartHour,
      shiftEndHour: options.shiftEndHour,
    },
  });
}

export async function revokeSiteAccess(userId: string, siteId: string): Promise<void> {
  await db.userSiteAccess.deleteMany({ where: { userId, siteId } });
}
