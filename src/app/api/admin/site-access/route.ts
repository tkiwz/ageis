import { NextRequest } from "next/server";
import { auth } from "@/auth";
import { ok, fail, forbidden, unauthorized } from "@/lib/api-response";
import { db } from "@/lib/db";
import { grantSiteAccess, revokeSiteAccess } from "@/lib/site-access";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return unauthorized();
  if (!["ADMIN", "HSSE_MANAGER"].includes(session.user.role)) return forbidden();

  const userId = req.nextUrl.searchParams.get("userId");
  const where = userId ? { userId } : {};
  const grants = await db.userSiteAccess.findMany({
    where,
    orderBy: { createdAt: "desc" },
  });

  // Enrich with user + site details
  const userIds = Array.from(new Set(grants.map((g) => g.userId)));
  const siteIds = Array.from(new Set(grants.map((g) => g.siteId)));
  const [users, sites] = await Promise.all([
    db.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true, email: true, role: true } }),
    db.site.findMany({ where: { id: { in: siteIds } }, select: { id: true, code: true, name: true, nameAr: true } }),
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

  await grantSiteAccess(body.userId, body.siteId, {
    accessLevel: body.accessLevel,
    validFrom: body.validFrom ? new Date(body.validFrom) : undefined,
    validUntil: body.validUntil ? new Date(body.validUntil) : undefined,
    shiftStartHour: body.shiftStartHour,
    shiftEndHour: body.shiftEndHour,
  });

  await db.auditLog.create({
    data: {
      module: "ADMIN",
      action: "SITE_ACCESS_GRANTED",
      actionType: "MANUAL",
      isAutonomous: false,
      description: `Site access granted: user=${body.userId}, site=${body.siteId}, level=${body.accessLevel ?? "READ"}`,
      metadata: JSON.stringify(body),
      userId: session.user.id,
    },
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
  await db.auditLog.create({
    data: {
      module: "ADMIN",
      action: "SITE_ACCESS_REVOKED",
      actionType: "MANUAL",
      isAutonomous: false,
      description: `Site access revoked: user=${userId}, site=${siteId}`,
      userId: session.user.id,
    },
  });
  return ok({ revoked: true });
}
