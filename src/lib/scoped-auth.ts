/**
 * Universal scoped auth helper — combines auth + site-permission filtering.
 *
 * Use this in EVERY route that lists, reads, or counts site-scoped data.
 * Returns `where` clauses pre-baked with the user's accessible siteIds.
 *
 * Usage:
 *   const scope = await requireScopedAuth();
 *   if (scope instanceof NextResponse) return scope; // 401
 *   const items = await db.permit.findMany({ where: scope.where("siteId") });
 *
 * For relation-based scoping (e.g. PressureReading via Pipeline.startSiteId),
 * call scope.relationWhere("point.pipeline.startSiteId").
 */
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { unauthorized } from "@/lib/api-response";
import { getAccessibleSiteIds, isSiteUnrestricted, type SiteScope } from "@/lib/site-access";
import type { Role } from "@/lib/constants";

export interface ScopedAuthContext {
  userId: string;
  role: Role;
  email: string | null;
  siteScope: SiteScope;
  /** True if user can see all sites (ADMIN / HSSE_MANAGER). */
  unrestricted: boolean;
  /**
   * Build a Prisma where filter scoped to accessible sites.
   * Pass the column name (default "siteId") to merge into existing filters.
   */
  where(field?: string): Record<string, unknown>;
  /** For nested relations: scope.relationWhere("point", "pipeline", "startSiteId") */
  relationWhere(...path: string[]): Record<string, unknown>;
  /** Cheap check: does the user have access to this specific siteId? */
  canSee(siteId: string | null | undefined): boolean;
}

/**
 * Returns either a populated context (use in route logic) or a NextResponse
 * (auth failure — return it directly to short-circuit).
 */
export async function requireScopedAuth(): Promise<ScopedAuthContext | NextResponse> {
  const session = await auth();
  if (!session?.user) return unauthorized();

  const role = session.user.role as Role;
  const userId = session.user.id!;
  const email = session.user.email ?? null;
  const siteScope = await getAccessibleSiteIds(userId, role);
  const unrestricted = isSiteUnrestricted(role);

  function where(field = "siteId"): Record<string, unknown> {
    if (siteScope === "*") return {};
    return { [field]: { in: siteScope } };
  }

  function relationWhere(...path: string[]): Record<string, unknown> {
    if (siteScope === "*") return {};
    // Build a nested object: ["a","b","c"] → { a: { b: { c: { in: ids } } } }
    let inner: Record<string, unknown> = { in: siteScope };
    for (let i = path.length - 1; i >= 0; i--) {
      inner = { [path[i]]: inner };
    }
    return inner;
  }

  function canSee(siteId: string | null | undefined): boolean {
    if (siteScope === "*") return true;
    if (!siteId) return false;
    return siteScope.includes(siteId);
  }

  return { userId, role, email, siteScope, unrestricted, where, relationWhere, canSee };
}

/**
 * Stricter variant — also requires one of the listed roles.
 * Returns a NextResponse (401/403) on failure.
 */
export async function requireScopedRole(
  allowed: Role[],
): Promise<ScopedAuthContext | NextResponse> {
  const ctx = await requireScopedAuth();
  if (ctx instanceof NextResponse) return ctx;
  if (!allowed.includes(ctx.role)) {
    return NextResponse.json(
      { ok: false, error: { code: "FORBIDDEN", message: "Role not allowed" } },
      { status: 403 },
    );
  }
  return ctx;
}
