/**
 * AEGIS Brain — type definitions shared by the orchestrator and all agents.
 */

export type SignalType =
  | "INCIDENT"
  | "PERMIT_NEW"
  | "SENSOR_ANOMALY"
  | "WELLNESS_ALERT"
  | "PIPELINE_ANOMALY"
  | "VISION_DETECTION"
  | "MANUAL_QUERY"
  | "SCHEDULED_REVIEW";

export interface BrainSignal {
  type: SignalType;
  /** What woke up the brain. Free-text label. */
  trigger: string;
  payload: Record<string, unknown>;
  siteId?: string;
  userId?: string;
  signalEntityType?: string; // e.g. "incident", "permit"
  signalEntityId?: string;
}

export interface AgentInput<TPayload = Record<string, unknown>> {
  sessionId: string;
  signal: BrainSignal;
  payload: TPayload;
  /** Memories the orchestrator already recalled. Agents may use these as priors. */
  recalledMemories: RecalledMemory[];
}

export interface RecalledMemory {
  id: string;
  category: string;
  subject: string | null;
  content: string;
  confidence: number;
  reinforcements: number;
}

export interface AgentResult {
  agentName: AgentName;
  /** 0.0-1.0 — how confident this agent is in its output. */
  confidence: number;
  /** Short human-readable summary of what the agent thinks. */
  summary: string;
  summaryAr?: string;
  /** Structured findings — agent-specific shape. */
  findings: Record<string, unknown>;
  /** Recommended actions this agent would take. */
  actions: RecommendedAction[];
  /** Tokens consumed. */
  tokensUsed?: number;
  /** Optional reference to a memory this agent used. */
  citedMemoryId?: string;
}

export interface RecommendedAction {
  type: ActionType;
  description: string;
  descriptionAr?: string;
  params?: Record<string, unknown>;
  /** Severity / priority */
  priority?: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
}

export type ActionType =
  | "CREATE_INCIDENT"
  | "CREATE_OBSERVATION"
  | "CREATE_ALERT"
  | "NOTIFY_MANAGER"
  | "TRIGGER_EMERGENCY"
  | "MODIFY_PERMIT"
  | "REJECT_PERMIT"
  | "APPROVE_PERMIT"
  | "DISPATCH_DRONE"
  | "REST_BREAK_RECOMMENDED"
  | "EVACUATE_AREA"
  | "REVIEW_REQUIRED"
  | "NO_ACTION";

export type AgentName =
  | "PipelineAgent"
  | "PermitAgent"
  | "WellnessAgent"
  | "ForecastAgent"
  | "VisionAgent"
  | "Coordinator"
  | "Synthesizer";

/**
 * Common interface every specialist agent implements. The orchestrator runs
 * these in parallel (or selectively, based on the Coordinator's plan).
 */
export interface Agent<TPayload = Record<string, unknown>> {
  name: AgentName;
  /** What kinds of signals this agent is competent in. */
  handles: SignalType[];
  /** Returns true if this agent should be consulted for the given signal. */
  isRelevant(signal: BrainSignal): boolean;
  /** Run the agent. */
  run(input: AgentInput<TPayload>): Promise<AgentResult>;
}
