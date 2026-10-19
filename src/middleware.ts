import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { authConfig } from "@/auth.config";
import { csrfGate } from "@/lib/security/csrf";
import { canAccessRoute } from "@/lib/rbac";
import type { Role } from "@/lib/constants";

const PUBLIC_PATHS = ["/", "/login", "/api/health", "/api/live", "/api/ready"];
const AUTH_API_PREFIX = "/api/auth";

// Edge-safe NextAuth instance: decodes + verifies the JWT session cookie.
const { auth } = NextAuth(authConfig);

export default auth((req) => {
  const path = req.nextUrl.pathname;
  const user = req.auth?.user;

  // 1. CSRF protection — runs FIRST so it catches even authenticated mutations
  const csrfBlock = csrfGate(req);
  if (csrfBlock) return csrfBlock;

  // 2. Auth endpoints — pass through (NextAuth has its own CSRF)
  if (path.startsWith(AUTH_API_PREFIX)) return NextResponse.next();

  // 3. API routes enforce auth themselves (session → 401, devices → secret)
  if (path.startsWith("/api/")) return NextResponse.next();

  // 4. Static files from /public (manifest, sw.js, models...)
  if (/\.[a-z0-9]+$/i.test(path)) return NextResponse.next();

  // 5. Public pages
  if (PUBLIC_PATHS.includes(path)) {
    if (path === "/login" && user) {
      return NextResponse.redirect(new URL("/dashboard", req.url));
    }
    return NextResponse.next();
  }

  // 6. Pages require a valid session
  if (!user) {
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("from", path);
    return NextResponse.redirect(loginUrl);
  }

  // 7. RBAC on every page path (longest-prefix match in ROUTE_PERMISSIONS)
  const role = (user.role ?? null) as Role | null;
  if (!role || !canAccessRoute(role, path)) {
    return NextResponse.redirect(new URL("/dashboard?denied=true", req.url));
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
