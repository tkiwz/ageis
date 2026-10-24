/**
 * POST /api/checkin — worker "I'm safe" check-in from the mobile app.
 * Writes an audit entry (no AI call). Any signed-in role may check in.
 */
import { z } from "zod";
import { ok, fail } from "@/lib/api-response";
import { requireScopedAuth } from "@/lib/scoped-auth";
import { appendAuditLog } from "@/lib/security/audit-chain";

export const dynamic = "force-dynamic";

const schema = z.object({
  clientId: z.string().uuid(),
  at: z.string().datetime().optional(),
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
});

export async function POST(req: Request) {
  const scope = await requireScopedAuth();
  if (scope instanceof Response) return scope;
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail("VALIDATION", "Invalid check-in", 400);
  const b = parsed.data;
  const at = b.at ? new Date(b.at) : new Date();

  await appendAuditLog({
    module: "SAFETY",
    action: "WORKER_SAFE_CHECKIN",
    actionType: "MANUAL",
    description: `Worker checked in safe: ${scope.email ?? scope.userId}`,
    metadata: JSON.stringify({ clientId: b.clientId, at: at.toISOString(), lat: b.lat, lng: b.lng }),
    userId: scope.userId,
  });
  return ok({ recordedAt: at.toISOString() });
}
