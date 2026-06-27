/**
 * ForecastAgent — predictive risk reasoning. Pulls yesterday's signals
 * + weather + permits to forecast tomorrow.
 */
import { db } from "@/lib/db";
import { guardedClaudeChat } from "@/lib/ai/guarded-claude";
import type { Agent, AgentInput, AgentResult, BrainSignal } from "../types";

export const ForecastAgent: Agent = {
  name: "ForecastAgent",
  handles: ["SCHEDULED_REVIEW", "MANUAL_QUERY"],

  isRelevant(signal: BrainSignal): boolean {
    if (signal.type === "SCHEDULED_REVIEW") return true;
    const t = signal.trigger.toLowerCase();
    return /forecast|tomorrow|predict|توقع|غدا/.test(t);
  },

  async run({ signal, recalledMemories, sessionId }: AgentInput): Promise<AgentResult> {
    const yesterday = new Date(Date.now() - 86_400_000);
    const lastWeek = new Date(Date.now() - 7 * 86_400_000);
    const [incidentsYesterday, incidentsLastWeek, activePermits, weather] = await Promise.all([
      db.incident.findMany({
        where: { reportedAt: { gte: yesterday } }, take: 20,
        select: { type: true, severity: true, siteId: true },
      }),
      db.incident.count({ where: { reportedAt: { gte: lastWeek } } }),
      db.permit.count({ where: { status: { in: ["ACTIVE", "APPROVED"] } } }),
      db.weatherReading.findMany({ orderBy: { recordedAt: "desc" }, take: 5 }),
    ]);

    const memoryHints = recalledMemories
      .filter((m) => m.category.includes("PATTERN") || m.category.includes("WEATHER"))
      .slice(0, 4).map((m, i) => `${i + 1}. ${m.content}`).join("\n");

    const system = `You are AEGIS's risk forecaster.
Forecast tomorrow's HSSE risk profile. Be calibrated.
Respond ONLY in JSON.`;
    const userPrompt = `Data:
- Incidents in last 24h: ${incidentsYesterday.length}
- Incidents in last 7 days: ${incidentsLastWeek}
- Active permits: ${activePermits}
- Weather (latest): ${JSON.stringify(weather.slice(0, 3))}

${memoryHints ? `\nLEARNED PATTERNS:\n${memoryHints}\n` : ""}

Respond:
{
  "overallRisk": "LOW"|"MEDIUM"|"HIGH"|"CRITICAL",
  "confidence": 0.0-1.0,
  "topRiskFactor": "string",
  "topRiskFactorAr": "بالعربية",
  "recommendations": ["...", "...", "..."],
  "summary": "1-2 sentences"
}`;

    const r = await guardedClaudeChat({
      module: "forecast", feature: "brain-forecast-agent",
      system, messages: [{ role: "user", content: userPrompt }],
      maxTokens: 900, temperature: 0.3, autonomous: true,
      decisionType: "BRAIN_AGENT_FORECAST",
      inputSnapshot: { sessionId, signal },
    });

    if (r.blocked) {
      return {
        agentName: "ForecastAgent", confidence: 0,
        summary: `Forecast blocked: ${r.blocked.reason}`,
        findings: { blocked: r.blocked.reason }, actions: [],
      };
    }
    const m = r.content.match(/\{[\s\S]*\}/);
    if (!m) {
      return {
        agentName: "ForecastAgent", confidence: 0,
        summary: "Forecast returned non-JSON", findings: {}, actions: [],
      };
    }
    const parsed = JSON.parse(m[0]);
    return {
      agentName: "ForecastAgent",
      confidence: Number(parsed.confidence ?? 0),
      summary: parsed.summary ?? "Forecast generated",
      findings: parsed,
      actions: (parsed.recommendations ?? []).slice(0, 3).map((rec: string) => ({
        type: "NOTIFY_MANAGER" as const,
        description: rec,
        priority: parsed.overallRisk,
      })),
      tokensUsed: r.usage.inputTokens + r.usage.outputTokens,
    };
  },
};
