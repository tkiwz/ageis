/**
 * CSRF protection — Origin / Referer header validation.
 *
 * Browsers ALWAYS send Origin (or Referer for older browsers) on cross-origin
 * fetch requests. By requiring it matches our server's host, we block
 * cross-site form submissions / image-trick fetches from other domains.
 *
 * Allowed sources of requests:
 *   - Same origin (host matches request URL)
 *   - "x-cron-secret" header presence (server-to-server cron)
 *   - "x-device-secret" header presence (ESP32 device push)
 *
 * Anything else → 403.
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/** Methods that mutate state — these need CSRF protection. */
const UNSAFE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/**
 * Returns null if the request passes CSRF checks, or a 403 NextResponse if not.
 * Add other allowed origins (e.g. mobile app schemes) here if needed.
 */
export function csrfGate(req: NextRequest): NextResponse | null {
  // Only check unsafe methods
  if (!UNSAFE_METHODS.has(req.method)) return null;

  // Skip when explicit server-to-server secret is provided
  if (req.headers.get("x-cron-secret") || req.headers.get("x-device-secret")) {
    return null;
  }

  // Auth endpoints: NextAuth handles its own CSRF token internally
  if (req.nextUrl.pathname.startsWith("/api/auth")) return null;

  // Device endpoints — ESP32/RPi send no browser headers; middleware already
  // protects them via x-device-secret when DEVICE_INGEST_SECRET is set.
  if (req.nextUrl.pathname.startsWith("/api/devices/")) return null;
  if (req.nextUrl.pathname.startsWith("/api/wellness/ingest")) return null;
  // Vehicle ESP32 ingest — protected by X-Device-Key (DEVICE_INGEST_SECRET)
  if (req.nextUrl.pathname === "/api/data") return null;
  // Allow requests that carry the device key header (any device endpoint)
  if (req.headers.get("x-device-key")) return null;

  const origin = req.headers.get("origin");
  const referer = req.headers.get("referer");
  const host = req.headers.get("host");

  if (!host) {
    // No host header → suspect → block
    return forbid("Missing Host header");
  }

  // Build the set of acceptable hosts. Trust localhost variants in dev.
  const allowedHosts = new Set<string>([host]);
  if (process.env.NEXTAUTH_URL) {
    try {
      allowedHosts.add(new URL(process.env.NEXTAUTH_URL).host);
    } catch { /* ignore */ }
  }

  // Origin is the strongest signal — when present, it MUST match
  if (origin) {
    try {
      const originHost = new URL(origin).host;
      if (allowedHosts.has(originHost)) return null;
      return forbid(`Cross-origin request from ${originHost} blocked`);
    } catch {
      return forbid("Malformed Origin header");
    }
  }

  // No Origin → fall back to Referer
  if (referer) {
    try {
      const refererHost = new URL(referer).host;
      if (allowedHosts.has(refererHost)) return null;
      return forbid(`Cross-origin request from ${refererHost} blocked`);
    } catch {
      return forbid("Malformed Referer header");
    }
  }

  // No Origin AND no Referer on a state-changing request → suspicious.
  // Some legitimate clients (curl, mobile apps) won't send Origin — for those
  // require an explicit x-aegis-client header opt-in.
  if (req.headers.get("x-aegis-client")) return null;

  return forbid("Missing Origin/Referer on state-changing request");
}

function forbid(reason: string): NextResponse {
  return NextResponse.json(
    { ok: false, error: { code: "CSRF_BLOCKED", message: reason } },
    { status: 403 },
  );
}