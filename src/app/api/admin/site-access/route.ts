import { NextRequest } from "next/server";
import { auth } from "@/auth";
import { ok, fail, forbidden, unauthorized } from "@/lib/api-response";
import { db } from "@/lib/db";
import { grantSiteAccess, revokeSiteAccess } from "@/lib/site-access";
import { appendAuditLog } from "@/lib/security/audit-chain";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return unauthorized();
  if (!["ADMIN", "HSSE_MANAGER"].includes(session.user.role)) return forbidden();

  const userId = req.nextUrl.searchParams.get("userId");
  const where = userId ? { userId } : {};
  const grants = await db.userSiteAccess.findMany({
    take: 500,
    where,
    orderBy: { createdAt: "desc" },
  });

  // Enrich with user + site details
  const userIds = Array.from(new Set(grants.map((g) => g.userId)));
  const siteIds = Array.from(new Set(grants.map((g) => g.siteId)));
  const [users, sites] = await Promise.all([
    db.user.findMany({
      take: 500, where: { id: { in: userIds } }, select: { id: true, name: true, email: true, role: true } }),
    db.site.findMany({
      take: 500, where: { id: { in: siteIds } }, select: { id: true, code: true, name: true, nameAr: true } }),
  ]);
  const userMap = Object.fromEntries(users.map((u) => [u.id, u]));
  const siteMap = Object.fromEntries(sites.map((s) => [s.id, s]));

  return ok({
    grants: grants.map((g) => ({
      ...g,
      user: userMap[g.userId] ?? null,
      site: siteMap[g.siteId] ?? null,
    })),
  });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return unauthorized();
  if (session.user.role !== "ADMIN") return forbidden("Only ADMIN can grant site access");

  let body: {
    userId?: string;
    siteId?: string;
    accessLevel?: "READ" | "WRITE" | "ADMIN";
    validFrom?: string;
    validUntil?: string;
    shiftStartHour?: number;
    shiftEndHour?: number;
  };
  try { body = await req.json(); } catch { return fail("INVALID_BODY", "Invalid JSON", 400); }

  if (!body.userId || !body.siteId) return fail("MISSING", "userId and siteId required", 400);
  if (body.accessLevel && !["READ", "WRITE", "ADMIN"].includes(body.accessLevel)) {
    return fail("VALIDATION", "accessLevel must be READ, WRITE or ADMIN", 400);
  }
  const [user, site] = await Promise.all([
    db.user.findUnique({ where: { id: body.userId }, select: { id: true, email: true } }),
    db.site.findUnique({ where: { id: body.siteId }, select: { id: true, code: true } }),
  ]);
  if (!user || !site) return fail("NOT_FOUND", "User or site not found", 404);
  const validFrom = body.validFrom ? new Date(body.validFrom) : undefined;
  const validUntil = body.validUntil ? new Date(body.validUntil) : undefined;
  if ((validFrom && isNaN(+validFrom)) || (validUntil && isNaN(+validUntil))) return fail("VALIDATION", "Invalid date", 400);

  await grantSiteAccess(body.userId, body.siteId, {
    accessLevel: body.accessLevel,
    validFrom,
    validUntil,
    shiftStartHour: body.shiftStartHour,
    shiftEndHour: body.shiftEndHour,
  });

  await appendAuditLog({
      module: "ADMIN",
      action: "SITE_ACCESS_GRANTED",
      actionType: "MANUAL",
      isAutonomous: false,
      description: `Site access granted: ${user.email} → ${site.code} (${body.accessLevel ?? "READ"})`,
      metadata: JSON.stringify(body),
      userId: session.user.id,
    });

  return ok({ granted: true });
}

export async function DELETE(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return unauthorized();
  if (session.user.role !== "ADMIN") return forbidden();

  const userId = req.nextUrl.searchParams.get("userId");
  const siteId = req.nextUrl.searchParams.get("siteId");
  if (!userId || !siteId) return fail("MISSING", "userId and siteId required", 400);

  await revokeSiteAccess(userId, siteId);
  await appendAuditLog({
      module: "ADMIN",
      action: "SITE_ACCESS_REVOKED",
      actionType: "MANUAL",
      isAutonomous: false,
      description: `Site access revoked: user=${userId}, site=${siteId}`,
      userId: session.user.id,
    });
  return ok({ revoked: true });
}
