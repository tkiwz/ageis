/**
 * POST /api/auth/demo-setup
 *
 * Idempotent: ensures the demo accounts exist with the known password.
 * Used by the one-tap Quick Login buttons on /login.
 *
 * Safe in production only when DISABLE_DEMO_SETUP is unset.
 */
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import bcrypt from "bcryptjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEMO_PASSWORD = "admin";

const DEMO_USERS = [
  { email: "admin@aegis.local",      name: "System Admin",    role: "ADMIN" },
  { email: "manager@aegis.local",    name: "Ahmed Al-Rashid", role: "HSSE_MANAGER" },
  { email: "officer@aegis.local",    name: "Sara Al-Mansour", role: "SAFETY_OFFICER" },
  { email: "supervisor@aegis.local", name: "Khalid Al-Said",  role: "SUPERVISOR" },
  { email: "operator@aegis.local",   name: "Yusuf Al-Habsi",  role: "OPERATOR" },
];

export async function POST() {
  if (process.env.DISABLE_DEMO_SETUP === "1") {
    return NextResponse.json(
      { ok: false, error: { code: "DISABLED", message: "Demo setup disabled" } },
      { status: 403 },
    );
  }

  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);
  const results: { email: string; created: boolean; reset: boolean }[] = [];

  for (const u of DEMO_USERS) {
    const existing = await db.user.findUnique({ where: { email: u.email } });
    if (!existing) {
      await db.user.create({
        data: { email: u.email, passwordHash, name: u.name, role: u.role, isActive: true },
      });
      results.push({ email: u.email, created: true, reset: false });
    } else {
      // Reset the password + ensure active. This makes the quick-login button
      // reliable even if someone changed the password earlier.
      await db.user.update({
        where: { email: u.email },
        data: { passwordHash, isActive: true },
      });
      results.push({ email: u.email, created: false, reset: true });
    }
  }

  return NextResponse.json({
    ok: true,
    data: {
      password: DEMO_PASSWORD,
      users: results,
      hint: "Sign in with any of these emails. Password is the same for all.",
    },
  });
}

export async function GET() {
  // Useful for clicking the URL in a browser to set up before logging in.
  return POST();
}
