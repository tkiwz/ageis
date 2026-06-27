export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface ChatRequest {
  messages: ChatMessage[];
  context?: Record<string, unknown>;
}

export interface ChatResponse {
  content: string;
  model: string;
  usage?: {
    inputTokens: number;
    outputTokens: number;
  };
}

export interface AnalysisRequest {
  type: "VISION" | "TELEMETRY" | "INCIDENT" | "PERMIT";
  data: Record<string, unknown>;
  context?: Record<string, unknown>;
}

export interface AnalysisResponse {
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  reasoning: string;
  actions: string[];
  confidence: number;
  requiresHumanReview: boolean;
}
