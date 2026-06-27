/**
 * POST /api/knowledge/contribute
 * Body: {
 *   source: "QUICK_INSIGHT" | "INCIDENT_RETRO" | "VOICE_MEMO",
 *   rawContent: string,
 *   contextType?: string,
 *   contextId?: string,
 *   transcript?: string,
 *   language?: string
 * }
 *
 * Note: DOCUMENT source uses /api/knowledge/upload instead (multipart).
 */
import { NextRequest } from "next/server";
import { auth } from "@/auth";
import { ok, fail, unauthorized } from "@/lib/api-response";
import { ingestContribution } from "@/lib/knowledge/ingest";
import type { ContributionSource } from "@/lib/knowledge/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const VALID_SOURCES: ContributionSource[] = ["QUICK_INSIGHT", "INCIDENT_RETRO", "VOICE_MEMO"];

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return unauthorized();

  let body: {
    source?: string;
    rawContent?: string;
    contextType?: string;
    contextId?: string;
    transcript?: string;
    language?: string;
  };
  try { body = await req.json(); } catch { return fail("INVALID_BODY", "Invalid JSON", 400); }

  if (!body.source || !VALID_SOURCES.includes(body.source as ContributionSource)) {
    return fail("BAD_SOURCE", `source must be one of: ${VALID_SOURCES.join(", ")}`, 400);
  }
  if (!body.rawContent || body.rawContent.trim().length < 10) {
    return fail("TOO_SHORT", "rawContent must be at least 10 characters", 400);
  }
  if (body.rawContent.length > 8000) {
    return fail("TOO_LONG", "rawContent exceeds 8000 characters", 400);
  }

  const result = await ingestContribution({
    source: body.source as ContributionSource,
    rawContent: body.rawContent,
    contributorId: session.user.id!,
    contextType: body.contextType,
    contextId: body.contextId,
    transcript: body.transcript,
    language: body.language,
  });

  return ok(result);
}
