import { auth } from "@/auth";
import { redirect } from "next/navigation";
import type { Role } from "@/lib/constants";
import { canAccessRoute } from "@/lib/rbac";

/**
 * Get the current logged-in user (or null).
 * Use in Server Components or API routes.
 */
export async function getCurrentUser() {
  const session = await auth();
  return session?.user ?? null;
}

/**
 * Require authentication — redirects to /login if not logged in.
 */
export async function requireAuth() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

/**
 * Require a specific role (or one of several).
 * Redirects to /dashboard?denied=true if user lacks permission.
 */
export async function requireRole(allowed: Role | Role[]) {
  const user = await requireAuth();
  const allowedArr = Array.isArray(allowed) ? allowed : [allowed];
  if (!allowedArr.includes(user.role)) {
    redirect("/dashboard?denied=true");
  }
  return user;
}

/**
 * Require access to a specific route path (uses RBAC matrix).
 */
export async function requireRouteAccess(path: string) {
  const user = await requireAuth();
  if (!canAccessRoute(user.role, path)) {
    redirect("/dashboard?denied=true");
  }
  return user;
}