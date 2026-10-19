/**
 * Role gate for API handlers. Reads the role from the JWT session only
 * (no DB query), so it is cheap to put at the top of every write handler.
 *
 *   const denied = await denyUnlessRole(ROLE_GROUPS.SAFETY);
 *   if (denied) return denied;
 */
import { auth } from "@/auth";
import { forbidden, unauthorized } from "@/lib/api-response";
import type { Role } from "@/lib/constants";

export async function denyUnlessRole(allowed: readonly Role[]) {
  const session = await auth();
  if (!session?.user) return unauthorized();
  if (!allowed.includes(session.user.role as Role)) {
    return forbidden("Your role cannot perform this action");
  }
  return null;
}
