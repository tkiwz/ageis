/**
 * Brain learning loop — called when outcomes are known.
 *
 * When an incident closes or an AISuggestion gets approved/rejected, we:
 *   1. Find the brain sessions that touched this entity
 *   2. For each memory those sessions cited, reinforce or contradict
 *   3. Optionally distill a new memory from the closed incident
 */
import { db } from "@/lib/db";
import { feedback, remember } from "./memory";
import { guardedClaudeChat } from "@/lib/ai/guarded-claude";
import { log } from "@/lib/observability/logger";

export type Outcome = "CORRECT" | "INCORRECT";

/**
 * Mark all memories referenced by sessions about this entity as reinforced/contradicted.
 */
export async function recordOutcome(opts: {
  entityType: "incident" | "permit" | "alert";
  entityId: string;
  outcome: Outcome;
}): Promise<{ updated: number }> {
  const sessions = await db.brainSession.findMany({
    where: { signalId: opts.entityId, status: "COMPLETED" },
    select: { id: true, recalledMemoryIds: true },
  });

  const memoryIds = new Set<string>();
  for (const s of sessions) {
    if (!s.recalledMemoryIds) continue;
    try {
      const ids = JSON.parse(s.recalledMemoryIds) as string[];
      ids.forEach((id) => memoryIds.add(id));
    } catch { /* ignore */ }
  }

  for (const id of memoryIds) {
    await feedback(id, opts.outcome === "CORRECT" ? "REINFORCE" : "CONTRADICT");
  }

  log.info("Brain outcome recorded", {
    entityType: opts.entityType, entityId: opts.entityId,
    outcome: opts.outcome, memoriesUpdated: memoryIds.size,
  });

  return { updated: memoryIds.size };
}

/**
 * Distill a closed incident into a new memory.
 * Called after incident.status = "RESOLVED" or "CLOSED".
 */
export async function distillIncidentLearning(incidentId: string): Promise<string | null> {
  const incident = await db.incident.findUnique({
    where: { id: incidentId },
    include: {
      site: { select: { code: true, name: true } },
      investigation: true,
    },
  });
  if (!incident) return null;
  if (incident.status !== "RESOLVED" && incident.status !== "CLOSED") return null;

  const system = `You are AEGIS's learning distiller.
Given a closed incident and its investigation, write ONE concise learning that the brain should remember for similar future situations.
Be concrete and actionable. Avoid generic safety platitudes.
Respond ONLY in JSON.`;

  const userPrompt = `INCIDENT: ${incident.incidentNumber}
Type: ${incident.type} · Severity: ${incident.severity}
Site: ${incident.site.code}
Title: ${incident.title}
Description: ${incident.description}
${incident.investigation?.rootCause ? `Root cause: ${incident.investigation.rootCause}` : ""}
${incident.investigation?.summary ? `Investigation summary: ${incident.investigation.summary}` : ""}

Respond:
{
  "category": "string (e.g. PIPELINE_LEAK_PATTERN, CONTRACTOR_HISTORY)",
  "subject": "site code, contractor, or null",
  "learning": "1-2 sentences in English — what we learned",
  "learningAr": "بالعربية",
  "tags": ["tag1", "tag2"],
  "confidence": 0.0-1.0
}`;

  const r = await guardedClaudeChat({
    module: "forecast", feature: "brain-distill", // forecast module = general AI reasoning
    system, messages: [{ role: "user", content: userPrompt }],
    maxTokens: 600, temperature: 0.3, autonomous: true,
    decisionType: "BRAIN_DISTILL_LEARNING",
    inputSnapshot: { incidentId },
  });

  if (r.blocked) return null;
  const m = r.content.match(/\{[\s\S]*\}/);
  if (!m) return null;

  try {
    const parsed = JSON.parse(m[0]);
    const memoryId = await remember({
      category: parsed.category ?? "INCIDENT_PATTERN",
      subject: parsed.subject ?? incident.siteId,
      content: parsed.learning,
      contentAr: parsed.learningAr,
      tags: Array.isArray(parsed.tags) ? parsed.tags : [],
      confidence: Number(parsed.confidence ?? 0.5),
      evidence: { incidentId: incident.id, incidentNumber: incident.incidentNumber },
    });
    log.info("Brain distilled learning", { memoryId, incidentId });
    return memoryId;
  } catch (err) {
    log.error("Brain distill failed to parse", err, { incidentId });
    return null;
  }
}
