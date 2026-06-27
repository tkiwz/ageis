/**
 * AEGIS Brain — central orchestrator.
 *
 * Pipeline:
 *   1. Open a BrainSession row
 *   2. Recall relevant memories (keyword + category)
 *   3. Coordinator (Claude) picks which specialist agents to consult
 *   4. Run agents in parallel; record each BrainAgentRun
 *   5. Synthesizer (Claude) merges the agent outputs into one decision
 *   6. Persist conclusion + recommended actions; close the session
 *   7. Return BrainDecision
 */
import { db } from "@/lib/db";
import { guardedClaudeChat } from "@/lib/ai/guarded-claude";
import { ALL_AGENTS } from "./agents";
import { recall } from "./memory";
import { executeActions } from "./action-executor";
import type { Agent, AgentName, AgentResult, BrainSignal, RecalledMemory, RecommendedAction } from "./types";
import { log } from "@/lib/observability/logger";

export interface BrainDecision {
  sessionId: string;
  conclusion: string;
  conclusionAr?: string;
  confidence: number;
  agentsConsulted: AgentName[];
  agentResults: AgentResult[];
  recalledMemories: RecalledMemory[];
  recommendedActions: RecommendedAction[];
  requiresApproval: boolean;
  durationMs: number;
  totalTokens: number;
  /** Summary of what actions were auto-executed vs. held for human approval */
  actionsExecuted?: {
    autoExecuted: number;
    guarded: number;
    noops: number;
  };
}

export async function think(signal: BrainSignal, opts: { userId?: string } = {}): Promise<BrainDecision> {
  const startedAt = Date.now();

  // ───── 1. Open session ─────
  const session = await db.brainSession.create({
    data: {
      trigger: signal.trigger,
      signalType: signal.type,
      signalId: signal.signalEntityId,
      status: "THINKING",
      context: JSON.stringify({ signal, recalled: 0 }),
      userId: opts.userId ?? signal.userId,
      siteId: signal.siteId,
    },
  });

  try {
    // ───── 2. Recall memories ─────
    const memories = await recall(signal, 8);

    // ───── 3. Coordinator picks agents ─────
    const candidateAgents = ALL_AGENTS.filter((a) => a.isRelevant(signal));
    let chosenAgents: Agent[];

    if (candidateAgents.length === 0) {
      chosenAgents = [];
    } else if (candidateAgents.length === 1) {
      chosenAgents = candidateAgents;
    } else {
      chosenAgents = await pickAgentsWithCoordinator(session.id, signal, candidateAgents, memories);
    }

    // ───── 4. Run agents in parallel ─────
    const agentResults = await Promise.all(
      chosenAgents.map((agent) => runAgent(session.id, agent, signal, memories)),
    );

    // ───── 5. Synthesize ─────
    const synthesized = await synthesize(session.id, signal, agentResults, memories);

    // ───── 6. Persist + close ─────
    const durationMs = Date.now() - startedAt;
    // Sum ALL agent runs for this session (includes Coordinator + Synthesizer rows)
    const allRuns = await db.brainAgentRun.aggregate({
      where: { sessionId: session.id },
      _sum: { tokensUsed: true },
    });
    const totalTokens = allRuns._sum.tokensUsed ?? agentResults.reduce((s, r) => s + (r.tokensUsed ?? 0), 0);
    const recommendedActions = synthesized.actions;
    const requiresApproval = recommendedActions.some(
      (a) => a.priority === "CRITICAL" || a.type === "EVACUATE_AREA" || a.type === "TRIGGER_EMERGENCY",
    );

    await db.brainSession.update({
      where: { id: session.id },
      data: {
        status: "COMPLETED",
        agentsConsulted: JSON.stringify(chosenAgents.map((a) => a.name)),
        conclusion: synthesized.conclusion,
        conclusionAr: synthesized.conclusionAr,
        confidence: synthesized.confidence,
        actionsRecommended: JSON.stringify(recommendedActions),
        recalledMemoryIds: JSON.stringify(memories.map((m) => m.id)),
        requiresApproval,
        completedAt: new Date(),
        durationMs,
        totalTokens,
      },
    });

    // ── Execute actions (non-blocking — errors are caught inside executeActions) ──
    let actionsExecuted: BrainDecision["actionsExecuted"];
    if (recommendedActions.length > 0) {
      try {
        const execResult = await executeActions(recommendedActions, {
          sessionId: session.id,
          signalType: signal.type,
          signalEntityType: signal.signalEntityType,
          signalEntityId: signal.signalEntityId,
          siteId: signal.siteId,
          userId: signal.userId ?? opts.userId,
          conclusion: synthesized.conclusion,
          confidence: synthesized.confidence,
        });
        actionsExecuted = {
          autoExecuted: execResult.autoExecuted,
          guarded:      execResult.guarded,
          noops:        execResult.noops,
        };
      } catch (execErr) {
        log.error("Brain action execution threw unexpectedly", execErr, { sessionId: session.id });
      }
    }

    return {
      sessionId: session.id,
      conclusion: synthesized.conclusion,
      conclusionAr: synthesized.conclusionAr,
      confidence: synthesized.confidence,
      agentsConsulted: chosenAgents.map((a) => a.name),
      agentResults,
      recalledMemories: memories,
      recommendedActions,
      requiresApproval,
      durationMs,
      totalTokens,
      actionsExecuted,
    };
  } catch (err) {
    log.error("Brain session failed", err, { sessionId: session.id });
    await db.brainSession.update({
      where: { id: session.id },
      data: { status: "FAILED", completedAt: new Date(), durationMs: Date.now() - startedAt },
    });
    throw err;
  }
}

// ───── Coordinator ─────

async function pickAgentsWithCoordinator(
  sessionId: string,
  signal: BrainSignal,
  candidates: Agent[],
  memories: RecalledMemory[],
): Promise<Agent[]> {
  const startedAt = Date.now();
  const memoriesText = memories.slice(0, 3).map((m, i) => `${i + 1}. (${m.category}) ${m.content}`).join("\n");

  const system = `You are AEGIS's brain coordinator. You decide which specialist agents to consult.
You may pick multiple agents — they run in parallel.
Respond ONLY in JSON.`;
  const userPrompt = `SIGNAL: ${signal.trigger}
TYPE: ${signal.type}
PAYLOAD (truncated): ${JSON.stringify(signal.payload).slice(0, 400)}

CANDIDATE AGENTS (each can analyze a different facet):
${candidates.map((a) => `- ${a.name}`).join("\n")}

${memoriesText ? `RELEVANT MEMORIES:\n${memoriesText}\n` : ""}

Respond:
{
  "selectedAgents": ["AgentName1", "AgentName2"],
  "reasoning": "1 sentence"
}`;

  const r = await guardedClaudeChat({
    module: "forecast", feature: "brain-coordinator", // forecast module = general AI reasoning
    system, messages: [{ role: "user", content: userPrompt }],
    maxTokens: 300, temperature: 0.1, autonomous: true,
    decisionType: "BRAIN_COORDINATOR",
    inputSnapshot: { sessionId, candidates: candidates.map((c) => c.name) },
  });

  await db.brainAgentRun.create({
    data: {
      sessionId, agentName: "Coordinator",
      input: JSON.stringify({ candidates: candidates.map((c) => c.name) }),
      output: r.content.slice(0, 500),
      durationMs: Date.now() - startedAt,
      tokensUsed: r.usage.inputTokens + r.usage.outputTokens,
      status: r.blocked ? "FAILED" : "COMPLETED",
      errorMessage: r.blocked?.reason,
    },
  });

  if (r.blocked) {
    // Fallback: consult all candidates
    return candidates;
  }

  try {
    const m = r.content.match(/\{[\s\S]*\}/);
    if (!m) return candidates;
    const parsed = JSON.parse(m[0]);
    const selected = (parsed.selectedAgents ?? []) as string[];
    const picked = candidates.filter((c) => selected.includes(c.name));
    return picked.length > 0 ? picked : candidates;
  } catch {
    return candidates;
  }
}

// ───── Agent runner ─────

async function runAgent(
  sessionId: string,
  agent: Agent,
  signal: BrainSignal,
  memories: RecalledMemory[],
): Promise<AgentResult> {
  const startedAt = Date.now();
  const runRow = await db.brainAgentRun.create({
    data: {
      sessionId, agentName: agent.name,
      input: JSON.stringify({ signal: signal.trigger, memoryCount: memories.length }),
      status: "RUNNING",
    },
  });

  try {
    const result = await agent.run({
      sessionId, signal, payload: signal.payload, recalledMemories: memories,
    });
    await db.brainAgentRun.update({
      where: { id: runRow.id },
      data: {
        status: "COMPLETED",
        output: JSON.stringify(result.findings).slice(0, 2000),
        confidence: result.confidence,
        durationMs: Date.now() - startedAt,
        tokensUsed: result.tokensUsed ?? 0,
        memoryId: result.citedMemoryId,
      },
    });
    return result;
  } catch (err) {
    await db.brainAgentRun.update({
      where: { id: runRow.id },
      data: {
        status: "FAILED",
        errorMessage: err instanceof Error ? err.message : String(err),
        durationMs: Date.now() - startedAt,
      },
    });
    return {
      agentName: agent.name, confidence: 0,
      summary: `${agent.name} failed: ${err instanceof Error ? err.message : "unknown"}`,
      findings: { failed: true }, actions: [],
    };
  }
}

// ───── Synthesizer ─────

async function synthesize(
  sessionId: string,
  signal: BrainSignal,
  agentResults: AgentResult[],
  memories: RecalledMemory[],
): Promise<{ conclusion: string; conclusionAr?: string; confidence: number; actions: RecommendedAction[] }> {
  const startedAt = Date.now();

  if (agentResults.length === 0) {
    return {
      conclusion: "No specialist agents matched this signal — no action determined.",
      conclusionAr: "لا يوجد وكيل مختص لهذا الإشارة.",
      confidence: 0.1,
      actions: [],
    };
  }

  // Quick path: only one agent → use its output directly
  if (agentResults.length === 1) {
    const r = agentResults[0];
    return {
      conclusion: r.summary,
      conclusionAr: r.summaryAr,
      confidence: r.confidence,
      actions: r.actions,
    };
  }

  // Multiple agents — use Claude to synthesize
  const agentSummaries = agentResults
    .map((r) => `${r.agentName} (conf=${(r.confidence * 100).toFixed(0)}%):
  Summary: ${r.summary}
  Actions: ${r.actions.map((a) => `${a.type}:${a.description}`).join(" | ")}`)
    .join("\n\n");

  const memoriesText = memories.slice(0, 3).map((m, i) => `${i + 1}. ${m.content}`).join("\n");

  const system = `You are AEGIS's brain synthesizer. Multiple specialist agents have analyzed a signal.
Your job: combine their findings into ONE coherent decision.

When agents disagree, weight by confidence. Identify cross-domain risk (e.g. pipeline leak + worker nearby + active permit on site).
Respond ONLY in JSON.`;
  const userPrompt = `SIGNAL: ${signal.trigger}

AGENT OUTPUTS:
${agentSummaries}

${memoriesText ? `MEMORIES:\n${memoriesText}\n` : ""}

Respond:
{
  "conclusion": "2-3 sentence cross-domain decision",
  "conclusionAr": "2-3 جمل بالعربية",
  "confidence": 0.0-1.0,
  "crossDomainConcerns": ["concern 1", "concern 2"],
  "finalActions": [
    { "type": "ACTION_TYPE", "description": "...", "priority": "LOW|MEDIUM|HIGH|CRITICAL", "params": {} }
  ]
}`;

  const r = await guardedClaudeChat({
    module: "forecast", feature: "brain-synthesizer", // forecast module = general AI reasoning
    system, messages: [{ role: "user", content: userPrompt }],
    maxTokens: 1200, temperature: 0.2, autonomous: true,
    decisionType: "BRAIN_SYNTHESIZER",
    inputSnapshot: { sessionId, agentCount: agentResults.length },
  });

  await db.brainAgentRun.create({
    data: {
      sessionId, agentName: "Synthesizer",
      input: JSON.stringify({ agentNames: agentResults.map((a) => a.agentName) }),
      output: r.content.slice(0, 2000),
      durationMs: Date.now() - startedAt,
      tokensUsed: r.usage.inputTokens + r.usage.outputTokens,
      status: r.blocked ? "FAILED" : "COMPLETED",
      errorMessage: r.blocked?.reason,
    },
  });

  if (r.blocked) {
    // Fallback: union of all agent actions
    return {
      conclusion: `Synthesizer blocked: ${r.blocked.reason}. Falling back to agent union.`,
      confidence: Math.max(...agentResults.map((a) => a.confidence)),
      actions: agentResults.flatMap((a) => a.actions),
    };
  }
  try {
    const m = r.content.match(/\{[\s\S]*\}/);
    if (!m) throw new Error("no JSON");
    const parsed = JSON.parse(m[0]);
    return {
      conclusion: parsed.conclusion ?? "Synthesis complete",
      conclusionAr: parsed.conclusionAr,
      confidence: Number(parsed.confidence ?? 0.5),
      actions: (parsed.finalActions ?? []) as RecommendedAction[],
    };
  } catch {
    return {
      conclusion: "Synthesizer returned non-JSON; using agent union.",
      confidence: Math.max(...agentResults.map((a) => a.confidence)),
      actions: agentResults.flatMap((a) => a.actions),
    };
  }
}
