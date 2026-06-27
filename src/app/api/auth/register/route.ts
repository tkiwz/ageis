import { NextRequest } from "next/server";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { ok, fail } from "@/lib/api-response";
import { registerSchema } from "@/lib/validations/auth";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return fail("INVALID_BODY", "Invalid JSON", 400);
  }

  const parsed = registerSchema.safeParse(body);
  if (!parsed.success) {
    return fail("VALIDATION", parsed.error.issues[0]?.message ?? "Invalid input", 400);
  }

  const { name, email, password } = parsed.data;
  const emailLc = email.toLowerCase().trim();

  // Check if email already exists
  const existing = await db.user.findUnique({ where: { email: emailLc } });
  if (existing) {
    return fail("EXISTS", "هذا البريد الإلكتروني مسجل مسبقاً", 409);
  }

  const passwordHash = await bcrypt.hash(password, 10);

  await db.user.create({
    data: {
      email: emailLc,
      name: name.trim(),
      role: "ADMIN",
      passwordHash,
      isActive: true,
    },
  });

  return ok({ message: "تم إنشاء حساب المدير بنجاح" });
}
