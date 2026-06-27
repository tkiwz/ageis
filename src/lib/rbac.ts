import type { Role } from "@/lib/constants";

/**
 * RBAC permission matrix.
 * Maps URL prefixes to roles that can access them.
 *
 * Example: "/admin" → only ADMIN role
 */
export const ROUTE_PERMISSIONS: Record<string, Role[]> = {
  "/admin/autonomy": ["ADMIN", "HSSE_MANAGER"],
  "/admin/security": ["ADMIN", "HSSE_MANAGER"],
  "/admin":        ["ADMIN"],
  "/intelligence/knowledge": ["ADMIN", "HSSE_MANAGER", "SAFETY_OFFICER", "SUPERVISOR", "OPERATOR"],
  "/intelligence": ["ADMIN", "HSSE_MANAGER"],
  "/governance/privacy": ["ADMIN", "HSSE_MANAGER", "SAFETY_OFFICER", "SUPERVISOR", "OPERATOR", "CONTRACTOR"],
  "/governance":   ["ADMIN", "HSSE_MANAGER"],
  "/command":      ["ADMIN", "HSSE_MANAGER", "SAFETY_OFFICER"],
  "/safety":       ["ADMIN", "HSSE_MANAGER", "SAFETY_OFFICER", "SUPERVISOR"],
  "/operations":   ["ADMIN", "HSSE_MANAGER", "SAFETY_OFFICER", "SUPERVISOR", "OPERATOR"],
  "/dashboard":    ["ADMIN", "HSSE_MANAGER", "SAFETY_OFFICER", "SUPERVISOR", "OPERATOR", "CONTRACTOR"],
};

/**
 * Check if a role can access a given URL path.
 * Returns true if there's no rule for the path (default-allow).
 */
export function canAccessRoute(role: Role, path: string): boolean {
  // Find the most specific matching rule
  const matchedPrefix = Object.keys(ROUTE_PERMISSIONS)
    .filter((prefix) => path.startsWith(prefix))
    .sort((a, b) => b.length - a.length)[0]; // longest prefix wins

  if (!matchedPrefix) return true;
  const allowed = ROUTE_PERMISSIONS[matchedPrefix];
  return allowed?.includes(role) ?? false;
}

/**
 * Module-level access check (used in sidebar visibility).
 */
export const MODULE_ACCESS: Record<string, Role[]> = {
  command:      ["ADMIN", "HSSE_MANAGER", "SAFETY_OFFICER"],
  operations:   ["ADMIN", "HSSE_MANAGER", "SAFETY_OFFICER", "SUPERVISOR", "OPERATOR"],
  safety:       ["ADMIN", "HSSE_MANAGER", "SAFETY_OFFICER", "SUPERVISOR"],
  governance:   ["ADMIN", "HSSE_MANAGER"],
  intelligence: ["ADMIN", "HSSE_MANAGER"],
  admin:        ["ADMIN"],
};

export function canAccessModule(role: Role, moduleName: string): boolean {
  return MODULE_ACCESS[moduleName]?.includes(role) ?? false;
}