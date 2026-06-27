/**
 * Multi-provider decision engine.
 *
 * Routing strategy:
 *   - CHAT          → Claude (already paid, low volume)
 *   - VISION_ANALYSIS → Gemini Flash (free tier, high volume)
 *   - VIDEO_GENERATION → Gemini Veo (handled separately)
 */

import { geminiGenerate } from "./gemini-client";
import {
  VISION_ANALYSIS_SYSTEM,
  buildVisionAnalysisPrompt,
} from "./prompt-templates";

export interface VisionAnalysisInput {
  label: string;
  confidence: number;
  status: string;
  siteName: string;
  siteCode: string;
  deviceName: string;
  recentSameDetections: number;
  language?: "ar" | "en";
}

export interface VisionAnalysisOutput {
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  reasoning: string;
  actions: string[];
  requiresHumanReview: boolean;
  alertTitle: string;
  alertMessage: string;
  // Telemetry
  provider: "GEMINI";
  modelUsed: string;
  tokensInput: number;
  tokensOutput: number;
  durationMs: number;
}

export async function analyzeVisionDetection(
  input: VisionAnalysisInput,
): Promise<VisionAnalysisOutput> {
  const result = await geminiGenerate({
    system: VISION_ANALYSIS_SYSTEM,
    prompt: buildVisionAnalysisPrompt(input),
    maxTokens: 512,
    temperature: 0.3,
    responseFormat: "json",
  });

  let parsed: Omit<VisionAnalysisOutput, "provider" | "modelUsed" | "tokensInput" | "tokensOutput" | "durationMs">;
  try {
    // Gemini sometimes wraps JSON in code fences
    const cleaned = result.content
      .trim()
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/\s*```$/i, "");
    parsed = JSON.parse(cleaned);
  } catch {
    // Fallback if JSON parsing fails
    parsed = {
      severity: input.confidence > 0.8 ? "HIGH" : "MEDIUM",
      reasoning: "Auto-fallback: AI response was unparseable.",
      actions: ["Manual review required"],
      requiresHumanReview: true,
      alertTitle: `${input.label} detected at ${input.siteCode}`,
      alertMessage: `Vision detection ${input.label} (${(input.confidence * 100).toFixed(0)}%) at ${input.siteName}.`,
    };
  }

  // Defensive defaults
  if (!["LOW", "MEDIUM", "HIGH", "CRITICAL"].includes(parsed.severity)) {
    parsed.severity = "MEDIUM";
  }
  if (!Array.isArray(parsed.actions)) {
    parsed.actions = ["Review detection manually"];
  }

  return {
    ...parsed,
    provider: "GEMINI",
    modelUsed: result.model,
    tokensInput: result.tokensInput,
    tokensOutput: result.tokensOutput,
    durationMs: result.durationMs,
  };
}
