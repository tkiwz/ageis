/**
 * AI cost estimation — converts token usage into micro-USD.
 *
 * Pricing as of 2025 (per 1M tokens).
 * Update these constants when Anthropic / Google publish new pricing.
 * Source: https://www.anthropic.com/pricing
 */

interface ModelPricing {
  inputPerMTok: number; // USD per 1M input tokens
  outputPerMTok: number; // USD per 1M output tokens
}

const PRICING: Record<string, ModelPricing> = {
  // Claude Sonnet 4.5 / 4.6 family
  "claude-sonnet-4-5-20250929": { inputPerMTok: 3.0, outputPerMTok: 15.0 },
  "claude-sonnet-4-6": { inputPerMTok: 3.0, outputPerMTok: 15.0 },
  "claude-opus-4-6": { inputPerMTok: 15.0, outputPerMTok: 75.0 },
  "claude-haiku-4-5-20251001": { inputPerMTok: 1.0, outputPerMTok: 5.0 },
  // Gemini
  "gemini-2.0-flash-exp": { inputPerMTok: 0.075, outputPerMTok: 0.3 },
  "gemini-2.0-flash":     { inputPerMTok: 0.075, outputPerMTok: 0.3 },
  "gemini-2.5-flash":     { inputPerMTok: 0.15,  outputPerMTok: 0.6  }, // Gemini 2.5 Flash pricing
  "gemini-2.5-flash-preview-05-20": { inputPerMTok: 0.15, outputPerMTok: 0.6 },
  "gemini-1.5-pro":       { inputPerMTok: 1.25, outputPerMTok: 5.0 },
};

const FALLBACK_PRICING: ModelPricing = { inputPerMTok: 3.0, outputPerMTok: 15.0 };

/**
 * Compute cost in micro-USD (USD * 1,000,000) — integer math, no float drift.
 */
export function computeCostMicroUsd(
  model: string,
  inputTokens: number,
  outputTokens: number,
): number {
  const pricing = PRICING[model] ?? FALLBACK_PRICING;
  const inputCost = (inputTokens / 1_000_000) * pricing.inputPerMTok;
  const outputCost = (outputTokens / 1_000_000) * pricing.outputPerMTok;
  return Math.round((inputCost + outputCost) * 1_000_000);
}

export function microUsdToUsd(microUsd: number): number {
  return microUsd / 1_000_000;
}

export function formatUsd(microUsd: number): string {
  return `$${(microUsd / 1_000_000).toFixed(4)}`;
}
