/**
 * PipelineAgent — specialist for pressure / flow anomalies on pipelines.
 */
import { db } from "@/lib/db";
import { guardedClaudeChat } from "@/lib/ai/guarded-claude";
import type { Agent, AgentInput, AgentResult, BrainSignal } from "../types";

export const PipelineAgent: Agent = {
  name: "PipelineAgent",
  handles: ["PIPELINE_ANOMALY", "SENSOR_ANOMALY", "INCIDENT", "MANUAL_QUERY"],

  isRelevant(signal: BrainSignal): boolean {
    if (signal.type === "PIPELINE_ANOMALY") return true;
    if (signal.payload?.pipelineId) return true;
    const trigger = signal.trigger.toLowerCase();
    return /pipeline|leak|pressure|flow|بايب|تسرب|ضغط/.test(trigger);
  },

  async run({ signal, recalledMemories, sessionId }: AgentInput): Promise<AgentResult> {
    const pipelineId = signal.payload?.pipelineId as string | undefined;
    let pipelineContext = "No specific pipeline referenced.";

    if (pipelineId) {
      const p = await db.pipeline.findUnique({
        where: { id: pipelineId },
        include: {
          pressurePoints: {
            include: {
              readings: {
                where: { recordedAt: { gte: new Date(Date.now() - 2 * 3600 * 1000) } },
                orderBy: { recordedAt: "asc" },
                take: 50,
              },
            },
          },
        },
      });
      if (p) {
        const summary = p.pressurePoints.map((pp) => {
          const r = pp.readings;
          if (!r.length) return { code: pp.code, status: "NO_DATA" };
          const first = r[0]; const last = r[r.length - 1];
          return {
            code: pp.code, positionKm: pp.positionKm,
            first: first.pressure.toFixed(2), last: last.pressure.toFixed(2),
            drop: (first.pressure - last.pressure).toFixed(2),
            outOfRange: last.pressure < p.pressureMin || last.pressure > p.pressureMax,
          };
        });
        pipelineContext = `Pipeline ${p.code} (${p.name})
Safe range: ${p.pressureMin}-${p.pressureMax} bar
Pressure points (last 2h):
${JSON.stringify(summary, null, 2)}`;
      }
    }

    const memoriesContext = recalledMemories.length
      ? `\nRELEVANT MEMORIES from past:\n${recalledMemories
          .filter((m) => m.category.startsWith("PIPELINE") || m.category === "LEAK_PATTERN")
          .slice(0, 3)
          .map((m, i) => `${i + 1}. (conf=${(m.confidence * 100).toFixed(0)}%) ${m.content}`)
          .join("\n")}`
      : "";

    const system = `You are AEGIS's pipeline integrity expert.
Analyze pressure data + signal context and decide:
1) Is there an actual leak / anomaly?
2) Where is it (km from start)?
3) What's the severity?
4) What immediate actions should be taken?

Be calibrated. If signals are ambiguous, return confidence < 0.7.
Respond ONLY in JSON.`;

    const userPrompt = `SIGNAL: ${signal.trigger}
PAYLOAD: ${JSON.stringify(signal.payload).slice(0, 500)}

${pipelineContext}
${memoriesContext}

Respond:
{
  "leakDetected": boolean,
  "confidence": 0.0-1.0,
  "severity": "LOW"|"MEDIUM"|"HIGH"|"CRITICAL"|null,
  "estimatedKmFromStart": number|null,
  "rootCause": "string",
  "summary": "1-2 sentences English",
  "summaryAr": "ملخص بالعربية",
  "immediateActions": ["action 1", "action 2"]
}`;

    const r = await guardedClaudeChat({
      module: "pipeline",
      feature: "brain-pipeline-agent",
      system,
      messages: [{ role: "user", content: userPrompt }],
      maxTokens: 1200,
      temperature: 0.2,
      autonomous: true,
      decisionType: "BRAIN_AGENT_PIPELINE",
      inputSnapshot: { sessionId, signal, pipelineId },
    });

    if (r.blocked) {
      return {
        agentName: "PipelineAgent",
        confidence: 0,
        summary: `Pipeline agent blocked: ${r.blocked.reason}`,
        findings: { blocked: r.blocked.reason },
        actions: [],
      };
    }

    const match = r.content.match(/\{[\s\S]*\}/);
    if (!match) {
      return {
        agentName: "PipelineAgent",
        confidence: 0,
        summary: "Pipeline agent returned non-JSON",
        findings: { raw: r.content.slice(0, 300) },
        actions: [],
      };
    }
    const parsed = JSON.parse(match[0]);

    return {
      agentName: "PipelineAgent",
      confidence: Number(parsed.confidence ?? 0),
      summary: parsed.summary ?? "Pipeline analysis complete",
      summaryAr: parsed.summaryAr,
      findings: parsed,
      actions: parsed.leakDetected
        ? [
            {
              type: "CREATE_INCIDENT",
              description: `Pipeline leak at km ${parsed.estimatedKmFromStart}`,
              descriptionAr: `تسرّب في خط الأنابيب عند ${parsed.estimatedKmFromStart} كم`,
              priority: parsed.severity ?? "HIGH",
              params: { kmFromStart: parsed.estimatedKmFromStart, severity: parsed.severity },
            },
            ...(parsed.severity === "CRITICAL"
              ? [{ type: "TRIGGER_EMERGENCY" as const, description: "Critical leak — initiate emergency", priority: "CRITICAL" as const }]
              : []),
          ]
        : [{ type: "NO_ACTION", description: "No leak detected" }],
      tokensUsed: r.usage.inputTokens + r.usage.outputTokens,
    };
  },
};
