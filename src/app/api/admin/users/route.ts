import { NextRequest } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { ok, fail, unauthorized, forbidden } from "@/lib/api-response";
import { db } from "@/lib/db";
import bcrypt from "bcryptjs";
import { checkPasswordStrength } from "@/lib/security/password";
import { appendAuditLog } from "@/lib/security/audit-chain";
import { grantSiteAccess } from "@/lib/site-access";
import { ROLES } from "@/lib/constants";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ROLE = z.enum(Object.values(ROLES) as [string, ...string[]]);
const phone = z.string().trim().max(30).regex(/^[+\d\s()-]*$/, "digits, spaces, + ( ) - only");

export async function GET() {
  const session = await auth();
  if (!session?.user) return unauthorized();
  if (session.user.role !== "ADMIN") return forbidden();

  const [users, grants] = await Promise.all([
    db.user.findMany({
      take: 500,
      select: {
        id: true, email: true, name: true, role: true, department: true,
        phone: true, isActive: true, lastLoginAt: true, createdAt: true,
      },
      orderBy: [{ isActive: "desc" }, { createdAt: "desc" }],
    }),
    db.userSiteAccess.groupBy({ by: ["userId"], _count: { _all: true } }),
  ]);
  const siteCount = new Map(grants.map((g) => [g.userId, g._count._all]));
  return ok({ users: users.map((u) => ({ ...u, siteCount: siteCount.get(u.id) ?? 0 })) });
}

const createSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(200),
  password: z.string().min(1).max(200),
  name: z.string().trim().min(2).max(120),
  role: ROLE,
  department: z.string().trim().max(120).optional().or(z.literal("")),
  phone: phone.optional().or(z.literal("")),
  siteIds: z.array(z.string().min(1).max(40)).max(100).default([]),
});

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return unauthorized();
  if (session.user.role !== "ADMIN") return forbidden();

  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    const f = parsed.error.issues[0];
    return fail("VALIDATION", `${f?.path.join(".") || "body"}: ${f?.message ?? "invalid"}`, 400);
  }
  const body = parsed.data;

  const strength = checkPasswordStrength(body.password, { email: body.email, name: body.name });
  if (!strength.ok) return fail("WEAK_PASSWORD", strength.reasons.join(" "), 400);

  const existing = await db.user.findUnique({ where: { email: body.email } });
  if (existing) return fail("DUPLICATE", "A user with this email already exists", 409);

  // Only real sites can be granted
  const sites = body.siteIds.length
    ? await db.site.findMany({ where: { id: { in: body.siteIds } }, select: { id: true } })
    : [];

  const passwordHash = await bcrypt.hash(body.password, 12);
  const user = await db.user.create({
    data: {
      email: body.email,
      passwordHash,
      name: body.name,
      role: body.role,
      department: body.department || null,
      phone: body.phone || null,
    },
    select: { id: true, email: true, name: true, role: true, department: true, phone: true, isActive: true, createdAt: true },
  });
  for (const s of sites) await grantSiteAccess(user.id, s.id, { accessLevel: "WRITE" });

  await appendAuditLog({
    module: "ADMIN", action: "USER_CREATED", actionType: "MANUAL", isAutonomous: false,
    description: `User ${user.email} created with role ${user.role} and ${sites.length} site(s)`,
    metadata: JSON.stringify({ targetUserId: user.id, siteIds: sites.map((s) => s.id) }),
    userId: session.user.id, riskLevel: "MEDIUM",
  });
  return ok({ user: { ...user, siteCount: sites.length } });
}

const patchSchema = z.object({
  id: z.string().min(1).max(40),
  name: z.string().trim().min(2).max(120).optional(),
  role: ROLE.optional(),
  department: z.string().trim().max(120).nullable().optional(),
  phone: phone.nullable().optional(),
  isActive: z.boolean().optional(),
  password: z.string().max(200).optional(),
}).strict();

export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return unauthorized();
  if (session.user.role !== "ADMIN") return forbidden();

  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    const f = parsed.error.issues[0];
    return fail("VALIDATION", `${f?.path.join(".") || "body"}: ${f?.message ?? "invalid"}`, 400);
  }
  const body = parsed.data;

  const target = await db.user.findUnique({ where: { id: body.id }, select: { id: true, email: true, name: true, role: true, isActive: true } });
  if (!target) return fail("NOT_FOUND", "User not found", 404);

  // Never lock the organisation out: no self-demotion / self-deactivation,
  // and there must always be one active ADMIN left.
  const losesAdmin = target.role === "ADMIN" && ((body.role && body.role !== "ADMIN") || body.isActive === false);
  if (target.id === session.user.id && losesAdmin) {
    return fail("SELF_LOCKOUT", "You can't remove your own admin access or deactivate yourself", 409);
  }
  if (losesAdmin) {
    const admins = await db.user.count({ where: { role: "ADMIN", isActive: true } });
    if (admins <= 1) return fail("LAST_ADMIN", "At least one active administrator is required", 409);
  }

  const update: Record<string, unknown> = {};
  if (body.name !== undefined) update.name = body.name;
  if (body.role !== undefined) update.role = body.role;
  if (body.department !== undefined) update.department = body.department || null;
  if (body.phone !== undefined) update.phone = body.phone || null;
  if (body.isActive !== undefined) update.isActive = body.isActive;
  if (body.password) {
    const strength = checkPasswordStrength(body.password, { email: target.email, name: target.name });
    if (!strength.ok) return fail("WEAK_PASSWORD", strength.reasons.join(" "), 400);
    update.passwordHash = await bcrypt.hash(body.password, 12);
  }
  if (Object.keys(update).length === 0) return ok({ user: target });

  const updated = await db.user.update({
    where: { id: body.id },
    data: update,
    select: { id: true, email: true, name: true, role: true, isActive: true },
  });
  await appendAuditLog({
    module: "ADMIN", action: "USER_UPDATED", actionType: "MANUAL", isAutonomous: false,
    description: `User ${updated.email} updated (${Object.keys(update).map((k) => (k === "passwordHash" ? "password" : k)).join(", ")})`,
    metadata: JSON.stringify({ targetUserId: updated.id, fields: Object.keys(update).map((k) => (k === "passwordHash" ? "password" : k)) }),
    userId: session.user.id, riskLevel: body.role || body.isActive !== undefined || body.password ? "HIGH" : "MEDIUM",
  });
  return ok({ user: updated });
}
