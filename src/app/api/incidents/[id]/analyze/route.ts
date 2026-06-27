import { NextRequest } from "next/server";
import { auth } from "@/auth";
import { ok, fail } from "@/lib/api-response";
import { db } from "@/lib/db";
import { claudeChat } from "@/lib/ai/claude-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SYSTEM = `You are an expert HSSE incident analyst for oil & gas operations in Oman.
Analyze the incident and respond ONLY with valid JSON matching this schema (no markdown, no extra text):
{
  "rootCause": "Primary root cause in 1-2 sentences",
  "contributingFactors": ["factor 1", "factor 2", "factor 3"],
  "immediateActions": ["urgent action 1", "urgent action 2", "urgent action 3"],
  "preventiveActions": ["long-term action 1", "long-term action 2"],
  "riskLevel": "LOW or MEDIUM or HIGH or CRITICAL",
  "recommendations": ["recommendation 1", "recommendation 2"],
  "summary": "Executive summary in 2-3 sentences for management.",
  "similarRiskAreas": ["area or activity at risk 1", "area or activity at risk 2"]
}`;

export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return fail("UNAUTHORIZED", "Sign in required", 401);

  const { id } = await ctx.params;

  const incident = await db.incident.findUnique({
    where: { id },
    include: {
      site:     true,
      reporter: { select: { name: true, role: true } },
      actions:  { select: { description: true, status: true } },
    },
  });

  if (!incident) return fail("NOT_FOUND", "Incident not found", 404);

  const userPrompt = `Analyze this HSSE incident:

Incident Number: ${incident.incidentNumber}
Title: ${incident.title}
Type: ${incident.type}
Severity: ${incident.severity}
Status: ${incident.status}
Location: ${incident.location}
Site: ${incident.site?.name ?? "Unknown"} (${incident.site?.code ?? "N/A"})
Occurred: ${incident.occurredAt.toISOString()}
Description: ${incident.description}
Actions taken so far: ${
  incident.actions.length > 0
    ? incident.actions.map((a) => `${a.description} [${a.status}]`).join("; ")
    : "None yet"
}

Respond ONLY with the JSON object.`;

  let analysis: Record<string, unknown>;
  try {
    const result = await claudeChat({
      system: SYSTEM,
      messages: [{ role: "user", content: userPrompt }],
      maxTokens: 1200,
      temperature: 0.3,
    });

    const cleaned = result.content
      .trim()
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/\s*```$/i, "");

    analysis = JSON.parse(cleaned);
  } catch (err) {
    return fail("AI_ERROR", err instanceof Error ? err.message : "Analysis failed", 500);
  }

  // Save to DB
  await db.incident.update({
    where: { id },
    data: { aiAnalysis: JSON.stringify(analysis) },
  });

  // Log AI decision
  await db.aIDecision.create({
    data: {
      type: "INCIDENT_ANALYSIS",
      provider: "CLAUDE",
      modelUsed: "claude-sonnet-4-6",
      inputData: { incidentId: id, incidentNumber: incident.incidentNumber } as never,
      outputData: analysis as never,
      reasoning: String(analysis.summary ?? ""),
      autonomous: false,
      requiresHuman: false,
      incidentId: id,
    },
  }).catch(() => { /* non-critical */ });

  // WhatsApp for CRITICAL
  const isCritical = analysis.riskLevel === "CRITICAL" || incident.severity === "CRITICAL";
  if (isCritical) {
    const base = process.env.NEXTAUTH_URL ?? "http://localhost:3000";
    fetch(`${base}/api/notify/whatsapp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message:
          `🚨 *CRITICAL Incident — AI Analysis*\n` +
          `━━━━━━━━━━━━━━━━\n` +
          `📋 ${incident.incidentNumber}: ${incident.title}\n` +
          `📍 Site: ${incident.site?.name}\n` +
          `🔍 Root Cause: ${String(analysis.rootCause).slice(0, 120)}\n` +
          `⚡ Immediate: ${(analysis.immediateActions as string[])?.[0] ?? "Review required"}\n` +
          `━━━━━━━━━━━━━━━━\n` +
          `_AEGIS HSSE Platform — Oman_`,
      }),
    }).catch(() => { /* best-effort */ });
  }

  return ok({ analysis, incidentId: id, whatsappSent: isCritical });
}