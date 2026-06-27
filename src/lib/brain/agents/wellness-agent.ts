/**
 * WellnessAgent — specialist for worker health signals.
 */
import { db } from "@/lib/db";
import { guardedClaudeChat } from "@/lib/ai/guarded-claude";
import type { Agent, AgentInput, AgentResult, BrainSignal } from "../types";

export const WellnessAgent: Agent = {
  name: "WellnessAgent",
  handles: ["WELLNESS_ALERT", "MANUAL_QUERY", "INCIDENT", "SENSOR_ANOMALY"],

  isRelevant(signal: BrainSignal): boolean {
    if (signal.type === "WELLNESS_ALERT") return true;
    if (signal.payload?.workerId || signal.payload?.userId) return true;
    const t = signal.trigger.toLowerCase();
    return /wellness|heat|h2s|fatigue|worker|عامل|إجهاد|غاز/.test(t);
  },

  async run({ signal, recalledMemories, sessionId }: AgentInput): Promise<AgentResult> {
    const workerId = (signal.payload?.workerId ?? signal.payload?.userId) as string | undefined;
    let context = "No specific worker referenced.";
    if (workerId) {
      const [worker, recentReadings, openAlerts] = await Promise.all([
        db.user.findUnique({ where: { id: workerId }, select: { name: true, role: true, department: true } }),
        db.workerWellnessReading.findMany({
          where: { userId: workerId, recordedAt: { gte: new Date(Date.now() - 8 * 3600 * 1000) } },
          orderBy: { recordedAt: "desc" }, take: 10,
        }),
        db.workerWellnessAlert.findMany({
          where: { userId: workerId, acknowledged: false }, orderBy: { createdAt: "desc" }, take: 5,
        }),
      ]);
      const latest = recentReadings[0];
      context = `Worker: ${worker?.name ?? workerId} (${worker?.role}, ${worker?.department})
Latest reading: HR=${latest?.heartRate}bpm, body=${latest?.bodyTemperature}°C, ambient=${latest?.ambientTemp}°C
Cumulative H2S exposure (8h): ${latest?.h2sExposurePpmMin ?? 0} ppm·min
Cumulative CO exposure (8h): ${latest?.coExposurePpmMin ?? 0} ppm·min
Wellness level: ${latest?.wellnessLevel}
Open alerts: ${openAlerts.length} (${openAlerts.map((a) => a.alertType).join(", ")})`;
    }

    const memoryHints = recalledMemories
      .filter((m) => m.category.includes("WELLNESS") || m.category.includes("HEAT") || m.category.includes("H2S"))
      .slice(0, 3).map((m, i) => `${i + 1}. ${m.content}`).join("\n");

    const system = `You are AEGIS's worker wellness specialist for hot-climate Oman ops.
Given physiological + environmental data, recommend concrete actions.
Respond ONLY in JSON.`;

    const userPrompt = `SIGNAL: ${signal.trigger}
${context}
${memoryHints ? `\nMEMORIES:\n${memoryHints}\n` : ""}

Respond:
{
  "riskLevel": "LOW"|"MEDIUM"|"HIGH"|"CRITICAL",
  "confidence": 0.0-1.0,
  "primaryConcern": "string (e.g. HEAT_STRESS)",
  "recommendedAction": "concrete action in 1 sentence",
  "recommendedActionAr": "إجراء بالعربية",
  "needsRestBreak": boolean,
  "needsEvacuation": boolean,
  "summary": "1-2 sentences"
}`;

    const r = await guardedClaudeChat({
      module: "forecast", feature: "brain-wellness-agent", // uses forecast module (general AI reasoning)
      system, messages: [{ role: "user", content: userPrompt }],
      maxTokens: 800, temperature: 0.2, autonomous: true,
      decisionType: "BRAIN_AGENT_WELLNESS",
      inputSnapshot: { sessionId, signal, workerId },
    });

    if (r.blocked) {
      return {
        agentName: "WellnessAgent", confidence: 0,
        summary: `Wellness blocked: ${r.blocked.reason}`,
        findings: { blocked: r.blocked.reason }, actions: [],
      };
    }
    const m = r.content.match(/\{[\s\S]*\}/);
    if (!m) {
      return {
        agentName: "WellnessAgent", confidence: 0,
        summary: "Wellness agent returned non-JSON", findings: {}, actions: [],
      };
    }
    const parsed = JSON.parse(m[0]);
    const actions = [];
    if (parsed.needsEvacuation) {
      actions.push({
        type: "EVACUATE_AREA" as const,
        description: parsed.recommendedAction,
        descriptionAr: parsed.recommendedActionAr,
        priority: "CRITICAL" as const,
      });
    } else if (parsed.needsRestBreak) {
      actions.push({
        type: "REST_BREAK_RECOMMENDED" as const,
        description: parsed.recommendedAction,
        descriptionAr: parsed.recommendedActionAr,
        priority: parsed.riskLevel,
      });
    } else {
      actions.push({
        type: "NOTIFY_MANAGER" as const,
        description: parsed.recommendedAction ?? "Notify HSSE manager",
        descriptionAr: parsed.recommendedActionAr,
        priority: parsed.riskLevel,
      });
    }

    return {
      agentName: "WellnessAgent",
      confidence: Number(parsed.confidence ?? 0),
      summary: parsed.summary ?? "Wellness assessment complete",
      findings: parsed,
      actions,
      tokensUsed: r.usage.inputTokens + r.usage.outputTokens,
    };
  },
};
