/** GET /api/ai/video/:id — stream a stored incident video (auth + site check, Range support). */
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { fail } from "@/lib/api-response";
import { requireScopedAuth } from "@/lib/scoped-auth";
import { denyUnlessSiteVisible } from "@/lib/security/site-guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const scope = await requireScopedAuth();
  if (scope instanceof Response) return scope;
  const { id } = await ctx.params;
  const v = await db.incidentVideo.findUnique({ where: { id }, select: { incidentId: true, status: true, data: true, mimeType: true } });
  if (!v || v.status !== "COMPLETED" || !v.data) return fail("NOT_FOUND", "Video not found", 404);
  const hidden = await denyUnlessSiteVisible("incident", v.incidentId);
  if (hidden) return hidden;

  const buf = Buffer.from(v.data);
  const type = v.mimeType ?? "video/mp4";
  const range = req.headers.get("range")?.match(/bytes=(\d*)-(\d*)/);
  if (range) {
    const start = range[1] ? parseInt(range[1], 10) : 0;
    const end = range[2] ? Math.min(parseInt(range[2], 10), buf.length - 1) : buf.length - 1;
    return new Response(buf.subarray(start, end + 1), {
      status: 206,
      headers: { "Content-Type": type, "Content-Range": `bytes ${start}-${end}/${buf.length}`, "Accept-Ranges": "bytes", "Content-Length": String(end - start + 1), "Cache-Control": "private, max-age=86400" },
    });
  }
  return new Response(buf, { headers: { "Content-Type": type, "Content-Length": String(buf.length), "Accept-Ranges": "bytes", "Cache-Control": "private, max-age=86400" } });
}
