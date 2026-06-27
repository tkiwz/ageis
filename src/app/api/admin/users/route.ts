import { NextRequest } from "next/server";
import { auth } from "@/auth";
import { ok, fail, unauthorized, forbidden } from "@/lib/api-response";
import { db } from "@/lib/db";
import bcrypt from "bcryptjs";
import { checkPasswordStrength } from "@/lib/security/password";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth();
  if (!session?.user) return unauthorized();
  if (session.user.role !== "ADMIN") return forbidden();

  const users = await db.user.findMany({
    select: {
      id: true, email: true, name: true, role: true, department: true,
      phone: true, isActive: true, lastLoginAt: true, createdAt: true,
    },
    orderBy: { createdAt: "desc" },
  });
  return ok({ users });
}

interface CreateUserPayload {
  email: string;
  password: string;
  name: string;
  role: string;
  department?: string;
  phone?: string;
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return unauthorized();
  if (session.user.role !== "ADMIN") return forbidden();

  let body: CreateUserPayload;
  try { body = await req.json(); } catch { return fail("INVALID_BODY", "Invalid JSON", 400); }

  if (!body.email || !body.password || !body.name || !body.role) {
    return fail("MISSING", "email, password, name, role required", 400);
  }
  const strength = checkPasswordStrength(body.password, { email: body.email, name: body.name });
  if (!strength.ok) return fail("WEAK_PASSWORD", strength.reasons.join(" "), 400);
  const validRoles = ["ADMIN", "HSSE_MANAGER", "SAFETY_OFFICER", "SUPERVISOR", "OPERATOR", "CONTRACTOR"];
  if (!validRoles.includes(body.role)) return fail("BAD_ROLE", `Role must be one of: ${validRoles.join(", ")}`, 400);

  const existing = await db.user.findUnique({ where: { email: body.email.toLowerCase() } });
  if (existing) return fail("DUPLICATE", "User with this email already exists", 409);

  const passwordHash = await bcrypt.hash(body.password, 12);
  const user = await db.user.create({
    data: {
      email: body.email.toLowerCase(),
      passwordHash,
      name: body.name,
      role: body.role,
      department: body.department ?? null,
      phone: body.phone ?? null,
    },
    select: { id: true, email: true, name: true, role: true, department: true, phone: true, isActive: true, createdAt: true },
  });

  await db.auditLog.create({
    data: {
      module: "ADMIN", action: "USER_CREATED", actionType: "MANUAL", isAutonomous: false,
      description: `User ${user.email} created with role ${user.role}`,
      metadata: JSON.stringify({ targetUserId: user.id }),
      userId: session.user.id, riskLevel: "MEDIUM",
    },
  });
  return ok({ user });
}

interface PatchUserPayload {
  id: string;
  name?: string;
  role?: string;
  department?: string | null;
  phone?: string | null;
  isActive?: boolean;
  password?: string;
}

export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return unauthorized();
  if (session.user.role !== "ADMIN") return forbidden();

  let body: PatchUserPayload;
  try { body = await req.json(); } catch { return fail("INVALID_BODY", "Invalid JSON", 400); }
  if (!body.id) return fail("MISSING", "id required", 400);

  const update: Record<string, unknown> = {};
  if (body.name !== undefined) update.name = body.name;
  if (body.role !== undefined) update.role = body.role;
  if (body.department !== undefined) update.department = body.department;
  if (body.phone !== undefined) update.phone = body.phone;
  if (body.isActive !== undefined) update.isActive = body.isActive;
  if (body.password) {
    const target = await db.user.findUnique({ where: { id: body.id }, select: { email: true, name: true } });
    const strength = checkPasswordStrength(body.password, {
      email: target?.email,
      name: target?.name,
    });
    if (!strength.ok) return fail("WEAK_PASSWORD", strength.reasons.join(" "), 400);
    update.passwordHash = await bcrypt.hash(body.password, 12);
  }

  const updated = await db.user.update({
    where: { id: body.id },
    data: update,
    select: { id: true, email: true, name: true, role: true, isActive: true },
  });
  await db.auditLog.create({
    data: {
      module: "ADMIN", action: "USER_UPDATED", actionType: "MANUAL", isAutonomous: false,
      description: `User ${updated.email} updated`,
      metadata: JSON.stringify({ targetUserId: updated.id, fields: Object.keys(update) }),
      userId: session.user.id, riskLevel: "MEDIUM",
    },
  });
  return ok({ user: updated });
}
