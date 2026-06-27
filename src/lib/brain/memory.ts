/**
 * Brain memory -- store + retrieve learnings the brain accumulates over time.
 *
 * Recall strategy (best-effort, layered):
 *   1. VECTOR SEARCH  -- embed the signal trigger with Gemini text-embedding-004,
 *      load ACTIVE memories that have stored embeddings, rank by cosine similarity.
 *   2. KEYWORD SEARCH -- for any memories without embeddings (created before the
 *      vector upgrade, or when the API was unavailable), fall back to category +
 *      subject + keyword matching.
 *   3. MERGE + RE-RANK -- combine both result sets, deduplicate, apply a final
 *      confidence x reinforcement score, and return the top-k.
 *
 * Fully backwards compatible: if GEMINI_API_KEY is absent or the embedding call
 * fails, the system silently falls back to pure keyword search.
 */
import { db } from "@/lib/db";
import { embed, cosineSimilarity, parseStoredEmbedding } from "./embeddings";
import type { RecalledMemory, BrainSignal } from "./types";

const DEFAULT_RECALL_LIMIT = 8;
const VECTOR_CANDIDATE_LIMIT = 300;
const COSINE_THRESHOLD = 0.55;

// --------------------------------------------------------------------------
// recall()
// --------------------------------------------------------------------------

export async function recall(signal: BrainSignal, limit = DEFAULT_RECALL_LIMIT): Promise<RecalledMemory[]> {
  const [vectorHits, keywordHits] = await Promise.all([
    recallByVector(signal, limit * 3),
    recallByKeyword(signal, limit * 3),
  ]);

  const seen = new Set<string>();
  const merged: Array<{ m: RecalledMemory; score: number }> = [];

  for (const { m, score } of vectorHits) {
    seen.add(m.id);
    merged.push({ m, score });
  }
  for (const { m, score } of keywordHits) {
    if (!seen.has(m.id)) {
      seen.add(m.id);
      merged.push({ m, score });
    }
  }

  merged.sort((a, b) => b.score - a.score);
  const top = merged.slice(0, limit).map((x) => x.m);

  if (top.length > 0) {
    await db.brainMemory.updateMany({
      where: { id: { in: top.map((m) => m.id) } },
      data: { lastUsedAt: new Date(), usedCount: { increment: 1 } },
    });
  }

  return top;
}

// --------------------------------------------------------------------------
// Vector recall
// --------------------------------------------------------------------------

async function recallByVector(
  signal: BrainSignal,
  limit: number,
): Promise<Array<{ m: RecalledMemory; score: number }>> {
  const queryText = `${signal.type}: ${signal.trigger}`;
  const queryVec = await embed(queryText);
  if (!queryVec) return [];

  const rows = await db.brainMemory.findMany({
    where: { status: "ACTIVE", embedding: { not: null } },
    select: {
      id: true, category: true, subject: true, content: true,
      confidence: true, reinforcements: true, embedding: true,
    },
    take: VECTOR_CANDIDATE_LIMIT,
  });

  const scored: Array<{ m: RecalledMemory; score: number }> = [];

  for (const row of rows) {
    const vec = parseStoredEmbedding(row.embedding);
    if (!vec) continue;
    const cosine = cosineSimilarity(queryVec, vec);
    if (cosine < COSINE_THRESHOLD) continue;
    const quality = row.confidence * (1 + row.reinforcements * 0.15);
    const score = cosine * 0.7 + quality * 0.3;
    scored.push({
      score,
      m: {
        id: row.id, category: row.category, subject: row.subject,
        content: row.content, confidence: row.confidence, reinforcements: row.reinforcements,
      },
    });
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit);
}

// --------------------------------------------------------------------------
// Keyword recall (fallback)
// --------------------------------------------------------------------------

async function recallByKeyword(
  signal: BrainSignal,
  limit: number,
): Promise<Array<{ m: RecalledMemory; score: number }>> {
  const categoryHints = signalToCategories(signal);
  const subjects      = extractSubjects(signal);
  const keywords      = extractKeywords(signal);

  const where: Record<string, unknown> = { status: "ACTIVE" };
  const orFilters: Array<Record<string, unknown>> = [];

  if (categoryHints.length > 0) orFilters.push({ category: { in: categoryHints } });
  if (subjects.length > 0)      orFilters.push({ subject: { in: subjects } });
  for (const k of keywords) {
    orFilters.push({ content: { contains: k } });
    orFilters.push({ tags:    { contains: k } });
  }

  if (orFilters.length > 0) where.OR = orFilters;

  const rows = await db.brainMemory.findMany({
    where,
    orderBy: [{ confidence: "desc" }, { reinforcements: "desc" }],
    take: limit * 2,
  });

  return rows
    .map((row) => ({
      score: row.confidence * (1 + row.reinforcements * 0.2) - row.contradictions * 0.3,
      m: {
        id: row.id, category: row.category, subject: row.subject,
        content: row.content, confidence: row.confidence, reinforcements: row.reinforcements,
      } satisfies RecalledMemory,
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

// --------------------------------------------------------------------------
// remember()
// --------------------------------------------------------------------------

export async function remember(input: {
  category:     string;
  content:      string;
  contentAr?:   string;
  subject?:     string;
  evidence?:    unknown;
  tags?:        string[];
  confidence?:  number;
  createdById?: string;
}): Promise<string> {
  const vec = await embed(input.content);

  const row = await db.brainMemory.create({
    data: {
      category:    input.category,
      subject:     input.subject,
      content:     input.content,
      contentAr:   input.contentAr,
      evidence:    input.evidence ? JSON.stringify(input.evidence) : null,
      tags:        input.tags ? JSON.stringify(input.tags) : null,
      confidence:  Math.max(0, Math.min(1, input.confidence ?? 0.5)),
      createdById: input.createdById,
      embedding:   vec ? JSON.stringify(vec) : null,
    },
  });

  return row.id;
}

// --------------------------------------------------------------------------
// feedback()
// --------------------------------------------------------------------------

export async function feedback(memoryId: string, outcome: "REINFORCE" | "CONTRADICT"): Promise<void> {
  const current = await db.brainMemory.findUnique({ where: { id: memoryId } });
  if (!current) return;

  if (outcome === "REINFORCE") {
    await db.brainMemory.update({
      where: { id: memoryId },
      data: {
        reinforcements: current.reinforcements + 1,
        confidence:     Math.min(0.98, current.confidence + 0.05),
      },
    });
  } else {
    const newContradictions = current.contradictions + 1;
    const newConfidence     = Math.max(0.05, current.confidence - 0.1);
    const shouldArchive     = newContradictions >= 3 && newConfidence < 0.2;
    await db.brainMemory.update({
      where: { id: memoryId },
      data: {
        contradictions: newContradictions,
        confidence:     newConfidence,
        status:         shouldArchive ? "ARCHIVED" : current.status,
      },
    });
  }
}

// --------------------------------------------------------------------------
// Helpers
// --------------------------------------------------------------------------

function signalToCategories(s: BrainSignal): string[] {
  const cats = new Set<string>();
  switch (s.type) {
    case "PIPELINE_ANOMALY":
      cats.add("PIPELINE_LEAK_PATTERN"); cats.add("LEAK_PATTERN"); cats.add("PIPELINE_RISK"); break;
    case "PERMIT_NEW":
      cats.add("PERMIT_RISK"); cats.add("CONTRACTOR_HISTORY"); cats.add("PERMIT_PATTERN"); break;
    case "WELLNESS_ALERT":
      cats.add("WELLNESS_PATTERN"); cats.add("HEAT_STRESS"); cats.add("H2S_PATTERN"); break;
    case "VISION_DETECTION":
      cats.add("VISION_PATTERN"); cats.add("PPE_VIOLATION"); break;
    case "SENSOR_ANOMALY":
      cats.add("SENSOR_PATTERN"); cats.add("DEVICE_HISTORY"); break;
    case "INCIDENT":
      cats.add("INCIDENT_PATTERN"); cats.add("ROOT_CAUSE_PATTERN"); break;
    case "SCHEDULED_REVIEW":
      cats.add("WEATHER_CORRELATION"); cats.add("DAILY_PATTERN"); break;
  }
  return Array.from(cats);
}

function extractSubjects(s: BrainSignal): string[] {
  const subjects: string[] = [];
  if (s.siteId) subjects.push(s.siteId);
  const p = s.payload as Record<string, unknown>;
  for (const key of ["pipelineId", "permitId", "incidentId", "workerId", "deviceId", "alertId"]) {
    const v = p?.[key];
    if (typeof v === "string") subjects.push(v);
  }
  return Array.from(new Set(subjects));
}

function extractKeywords(s: BrainSignal): string[] {
  const trigger = s.trigger.toLowerCase();
  const words   = trigger.match(/[a-zA-Z؀-ۿ]{4,}/g) ?? [];
  const stop    = new Set(["this", "that", "with", "from", "have", "been", "into", "more", "than"]);
  return Array.from(new Set(words.filter((w) => !stop.has(w)))).slice(0, 5);
}
