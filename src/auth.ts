import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { authConfig } from "@/auth.config";
import { loginSchema } from "@/lib/validations/auth";
import { checkLoginAllowed, recordLoginResult, extractIp } from "@/lib/security/login-tracker";
import { appendAuditLog } from "@/lib/security/audit-chain";
import type { Role } from "@/lib/constants";

export const { auth, handlers, signIn, signOut } = NextAuth({
  ...authConfig,
  // 1-hour session — short window mitigates stolen-token blast radius
  session: { strategy: "jwt", maxAge: 60 * 60 },
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials, request) {
        // Validate input shape
        const parsed = loginSchema.safeParse(credentials);
        if (!parsed.success) return null;

        const { email, password } = parsed.data;
        const emailLc = email.toLowerCase().trim();

        // Best-effort IP extraction — NextAuth doesn't pass req cleanly,
        // so we read headers from the wrapped request when possible.
        const ip = request instanceof Request ? extractIp(request) : null;
        const userAgent = request instanceof Request ? request.headers.get("user-agent") : null;

        // 1. Rate-limit + lockout gate
        const gate = await checkLoginAllowed(emailLc, ip);
        if (!gate.allowed) {
          await recordLoginResult({
            email: emailLc, ip, userAgent, success: false,
            failReason: gate.reason ?? "LOCKED_OUT",
          });
          // Throw to surface the message in the UI (NextAuth wraps it)
          throw new Error(gate.message ?? "Login temporarily blocked.");
        }

        // 2. Lookup user
        const user = await db.user.findUnique({ where: { email: emailLc } });
        if (!user) {
          await recordLoginResult({ email: emailLc, ip, userAgent, success: false, failReason: "NO_USER" });
          return null;
        }
        if (!user.isActive) {
          await recordLoginResult({ email: emailLc, ip, userAgent, success: false, failReason: "INACTIVE" });
          return null;
        }

        // 3. Verify password
        const valid = await bcrypt.compare(password, user.passwordHash);
        if (!valid) {
          const result = await recordLoginResult({
            email: emailLc, ip, userAgent, success: false, failReason: "BAD_PASSWORD",
          });
          if (result.nowLocked && result.lockedUntil) {
            throw new Error(
              `Too many failed attempts. Account locked until ${result.lockedUntil.toLocaleTimeString()}.`,
            );
          }
          return null;
        }

        // 4. Success — clear lockouts, audit, return
        await recordLoginResult({ email: emailLc, ip, userAgent, success: true });

        db.user.update({
          where: { id: user.id },
          data: { lastLoginAt: new Date() },
        }).catch(() => {});

        appendAuditLog({
          module: "AUTH",
          action: "LOGIN",
          actionType: "MANUAL",
          description: `User ${user.email} signed in${ip ? ` from ${ip}` : ""}`,
          metadata: JSON.stringify({ ip, userAgent }),
          userId: user.id,
        }).catch(() => {});

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role as Role,
          department: user.department,
          image: user.avatarUrl,
        };
      },
    }),
  ],
});
