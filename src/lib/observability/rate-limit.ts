/**
 * Sliding-window rate limiter (in-process).
 *
 * Use in route handlers:
 *   const limit = await rateLimit({ key: ip, max: 60, windowMs: 60_000 });
 *   if (!limit.allowed) return fail("RATE_LIMITED", `Try again in ${limit.retryAfterMs}ms`, 429);
 */

interface Bucket {
  timestamps: number[];
}

const BUCKETS = new Map<string, Bucket>();
const MAX_BUCKETS = 10_000;

function getBucket(key: string): Bucket {
  let b = BUCKETS.get(key);
  if (!b) {
    if (BUCKETS.size >= MAX_BUCKETS) {
      // evict oldest 10%
      const evict = Math.floor(MAX_BUCKETS * 0.1);
      let n = 0;
      for (const k of BUCKETS.keys()) {
        BUCKETS.delete(k);
        if (++n >= evict) break;
      }
    }
    b = { timestamps: [] };
    BUCKETS.set(key, b);
  }
  return b;
}

export interface RateLimitOptions {
  key: string;
  max: number;
  windowMs: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAtMs: number;
  retryAfterMs?: number;
}

export function rateLimit(opts: RateLimitOptions): RateLimitResult {
  const now = Date.now();
  const cutoff = now - opts.windowMs;
  const bucket = getBucket(opts.key);
  // Drop old timestamps
  while (bucket.timestamps.length && bucket.timestamps[0] < cutoff) bucket.timestamps.shift();

  if (bucket.timestamps.length >= opts.max) {
    const oldest = bucket.timestamps[0];
    const retryAfterMs = oldest + opts.windowMs - now;
    return { allowed: false, remaining: 0, resetAtMs: oldest + opts.windowMs, retryAfterMs };
  }

  bucket.timestamps.push(now);
  return {
    allowed: true,
    remaining: opts.max - bucket.timestamps.length,
    resetAtMs: bucket.timestamps[0] + opts.windowMs,
  };
}

/** Extract client IP from a Next.js request — best effort behind proxies. */
export function getClientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  const real = req.headers.get("x-real-ip");
  if (real) return real;
  return "unknown";
}
