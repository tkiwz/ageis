/**
 * Conflict detector — find existing memories that overlap with a new
 * contribution, so humans can resolve duplicates / contradictions.
 *
 * Simple keyword Jaccard similarity for now. Upgrade path: vector embeddings.
 */
import { db } from "@/lib/db";

const SIMILARITY_THRESHOLD = 0.4;

function tokenize(text: string): Set<string> {
  return new Set(
    text.toLowerCase()
      .replace(/[^a-zA-Z0-9؀-ۿ\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 3),
  );
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 0;
  let intersection = 0;
  for (const w of a) if (b.has(w)) intersection++;
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

export interface Conflict {
  existingMemoryId: string;
  similarity: number;
  reason: string;
  existingContent: string;
}

export async function findConflicts(input: {
  contributionId: string;
  category: string;
  subject?: string;
  content: string;
}): Promise<Conflict[]> {
  const tokens = tokenize(input.content);
  // Pull a candidate set — same category OR same subject
  const candidates = await db.brainMemory.findMany({
    where: {
      status: "ACTIVE",
      OR: [
        { category: input.category },
        input.subject ? { subject: input.subject } : { id: "__never__" },
      ],
    },
    select: { id: true, content: true, confidence: true },
    take: 40,
  });

  const conflicts: Conflict[] = [];
  for (const c of candidates) {
    const sim = jaccard(tokens, tokenize(c.content));
    if (sim >= SIMILARITY_THRESHOLD) {
      const reason = sim > 0.7 ? "near-duplicate" : "topic-overlap";
      conflicts.push({
        existingMemoryId: c.id,
        similarity: Number(sim.toFixed(3)),
        reason,
        existingContent: c.content,
      });
    }
  }

  // Persist
  for (const c of conflicts) {
    await db.memoryConflict.create({
      data: {
        newContributionId: input.contributionId,
        existingMemoryId: c.existingMemoryId,
        similarity: c.similarity,
        reason: c.reason,
      },
    }).catch(() => { /* ignore unique violations */ });
  }

  return conflicts;
}
