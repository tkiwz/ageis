/**
 * POST /api/risk-assessments/analyze
 * Body: { hazardDescription, type, riskBefore }
 * Returns: { controlsSuggested, riskAfter }
 */

import { NextRequest, NextResponse } from "next/server";
import { ok, fail }                  from "@/lib/api-response";
import { requireScopedAuth }         from "@/lib/scoped-auth";
import { claudeChat }                from "@/lib/ai/claude-client";

export const runtime     = "nodejs";
export const dynamic     = "force-dynamic";
export const maxDuration = 45;

export async function POST(req: NextRequest) {
  const scope = await requireScopedAuth();
  if (scope instanceof NextResponse) return scope;

  let body: { hazardDescription: string; type: string; riskBefore: string };
  try { body = await req.json(); } catch { return fail("INVALID_BODY", "Invalid JSON", 400); }
  if (!body.hazardDescription) return fail("MISSING", "hazardDescription required", 400);

  const prompt = `You are AEGIS Safety AI. A safety officer is filling in a risk assessment and needs your help suggesting controls.

HAZARD TYPE: ${body.type ?? "GENERAL"}
INITIAL RISK LEVEL: ${body.riskBefore ?? "MEDIUM"}
HAZARD DESCRIPTION: ${body.hazardDescription}

Respond with ONLY valid JSON — no markdown, no explanation:
{
  "controlsSuggested": "Detailed, practical control measures as a single block of text. Include engineering controls, administrative controls, and PPE. Use numbered sentences. Be specific and actionable.",
  "riskAfter": "LOW"
}

riskAfter must be one of: LOW, MEDIUM, HIGH, CRITICAL
Choose based on whether the suggested controls would realistically reduce the risk.`;

  let result: { controlsSuggested: string; riskAfter: string };
  try {
    const r = await claudeChat({
      system:      "You are AEGIS Safety Intelligence. Return ONLY valid JSON as instructed. No markdown code blocks.",
      messages:    [{ role: "user", content: prompt }],
      maxTokens:   600,
      temperature: 0.3,
    });
    const cleaned = r.content.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();
    result = JSON.parse(cleaned) as { controlsSuggested: string; riskAfter: string };
  } catch (e) {
    return fail("AI_ERROR", `AI analysis failed: ${String(e)}`, 500);
  }

  return ok(result);
}
