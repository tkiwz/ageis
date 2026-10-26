/** GET /api/incidents/photos/:id — incident photo (auth + site check). */
import { db } from "@/lib/db";
import { fail } from "@/lib/api-response";
import { requireScopedAuth } from "@/lib/scoped-auth";
import { denyUnlessSiteVisible } from "@/lib/security/site-guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const scope = await requireScopedAuth();
  if (scope instanceof Response) return scope;
  const { id } = await ctx.params;
  const p = await db.incidentPhoto.findUnique({ where: { id }, select: { incidentId: true, data: true, mimeType: true } });
  if (!p) return fail("NOT_FOUND", "Photo not found", 404);
  const hidden = await denyUnlessSiteVisible("incident", p.incidentId);
  if (hidden) return hidden;
  return new Response(Buffer.from(p.data), {
    headers: { "Content-Type": p.mimeType, "Cache-Control": "private, max-age=604800, immutable", "X-Content-Type-Options": "nosniff" },
  });
}
