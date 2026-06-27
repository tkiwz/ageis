/**
 * Brain vector embeddings — Gemini text-embedding-004 (768 dims, free tier).
 *
 * Used by memory.ts to:
 *   - Store a semantic vector alongside every new BrainMemory row.
 *   - Rank recalled memories by cosine similarity to the current signal.
 *
 * Falls back gracefully: if GEMINI_API_KEY is not set or the API call fails,
 * callers receive null and should fall back to keyword matching.
 */
import { GoogleGenerativeAI } from "@google/generative-ai";

const EMBEDDING_MODEL = "text-embedding-004";
export const EMBEDDING_DIM = 768;

let _client: GoogleGenerativeAI | null = null;

function getClient(): GoogleGenerativeAI | null {
  if (_client) return _client;
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY;
  if (!apiKey) return null;
  _client = new GoogleGenerativeAI(apiKey);
  return _client;
}

/**
 * Generate a 768-dim embedding for `text`.
 * Returns null if the API key is missing or the call fails (caller falls back to keyword search).
 */
export async function embed(text: string): Promise<number[] | null> {
  const client = getClient();
  if (!client) return null;

  try {
    const model = client.getGenerativeModel({ model: EMBEDDING_MODEL });
    // Truncate to avoid token limit (text-embedding-004 max ~2048 tokens)
    const input = text.slice(0, 8000);
    const result = await model.embedContent(input);
    return result.embedding.values;
  } catch (err) {
    // Non-fatal — memory system continues with keyword fallback
    console.warn("[brain/embeddings] embed failed:", err instanceof Error ? err.message : err);
    return null;
  }
}

/**
 * Cosine similarity between two vectors.
 * Returns a value in [-1, 1]. Higher = more similar.
 * Returns 0 if vectors have different length or zero norm.
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;

  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dot   += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

/**
 * Parse a stored embedding JSON string back into a number[].
 * Returns null if the string is falsy, unparseable, or wrong shape.
 */
export function parseStoredEmbedding(raw: string | null | undefined): number[] | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length === EMBEDDING_DIM && typeof parsed[0] === "number") {
      return parsed as number[];
    }
    return null;
  } catch {
    return null;
  }
}
