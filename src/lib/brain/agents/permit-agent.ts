/**
 * PermitAgent — specialist for PTW review and risk assessment.
 */
import { db } from "@/lib/db";
import { guardedClaudeChat } from "@/lib/ai/guarded-claude";
import type { Agent, AgentInput, AgentResult, BrainSignal } from "../types";

export const PermitAgent: Agent = {
  name: "PermitAgent",
  handles: ["PERMIT_NEW", "MANUAL_QUERY", "INCIDENT"],

  isRelevant(signal: BrainSignal): boolean {
    if (signal.type === "PERMIT_NEW") return true;
    if (signal.payload?.permitId) return true;
    const trigger = signal.trigger.toLowerCase();
    return /permit|ptw|تصريح|عمل/.test(trigger);
  },

  async run({ signal, recalledMemories, sessionId }: AgentInput): Promise<AgentResult> {
    const permitId = signal.payload?.permitId as string | undefined;
    let permitContext = "No specific permit referenced.";

    if (permitId) {
      const p = await db.permit.findUnique({
        where: { id: permitId },
        include: { site: true, requester: { select: { name: true, role: true } }, conditions: true },
      });
      if (p) {
        // Conflicting permits on same site
        const overlapping = await db.permit.findMany({
          where: {
            siteId: p.siteId,
            id: { not: p.id },
            status: { in: ["ACTIVE", "APPROVED"] },
            validFrom: { lte: p.validUntil },
            validUntil: { gte: p.validFrom },
          },
          select: { permitNumber: true, type: true, location: true },
        });
        const incidentsLast30 = await db.incident.count({
          where: { siteId: p.siteId, occurredAt: { gte: new Date(Date.now() - 30 * 86_400_000) } },
        });
        permitContext = `PERMIT: ${p.permitNumber} | ${p.type} | risk=${p.riskLevel}
Title: ${p.title}
Site: ${p.site.code} (${p.site.status}, risk=${p.site.riskLevel}, locked=${p.site.isLockedDown})
Window: ${p.validFrom.toISOString()} → ${p.validUntil.toISOString()}
Requester: ${p.requester.name}
Conditions: ${p.conditions.map((c) => c.description).join("; ") || "(none)"}
Overlapping permits on site: ${overlapping.length}
${overlapping.length ? JSON.stringify(overlapping, null, 2) : ""}
Site incidents in last 30 days: ${incidentsLast30}`;
      }
    }

    const memoryHints = recalledMemories
      .filter((m) => m.category.includes("PERMIT") || m.category.includes("CONTRACTOR"))
      .slice(0, 3)
      .map((m, i) => `${i + 1}. ${m.content}`)
      .join("\n");

    const system = `You are AEGIS's permit-to-work reviewer.
Decide: APPROVE / MODIFY / REJECT, with a risk score 0-100.
Be calibrated — most permits should APPROVE; REJECT only when there's a clear immediate hazard.
Respond ONLY in JSON.`;

    const userPrompt = `${permitContext}

${memoryHints ? `MEMORIES from past:\n${memoryHints}\n` : ""}

Respond:
{
  "recommendation": "APPROVE"|"MODIFY"|"REJECT",
  "confidence": 0.0-1.0,
  "riskScore": 0-100,
  "conflictsFound": number,
  "hazards": ["...", "..."],
  "requiredPPE": ["...", "..."],
  "modifications": ["if MODIFY: what to change"],
  "reasoning": "1-3 sentences",
  "reasoningAr": "1-3 جمل بالعربية"
}`;

    const r = await guardedClaudeChat({
      module: "permit",
      feature: "brain-permit-agent",
      system,
      messages: [{ role: "user", content: userPrompt }],
      maxTokens: 1000,
      temperature: 0.2,
      autonomous: true,
      decisionType: "BRAIN_AGENT_PERMIT",
      inputSnapshot: { sessionId, signal, permitId },
    });

    if (r.blocked) {
      return {
        agentName: "PermitAgent", confidence: 0,
        summary: `Permit agent blocked: ${r.blocked.reason}`,
        findings: { blocked: r.blocked.reason }, actions: [],
      };
    }

    const match = r.content.match(/\{[\s\S]*\}/);
    if (!match) {
      return {
        agentName: "PermitAgent", confidence: 0,
        summary: "Permit agent returned non-JSON",
        findings: { raw: r.content.slice(0, 300) }, actions: [],
      };
    }
    const parsed = JSON.parse(match[0]);

    const actionMap: Record<string, "APPROVE_PERMIT" | "MODIFY_PERMIT" | "REJECT_PERMIT"> = {
      APPROVE: "APPROVE_PERMIT", MODIFY: "MODIFY_PERMIT", REJECT: "REJECT_PERMIT",
    };

    return {
      agentName: "PermitAgent",
      confidence: Number(parsed.confidence ?? 0),
      summary: parsed.reasoning ?? "Permit reviewed",
      summaryAr: parsed.reasoningAr,
      findings: parsed,
      actions: [
        {
          type: actionMap[parsed.recommendation] ?? "REVIEW_REQUIRED",
          description: `${parsed.recommendation}: ${parsed.reasoning ?? ""}`,
          descriptionAr: parsed.reasoningAr,
          priority: parsed.riskScore >= 70 ? "HIGH" : parsed.riskScore >= 40 ? "MEDIUM" : "LOW",
          params: {
            riskScore: parsed.riskScore,
            hazards: parsed.hazards,
            requiredPPE: parsed.requiredPPE,
            modifications: parsed.modifications,
          },
        },
      ],
      tokensUsed: r.usage.inputTokens + r.usage.outputTokens,
    };
  },
};
