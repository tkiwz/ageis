/**
 * Per-model weights for the rain blend. Until calibration against observations
 * has run, every model weighs the same.
 */
import { MODELS } from "./models";

export async function getModelWeights(): Promise<Record<string, number>> {
  return Object.fromEntries(MODELS.map((m) => [m.id, 1]));
}
