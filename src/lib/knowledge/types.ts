/**
 * Knowledge contribution shared types.
 */

export type ContributionSource = "QUICK_INSIGHT" | "DOCUMENT" | "INCIDENT_RETRO" | "VOICE_MEMO";

export type ContributionStatus =
  | "PENDING"          // waiting for AI processing
  | "AI_PROCESSED"     // AI extracted structure, waiting for human review
  | "APPROVED"         // human approved — memories created
  | "REJECTED"
  | "AUTO_APPLIED"     // CRITICAL severity — applied immediately, escalated to managers
  | "EXPIRED";

export interface StructuredKnowledge {
  category: string;       // e.g. PIPELINE_LEAK_PATTERN
  subject?: string;       // e.g. site-block60
  content: string;
  contentAr?: string;
  tags?: string[];
  confidence: number;     // 0-1 — how confident the AI is in its extraction
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  reasoning?: string;     // why this was classified this way
  // For CRITICAL — recommended immediate action
  immediateAction?: string;
  immediateActionAr?: string;
}
