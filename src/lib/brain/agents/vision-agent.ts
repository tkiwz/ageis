/**
 * VisionAgent — interprets Pi/ESP32 vision detections in cross-domain context.
 */
import { db } from "@/lib/db";
import { guardedClaudeChat } from "@/lib/ai/guarded-claude";
import type { Agent, AgentInput, AgentResult, BrainSignal } from "../types";

export const VisionAgent: Agent = {
  name: "VisionAgent",
  handles: ["VISION_DETECTION", "INCIDENT", "MANUAL_QUERY"],

  isRelevant(signal: BrainSignal): boolean {
    if (signal.type === "VISION_DETECTION") return true;
    if (signal.payload?.detectionId || signal.payload?.deviceId) return true;
    const t = signal.trigger.toLowerCase();
    return /vision|ppe|helmet|camera|كاميرا|خوذة/.test(t);
  },

  async run({ signal, recalledMemories, sessionId }: AgentInput): Promise<AgentResult> {
    const detectionId = signal.payload?.detectionId as string | undefined;
    let context = "No specific detection referenced.";

    if (detectionId) {
      const det = await db.visionDetection.findUnique({
        where: { id: detectionId },
        include: { device: { include: { site: { select: { code: true, name: true } } } } },
      });
      if (det) {
        const recentSame = await db.visionDetection.count({
          where: {
            label: det.label, deviceId: det.deviceId,
            detectedAt: { gte: new Date(Date.now() - 3600 * 1000) },
          },
        });
        context = `Detection: label=${det.label}, confidence=${det.confidence}, status=${det.status}
Device: ${det.device.code} at ${det.device.site?.code}
Same label in last hour at this device: ${recentSame}`;
      }
    }

    const memoryHints = recalledMemories
      .filter((m) => m.category.includes("VISION") || m.category.includes("PPE"))
      .slice(0, 2).map((m, i) => `${i + 1}. ${m.content}`).join("\n");

    const system = `You are AEGIS's vision interpreter. Decide severity and actions for a vision detection.
Respond ONLY in JSON.`;
    const userPrompt = `${context}
${memoryHints ? `\nMEMORIES:\n${memoryHints}\n` : ""}

Respond:
{
  "severity": "LOW"|"MEDIUM"|"HIGH"|"CRITICAL",
  "confidence": 0.0-1.0,
  "summary": "1 sentence",
  "summaryAr": "جملة بالعربية",
  "actionType": "NOTIFY_MANAGER"|"CREATE_OBSERVATION"|"CREATE_INCIDENT"|"NO_ACTION",
  "reasoning": "why this action"
}`;

    const r = await guardedClaudeChat({
      module: "vision", feature: "brain-vision-agent",
      system, messages: [{ role: "user", content: userPrompt }],
      maxTokens: 600, temperature: 0.2, autonomous: true,
      decisionType: "BRAIN_AGENT_VISION",
      inputSnapshot: { sessionId, signal, detectionId },
    });

    if (r.blocked) {
      return {
        agentName: "VisionAgent", confidence: 0,
        summary: `Vision blocked: ${r.blocked.reason}`,
        findings: { blocked: r.blocked.reason }, actions: [],
      };
    }
    const m = r.content.match(/\{[\s\S]*\}/);
    if (!m) {
      return {
        agentName: "VisionAgent", confidence: 0,
        summary: "Vision agent returned non-JSON", findings: {}, actions: [],
      };
    }
    const parsed = JSON.parse(m[0]);
    return {
      agentName: "VisionAgent",
      confidence: Number(parsed.confidence ?? 0),
      summary: parsed.summary ?? "Vision interpretation complete",
      summaryAr: parsed.summaryAr,
      findings: parsed,
      actions: [
        {
          type: parsed.actionType ?? "NO_ACTION",
          description: parsed.reasoning ?? "Vision interpretation",
          priority: parsed.severity,
        },
      ],
      tokensUsed: r.usage.inputTokens + r.usage.outputTokens,
    };
  },
};
