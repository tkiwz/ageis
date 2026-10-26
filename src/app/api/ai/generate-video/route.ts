/**
 * Incident training video.
 *   GET  ?incidentId=…            latest video for the incident (no cost)
 *   POST { incidentId, dryRun? , force? }
 *        dryRun → brief + free key check, no Veo call
 *        an existing COMPLETED/PROCESSING video is returned instead of paying again,
 *        unless force=true (manager asks for a new one)
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { ok, fail } from "@/lib/api-response";
import { denyUnlessRole } from "@/lib/security/api-guard";
import { ROLE_GROUPS } from "@/lib/rbac";
import { aiGuard } from "@/lib/security/ai-guard";
import { denyUnlessSiteVisible } from "@/lib/security/site-guard";
import { requireScopedAuth } from "@/lib/scoped-auth";
import { VEO_ESTIMATED_USD, VEO_MODEL, checkVeo, submitVeo, veoConfigured, writeBrief } from "@/lib/ai/incident-video";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const PUBLIC_FIELDS = {
  id: true, status: true, summaryEn: true, summaryAr: true, lessonsEn: true, lessonsAr: true,
  error: true, createdAt: true, completedAt: true, prompt: true,
} as const;

function present(v: { id: string; status: string; lessonsEn: string | null; lessonsAr: string | null } & Record<string, unknown>) {
  const parse = (s: string | null) => { try { return s ? (JSON.parse(s) as string[]) : []; } catch { return []; } };
  return {
    ...v,
    lessonsEn: parse(v.lessonsEn),
    lessonsAr: parse(v.lessonsAr),
    videoUrl: v.status === "COMPLETED" ? `/api/ai/video/${v.id}` : null,
  };
}

export async function GET(req: NextRequest) {
  const scope = await requireScopedAuth();
  if (scope instanceof Response) return scope;
  const incidentId = req.nextUrl.searchParams.get("incidentId");
  if (!incidentId) return fail("VALIDATION", "incidentId required", 400);
  const hidden = await denyUnlessSiteVisible("incident", incidentId);
  if (hidden) return hidden;
  const video = await db.incidentVideo.findFirst({ where: { incidentId }, orderBy: { createdAt: "desc" }, select: PUBLIC_FIELDS });
  return ok({ video: video ? present(video) : null, estimatedUsd: VEO_ESTIMATED_USD, configured: veoConfigured() });
}

const bodySchema = z.object({ incidentId: z.string().min(1).max(40), dryRun: z.boolean().optional(), force: z.boolean().optional() });

export async function POST(req: NextRequest) {
  const denied = await denyUnlessRole(ROLE_GROUPS.MANAGE);
  if (denied) return denied;
  const scope = await requireScopedAuth();
  if (scope instanceof Response) return scope;

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail("VALIDATION", "incidentId required", 400);
  const { incidentId, dryRun, force } = parsed.data;
  const hidden = await denyUnlessSiteVisible("incident", incidentId);
  if (hidden) return hidden;

  // Reuse: never pay twice for the same incident
  if (!force && !dryRun) {
    const existing = await db.incidentVideo.findFirst({
      where: { incidentId, status: { in: ["COMPLETED", "PROCESSING"] } },
      orderBy: { createdAt: "desc" },
      select: PUBLIC_FIELDS,
    });
    if (existing) return ok({ video: present(existing), reused: true });
  }

  const incident = await db.incident.findUnique({ where: { id: incidentId }, include: { site: { select: { name: true } } } });
  if (!incident) return fail("NOT_FOUND", "Incident not found", 404);

  if (!dryRun) {
    const limited = await aiGuard("video");
    if (limited) return limited;
  }

  let brief;
  try {
    brief = await writeBrief({ ...incident, siteName: incident.site?.name });
  } catch {
    return fail("BRIEF_FAILED", "Could not prepare the video brief. Try again.", 502);
  }

  if (dryRun) {
    return ok({ dryRun: true, brief, veoReachable: veoConfigured() ? await checkVeo() : false, estimatedUsd: VEO_ESTIMATED_USD });
  }
  if (!veoConfigured()) return fail("NOT_CONFIGURED", "Video generation is not configured", 503);

  let operationId: string;
  try {
    operationId = await submitVeo(brief.prompt);
  } catch (e) {
    console.error("[veo] submit", (e as Error).message);
    return fail("VIDEO_FAILED", "Video generation could not start. Try again later.", 502);
  }

  const video = await db.incidentVideo.create({
    data: {
      incidentId,
      operationId,
      model: VEO_MODEL,
      prompt: brief.prompt,
      summaryEn: brief.summaryEn,
      summaryAr: brief.summaryAr,
      lessonsEn: JSON.stringify(brief.lessonsEn),
      lessonsAr: JSON.stringify(brief.lessonsAr),
      createdById: scope.userId,
    },
    select: PUBLIC_FIELDS,
  });
  return ok({ video: present(video), reused: false });
}
