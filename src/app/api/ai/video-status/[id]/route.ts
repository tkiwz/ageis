/**
 * GET /api/ai/video-status/:videoId — poll a video; when Veo is done the file is
 * downloaded on the server and stored, so the Google key never reaches the browser.
 */
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { ok, fail } from "@/lib/api-response";
import { requireScopedAuth } from "@/lib/scoped-auth";
import { denyUnlessSiteVisible } from "@/lib/security/site-guard";
import { pollVeo } from "@/lib/ai/incident-video";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const scope = await requireScopedAuth();
  if (scope instanceof Response) return scope;
  const { id } = await ctx.params;

  const video = await db.incidentVideo.findUnique({ where: { id }, select: { id: true, incidentId: true, status: true, operationId: true, error: true } });
  if (!video) return fail("NOT_FOUND", "Video not found", 404);
  const hidden = await denyUnlessSiteVisible("incident", video.incidentId);
  if (hidden) return hidden;

  if (video.status !== "PROCESSING" || !video.operationId) {
    return ok({ status: video.status, videoUrl: video.status === "COMPLETED" ? `/api/ai/video/${id}` : null, error: video.error });
  }

  const r = await pollVeo(video.operationId);
  if (!r.done) return ok({ status: "PROCESSING", videoUrl: null });
  if ("error" in r) {
    await db.incidentVideo.update({ where: { id }, data: { status: "FAILED", error: r.error.slice(0, 300) } });
    return ok({ status: "FAILED", videoUrl: null, error: r.error });
  }
  await db.incidentVideo.update({
    where: { id },
    data: { status: "COMPLETED", data: new Uint8Array(r.bytes), mimeType: r.mimeType, sizeBytes: r.bytes.length, completedAt: new Date() },
  });
  return ok({ status: "COMPLETED", videoUrl: `/api/ai/video/${id}` });
}
