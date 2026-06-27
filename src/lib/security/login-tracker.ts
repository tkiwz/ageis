/**
 * Login rate limiting + account lockout.
 *
 * Layers:
 *   1. Per-IP rate limit: max 20 attempts per 15min (mitigates distributed scanning)
 *   2. Per-email rate limit: max 5 failed attempts in 15min → lock 15min
 *   3. Per-email permanent watch: 20 failures in 24h → lock 24h
 *
 * Every attempt (success or failure) is recorded in `LoginAttempt` for audit.
 * Successful login resets the failure counter.
 */
import { db } from "@/lib/db";

const IP_WINDOW_MS = 15 * 60_000;
const IP_MAX_ATTEMPTS = 20;

const EMAIL_WINDOW_MS = 15 * 60_000;
const EMAIL_MAX_FAILURES = 5;
const SHORT_LOCKOUT_MS = 15 * 60_000;

const DAY_WINDOW_MS = 24 * 60 * 60_000;
const DAY_MAX_FAILURES = 20;
const LONG_LOCKOUT_MS = 24 * 60 * 60_000;

export type FailReason =
  | "BAD_PASSWORD"
  | "NO_USER"
  | "INACTIVE"
  | "LOCKED_OUT"
  | "RATE_LIMITED_IP"
  | "INTERNAL_ERROR";

export interface LoginGateResult {
  allowed: boolean;
  reason?: FailReason;
  lockedUntil?: Date;
  retryAfterSec?: number;
  message?: string;
}

/**
 * Call BEFORE attempting password verification.
 * Returns allowed=false if the user/IP is currently rate-limited or locked.
 */
export async function checkLoginAllowed(email: string, ip: string | null): Promise<LoginGateResult> {
  const now = Date.now();
  const emailLc = email.toLowerCase().trim();

  // 1. Per-IP throttle
  if (ip) {
    const ipAttempts = await db.loginAttempt.count({
      where: { ipAddress: ip, createdAt: { gte: new Date(now - IP_WINDOW_MS) } },
    });
    if (ipAttempts >= IP_MAX_ATTEMPTS) {
      return {
        allowed: false,
        reason: "RATE_LIMITED_IP",
        retryAfterSec: Math.ceil(IP_WINDOW_MS / 1000),
        message: "Too many login attempts from your network. Try again in 15 minutes.",
      };
    }
  }

  // 2. Active lockout check
  const lockout = await db.accountLockout.findUnique({ where: { email: emailLc } });
  if (lockout?.lockedUntil && lockout.lockedUntil.getTime() > now) {
    return {
      allowed: false,
      reason: "LOCKED_OUT",
      lockedUntil: lockout.lockedUntil,
      retryAfterSec: Math.ceil((lockout.lockedUntil.getTime() - now) / 1000),
      message: `Account locked. Try again in ${Math.ceil((lockout.lockedUntil.getTime() - now) / 60_000)} minutes.`,
    };
  }

  return { allowed: true };
}

/**
 * Call AFTER attempting password verification. Records the attempt and,
 * on repeated failure, may flip the account to "locked".
 */
export async function recordLoginResult(args: {
  email: string;
  ip: string | null;
  userAgent: string | null;
  success: boolean;
  failReason?: FailReason;
}): Promise<{ nowLocked: boolean; lockedUntil?: Date }> {
  const emailLc = args.email.toLowerCase().trim();
  const now = new Date();

  // Persist the attempt
  await db.loginAttempt.create({
    data: {
      email: emailLc,
      ipAddress: args.ip,
      userAgent: args.userAgent,
      success: args.success,
      failReason: args.failReason,
    },
  });

  // Successful login → clear any lockout for this account
  if (args.success) {
    await db.accountLockout.upsert({
      where: { email: emailLc },
      update: { failCount: 0, lockedUntil: null, lastFailAt: null },
      create: { email: emailLc, failCount: 0 },
    });
    return { nowLocked: false };
  }

  // Failure path
  const shortWindow = new Date(now.getTime() - EMAIL_WINDOW_MS);
  const dayWindow = new Date(now.getTime() - DAY_WINDOW_MS);
  const [recent, daily] = await Promise.all([
    db.loginAttempt.count({ where: { email: emailLc, success: false, createdAt: { gte: shortWindow } } }),
    db.loginAttempt.count({ where: { email: emailLc, success: false, createdAt: { gte: dayWindow } } }),
  ]);

  let lockedUntil: Date | null = null;
  if (daily >= DAY_MAX_FAILURES) {
    lockedUntil = new Date(now.getTime() + LONG_LOCKOUT_MS);
  } else if (recent >= EMAIL_MAX_FAILURES) {
    lockedUntil = new Date(now.getTime() + SHORT_LOCKOUT_MS);
  }

  if (lockedUntil) {
    await db.accountLockout.upsert({
      where: { email: emailLc },
      update: { failCount: daily, lockedUntil, lastFailAt: now },
      create: { email: emailLc, failCount: daily, lockedUntil, lastFailAt: now },
    });
  } else {
    await db.accountLockout.upsert({
      where: { email: emailLc },
      update: { failCount: daily, lastFailAt: now },
      create: { email: emailLc, failCount: daily, lastFailAt: now },
    });
  }

  return { nowLocked: !!lockedUntil, lockedUntil: lockedUntil ?? undefined };
}

/** Extract the client IP from a Next.js request (best effort behind proxies). */
export function extractIp(req: Request): string | null {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  const real = req.headers.get("x-real-ip");
  if (real) return real.trim();
  // Workaround: Next dev server doesn't expose remote address in headers.
  return null;
}
