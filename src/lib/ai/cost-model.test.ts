import { describe, it, expect } from "vitest";
import { computeCostMicroUsd, microUsdToUsd, formatUsd } from "./cost-model";

describe("cost-model", () => {
  it("computes Sonnet cost correctly", () => {
    // 1M input + 1M output = $3 + $15 = $18 = 18,000,000 micro-USD
    const cost = computeCostMicroUsd("claude-sonnet-4-5-20250929", 1_000_000, 1_000_000);
    expect(cost).toBe(18_000_000);
  });

  it("computes Opus cost correctly (more expensive)", () => {
    // 1M + 1M = $15 + $75 = $90 = 90,000,000 micro-USD
    const cost = computeCostMicroUsd("claude-opus-4-6", 1_000_000, 1_000_000);
    expect(cost).toBe(90_000_000);
  });

  it("falls back to default pricing for unknown models", () => {
    const cost = computeCostMicroUsd("unknown-model-xyz", 1_000, 1_000);
    expect(cost).toBeGreaterThan(0);
  });

  it("handles zero tokens", () => {
    expect(computeCostMicroUsd("claude-sonnet-4-5-20250929", 0, 0)).toBe(0);
  });

  it("microUsdToUsd converts cleanly", () => {
    expect(microUsdToUsd(1_500_000)).toBe(1.5);
    expect(microUsdToUsd(0)).toBe(0);
  });

  it("formatUsd produces 4-decimal string", () => {
    expect(formatUsd(1_500_000)).toBe("$1.5000");
    expect(formatUsd(123)).toBe("$0.0001");
  });
});
