/**
 * Agent registry — the orchestrator consults this to pick relevant specialists.
 */
import { PipelineAgent } from "./pipeline-agent";
import { PermitAgent } from "./permit-agent";
import { WellnessAgent } from "./wellness-agent";
import { ForecastAgent } from "./forecast-agent";
import { VisionAgent } from "./vision-agent";
import type { Agent } from "../types";

export const ALL_AGENTS: Agent[] = [
  PipelineAgent,
  PermitAgent,
  WellnessAgent,
  ForecastAgent,
  VisionAgent,
];

export { PipelineAgent, PermitAgent, WellnessAgent, ForecastAgent, VisionAgent };
