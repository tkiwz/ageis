import type { Role } from "@/lib/constants";

/**
 * RBAC permission matrix.
 * Maps URL prefixes to roles that can access them.
 *
 * Example: "/admin" → only ADMIN role
 */
// Longest prefix wins. The sidebar is derived from this table, so a link is
// shown only if the role can open it.
const ALL: Role[] = ["ADMIN", "HSSE_MANAGER", "SAFETY_OFFICER", "SUPERVISOR", "OPERATOR", "CONTRACTOR"];
const FIELD_ROLES: Role[] = ["ADMIN", "HSSE_MANAGER", "SAFETY_OFFICER", "SUPERVISOR", "OPERATOR"];
const SUPERVISE_ROLES: Role[] = ["ADMIN", "HSSE_MANAGER", "SAFETY_OFFICER", "SUPERVISOR"];
const SAFETY_ROLES: Role[] = ["ADMIN", "HSSE_MANAGER", "SAFETY_OFFICER"];
const MANAGE_ROLES: Role[] = ["ADMIN", "HSSE_MANAGER"];

export const ROUTE_PERMISSIONS: Record<string, Role[]> = {
  "/admin/alerts":   SUPERVISE_ROLES,
  "/admin/autonomy": MANAGE_ROLES,
  "/admin/security": MANAGE_ROLES,
  "/admin":          ["ADMIN"],
  "/intelligence/chat":        FIELD_ROLES,
  "/intelligence/knowledge":   FIELD_ROLES,
  "/intelligence/brain":       SAFETY_ROLES,
  "/intelligence/suggestions": SAFETY_ROLES,
  "/intelligence":   MANAGE_ROLES,
  "/governance/privacy":     ALL,
  "/governance/inspections": SAFETY_ROLES,
  "/governance":     MANAGE_ROLES,
  "/command":        SAFETY_ROLES,
  "/safety/observations":    FIELD_ROLES,
  "/safety/investigations":  SAFETY_ROLES,
  "/safety/risk":            SAFETY_ROLES,
  "/safety":         SUPERVISE_ROLES,
  "/operations/devices":     SUPERVISE_ROLES,
  "/operations/drones":      SUPERVISE_ROLES,
  "/operations":     FIELD_ROLES,
  "/dashboard":      ALL,
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
/**
 * Role groups for API write permissions (each includes the ones above it).
 * Used by denyUnlessRole() in route handlers.
 */
const MANAGE: Role[] = ["ADMIN", "HSSE_MANAGER"];
const SAFETY: Role[] = [...MANAGE, "SAFETY_OFFICER"];
const SUPERVISE: Role[] = [...SAFETY, "SUPERVISOR"];
const FIELD: Role[] = [...SUPERVISE, "OPERATOR"];

export const ROLE_GROUPS = { MANAGE, SAFETY, SUPERVISE, FIELD } as const;
