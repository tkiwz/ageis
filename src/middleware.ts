import { NextResponse, type NextRequest } from "next/server";
import { csrfGate } from "@/lib/security/csrf";

const PUBLIC_PATHS = ["/", "/login", "/api/health", "/api/live", "/api/ready"];
const AUTH_API_PREFIX = "/api/auth";

const SESSION_COOKIES = [
  "authjs.session-token",
  "__Secure-authjs.session-token",
  "next-auth.session-token",
  "__Secure-next-auth.session-token",
];

export function middleware(req: NextRequest) {
  const path = req.nextUrl.pathname;

  // 1. CSRF protection — runs FIRST so it catches even authenticated mutations
  const csrfBlock = csrfGate(req);
  if (csrfBlock) return csrfBlock;

  // 2. Auth endpoints — pass through (NextAuth has its own CSRF)
  if (path.startsWith(AUTH_API_PREFIX)) return NextResponse.next();

  // 3. Device ingest endpoints — protected by x-device-secret (ESP32, RPi, wellness)
  if (path.startsWith("/api/devices/")) return NextResponse.next();
  if (path.startsWith("/api/wellness/ingest")) return NextResponse.next();
  // Vehicle ESP32 ingest — protected by X-Device-Key header, no session needed
  if (path === "/api/data") return NextResponse.next();

  // 4. Public paths
  if (PUBLIC_PATHS.includes(path)) return NextResponse.next();

  // 5. Require session for everything else
  const hasSession = SESSION_COOKIES.some((name) => req.cookies.has(name));
  if (!hasSession) {
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("from", path);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
    "/((?!api/auth|_next|.*\\..*).*)",
  ],
};
