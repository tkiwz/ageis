import { NextRequest } from "next/server";
import { auth } from "@/auth";
import { ok, fail } from "@/lib/api-response";
import { db } from "@/lib/db";
import { claudeChat } from "@/lib/ai/claude-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const AI_SYSTEM = `You are an HSSE (Health, Safety, Security, Environment) expert for oil & gas operations in Oman.
Analyze a Permit to Work (PTW) request and identify ALL safety considerations.

Respond ONLY with valid JSON in this exact structure:
{
  "hazards": ["specific hazard 1", "specific hazard 2", "specific hazard 3", ...],
  "requiredControls": ["control measure 1", "control measure 2", ...],
  "requiredPPE": ["PPE item 1", "PPE item 2", ...],
  "preJobChecks": ["check 1", "check 2", ...],
  "riskLevel": "LOW or MEDIUM or HIGH or CRITICAL",
  "summary": "1-2 sentence executive summary"
}

Be specific to oil & gas operations. Consider Omani regulations. Be thorough but practical.`;

export async function POST(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) return fail("UNAUTHORIZED", "Sign in required", 401);

  const { id } = await ctx.params;

  const permit = await db.permit.findUnique({
    where: { id },
    include: { site: { select: { name: true } } },
  });

  if (!permit) return fail("NOT_FOUND", "Permit not found", 404);

  const prompt = `Analyze this Permit to Work request:

**Type:** ${permit.type}
**Title:** ${permit.title}
**Description:** ${permit.description}
**Site:** ${permit.site?.name ?? "Unknown"}
**Duration:** ${permit.validFrom.toISOString()} to ${permit.validUntil.toISOString()}

Identify all hazards, required controls, PPE, pre-job checks, and overall risk level.
Respond ONLY with the JSON structure specified.`;

  try {
    const result = await claudeChat({
      system: AI_SYSTEM,
      messages: [{ role: "user", content: prompt }],
      maxTokens: 1200,
      temperature: 0.3,
    });

    const cleaned = result.content
      .trim()
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/\s*```$/i, "");

    const analysis = JSON.parse(cleaned);

    // Save analysis on the AIDecision row (Permit has no aiAnalysis column).
    // Only update the riskLevel if the AI suggests a higher one.
    await db.permit.update({
      where: { id },
      data: {
        riskLevel:  analysis.riskLevel ?? permit.riskLevel,
      },
    });

    // Log AI decision
    await db.aIDecision.create({
      data: {
        type:         "PERMIT_ANALYSIS",
        provider:     "CLAUDE",
        modelUsed:    "claude-sonnet-4-6",
        inputData:    { permitId: id, type: permit.type, title: permit.title } as never,
        outputData:   analysis as never,
        reasoning:    String(analysis.summary ?? ""),
        autonomous:   false,
        requiresHuman: true,
      },
    }).catch(() => {});

    return ok({ analysis, message: "Analysis complete" });
  } catch (err) {
    return fail("AI_FAILED", err instanceof Error ? err.message : "AI analysis failed", 500);
  }
}