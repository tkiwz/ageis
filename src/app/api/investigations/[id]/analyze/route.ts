/**
 * POST /api/investigations/[id]/analyze
 *
 * Runs AEGIS AI root-cause analysis on an investigation.
 * Uses 5-Whys methodology + contributing factors + corrective actions.
 * Stores result as JSON in investigation.summary, plain root cause in investigation.rootCause.
 */

import { NextRequest, NextResponse } from "next/server";
import { ok, fail }                  from "@/lib/api-response";
import { db }                        from "@/lib/db";
import { requireScopedAuth }         from "@/lib/scoped-auth";
import { claudeChat }                from "@/lib/ai/claude-client";

export const runtime    = "nodejs";
export const dynamic    = "force-dynamic";
export const maxDuration = 60;

interface Why {
  level:    number;
  question: string;
  answer:   string;
}

interface AnalysisResult {
  whys:                       Why[];
  rootCause:                  string;
  contributingFactors:        string[];
  immediateCorrectiveActions: string[];
  systemicPreventiveActions:  string[];
  riskLevel:                  "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  bowTie: {
    threats:      string[];
    topEvent:     string;
    consequences: string[];
    barriers:     string[];
  };
  summary: string;
}

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const scope = await requireScopedAuth();
  if (scope instanceof NextResponse) return scope;

  const { id } = await params;

  const investigation = await db.investigation.findUnique({
    where: { id },
    include: {
      incident: {
        select: {
          incidentNumber: true, title: true, description: true,
          type: true, severity: true, location: true, occurredAt: true, siteId: true,
          actions: {
            select: { description: true, status: true },
            take: 10,
          },
        },
      },
    },
  });

  if (!investigation) return fail("NOT_FOUND", "Investigation not found", 404);
  if (!scope.canSee(investigation.incident.siteId)) return fail("NOT_FOUND", "Not found", 404);

  const inc = investigation.incident;
  const actionsText = inc.actions.length
    ? inc.actions.map((a, i) => `  ${i + 1}. [${a.status}] ${a.description.slice(0, 200)}`).join("\n")
    : "  None recorded.";

  const prompt = `You are AEGIS Safety AI performing a formal incident investigation analysis.

INCIDENT DETAILS:
- Number: ${inc.incidentNumber}
- Title: ${inc.title}
- Type: ${inc.type}
- Severity: ${inc.severity}
- Location: ${inc.location}
- Occurred: ${new Date(inc.occurredAt).toLocaleString()}
- Description: ${inc.description}

ACTIONS TAKEN SO FAR:
${actionsText}

Perform a comprehensive root-cause analysis using the 5-Whys methodology. Return ONLY valid JSON — no markdown, no explanation outside the JSON.

{
  "whys": [
    { "level": 1, "question": "Why did the incident occur?", "answer": "..." },
    { "level": 2, "question": "Why did [answer to Why 1] occur?", "answer": "..." },
    { "level": 3, "question": "Why did [answer to Why 2] occur?", "answer": "..." },
    { "level": 4, "question": "Why did [answer to Why 3] occur?", "answer": "..." },
    { "level": 5, "question": "Why did [answer to Why 4] occur?", "answer": "..." }
  ],
  "rootCause": "Concise root cause statement (1-2 sentences)",
  "contributingFactors": ["factor 1", "factor 2", "factor 3"],
  "immediateCorrectiveActions": ["action 1", "action 2", "action 3"],
  "systemicPreventiveActions": ["action 1", "action 2", "action 3"],
  "riskLevel": "HIGH",
  "bowTie": {
    "threats": ["threat 1", "threat 2"],
    "topEvent": "The central event that occurred",
    "consequences": ["consequence 1", "consequence 2"],
    "barriers": ["existing control 1", "recommended control 2"]
  },
  "summary": "2-3 sentence professional summary of findings and recommendations."
}`;

  let analysis: AnalysisResult;
  try {
    const result = await claudeChat({
      system:    "You are AEGIS Safety Intelligence. Return ONLY valid JSON as instructed. No markdown code blocks, no preamble.",
      messages:  [{ role: "user", content: prompt }],
      maxTokens: 1200,
      temperature: 0.3,
    });

    // Strip any accidental markdown fences
    const cleaned = result.content.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();
    analysis = JSON.parse(cleaned) as AnalysisResult;
  } catch (e) {
    return fail("AI_ERROR", `AI analysis failed: ${String(e)}`, 500);
  }

  // Persist: rootCause as plain text, summary as JSON blob
  await db.investigation.update({
    where: { id },
    data: {
      rootCause:    analysis.rootCause,
      summary:      JSON.stringify(analysis),
      hasAIEvidence: true,
    },
  });

  // Audit
  await db.auditLog.create({
    data: {
      action:      "AI_INVESTIGATION_ANALYSIS",
      module:      "SAFETY",
      actionType:  "AI_AUTONOMOUS",
      isAutonomous: true,
      description: `AI 5-Whys analysis completed for ${inc.incidentNumber}`,
      userId:      scope.userId,
      metadata:    JSON.stringify({ investigationId: id, riskLevel: analysis.riskLevel }),
    },
  }).catch(() => {});

  return ok({ analysis });
}
