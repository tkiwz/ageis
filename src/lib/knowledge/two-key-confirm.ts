/**
 * Two-key CRITICAL confirmation handler.
 *
 * Rules:
 *   - The AISuggestion is in status AWAITING_TWO_KEYS with a 5-minute expiresAt
 *   - First manager confirms → state becomes AWAITING_SECOND_KEY
 *   - Second manager (must be a DIFFERENT userId from the first) confirms → memory created, status EXECUTED
 *   - Expired (no second key in 5 min) → reverts to PENDING normal flow
 *
 * Rejection from any manager at any stage → status REJECTED, no memory created.
 */
import { db } from "@/lib/db";
import { remember } from "@/lib/brain/memory";
import { appendAuditLog } from "@/lib/security/audit-chain";
import type { StructuredKnowledge } from "./types";

interface ConfirmInput {
  suggestionId: string;
  userId: string;
  userEmail?: string;
  action: "CONFIRM" | "REJECT";
}

interface ConfirmResult {
  status: "AWAITING_SECOND_KEY" | "EXECUTED" | "REJECTED" | "EXPIRED" | "ALREADY_DONE";
  message: string;
  memoryId?: string;
  reason?: string;
}

interface TwoKeyState {
  required: number;
  confirmers: string[];
  ttlMs: number;
}

interface SuggestionMetadata {
  contributionId?: string;
  contributorId?: string;
  source?: string;
  twoKeyState?: TwoKeyState;
}

export async function handleTwoKeyConfirm(input: ConfirmInput): Promise<ConfirmResult> {
  const s = await db.aISuggestion.findUnique({ where: { id: input.suggestionId } });
  if (!s) return { status: "ALREADY_DONE", message: "Suggestion not found" };
  if (s.type !== "CRITICAL_KNOWLEDGE") {
    return { status: "ALREADY_DONE", message: "Not a two-key suggestion" };
  }

  // Expiry check
  if (s.expiresAt && s.expiresAt.getTime() < Date.now() && (s.status === "AWAITING_TWO_KEYS" || s.status === "AWAITING_SECOND_KEY")) {
    return revertToPending(s.id, "Expired before two keys confirmed");
  }

  // Already-handled check
  if (s.status === "EXECUTED" || s.status === "REJECTED" || s.status === "APPROVED") {
    return { status: "ALREADY_DONE", message: `Already ${s.status}` };
  }

  const meta: SuggestionMetadata = s.metadata ? JSON.parse(s.metadata) : {};
  const state: TwoKeyState = meta.twoKeyState ?? { required: 2, confirmers: [], ttlMs: 5 * 60 * 1000 };

  // ─── REJECT path ───
  if (input.action === "REJECT") {
    await db.aISuggestion.update({
      where: { id: s.id },
      data: {
        status: "REJECTED",
        reviewedById: input.userId,
        reviewedAt: new Date(),
        reviewerNotes: `Two-key rejected by ${input.userEmail ?? input.userId}`,
      },
    });
    // Mark contribution as rejected too
    if (meta.contributionId) {
      await db.knowledgeContribution.update({
        where: { id: meta.contributionId },
        data: {
          status: "REJECTED",
          reviewedById: input.userId,
          reviewedAt: new Date(),
          reviewerNotes: "Rejected at two-key gate",
        },
      });
    }
    await appendAuditLog({
      module: "KNOWLEDGE",
      action: "CRITICAL_TWO_KEY_REJECTED",
      actionType: "MANUAL",
      description: `${input.userEmail ?? input.userId} rejected critical contribution at two-key gate (suggestion ${s.id})`,
      metadata: JSON.stringify({ suggestionId: s.id, contributionId: meta.contributionId }),
      userId: input.userId,
      riskLevel: "HIGH",
    });
    return { status: "REJECTED", message: "Critical observation rejected." };
  }

  // ─── CONFIRM path ───
  if (state.confirmers.includes(input.userId)) {
    return { status: "ALREADY_DONE", message: "You already confirmed this. Need a SECOND, different manager." };
  }

  const newConfirmers = [...state.confirmers, input.userId];

  // First key
  if (newConfirmers.length < state.required) {
    await db.aISuggestion.update({
      where: { id: s.id },
      data: {
        status: "AWAITING_SECOND_KEY",
        metadata: JSON.stringify({ ...meta, twoKeyState: { ...state, confirmers: newConfirmers } }),
      },
    });
    await appendAuditLog({
      module: "KNOWLEDGE",
      action: "CRITICAL_FIRST_KEY",
      actionType: "MANUAL",
      description: `${input.userEmail ?? input.userId} confirmed (first key) on suggestion ${s.id}`,
      metadata: JSON.stringify({ suggestionId: s.id }),
      userId: input.userId,
      riskLevel: "MEDIUM",
    });
    return {
      status: "AWAITING_SECOND_KEY",
      message: "First key confirmed. Waiting for a different manager to confirm the second key.",
    };
  }

  // Second key — execute
  let structured: StructuredKnowledge | null = null;
  try {
    structured = s.aiAnalysis ? (JSON.parse(s.aiAnalysis) as StructuredKnowledge) : null;
  } catch { /* ignore */ }
  if (!structured) {
    return { status: "REJECTED", message: "Cannot execute — structured content lost" };
  }

  // Create the memory NOW
  const memoryId = await remember({
    category: structured.category,
    subject: structured.subject,
    content: structured.content,
    contentAr: structured.contentAr,
    tags: structured.tags ?? [],
    confidence: Math.min(0.92, structured.confidence + 0.1), // bonus for two-key validation
    createdById: meta.contributorId,
    evidence: {
      contributionId: meta.contributionId,
      suggestionId: s.id,
      twoKeyConfirmers: newConfirmers,
      source: meta.source,
    },
  });

  await db.aISuggestion.update({
    where: { id: s.id },
    data: {
      status: "EXECUTED",
      reviewedById: input.userId,
      reviewedAt: new Date(),
      resultRefs: JSON.stringify({ memoryId, twoKeyConfirmers: newConfirmers }),
      metadata: JSON.stringify({ ...meta, twoKeyState: { ...state, confirmers: newConfirmers } }),
    },
  });

  if (meta.contributionId) {
    await db.knowledgeContribution.update({
      where: { id: meta.contributionId },
      data: {
        status: "AUTO_APPLIED",
        reviewedById: input.userId,
        reviewedAt: new Date(),
        resultingMemoryIds: JSON.stringify([memoryId]),
      },
    });
  }

  await appendAuditLog({
    module: "KNOWLEDGE",
    action: "CRITICAL_TWO_KEY_EXECUTED",
    actionType: "MANUAL",
    description:
      `Critical observation applied to brain after two-key confirmation. ` +
      `Confirmers: ${newConfirmers.join(", ")}. Memory: ${memoryId}.`,
    metadata: JSON.stringify({ suggestionId: s.id, memoryId, confirmers: newConfirmers }),
    userId: input.userId,
    riskLevel: "CRITICAL",
  });

  return { status: "EXECUTED", message: "Critical observation applied to brain.", memoryId };
}

async function revertToPending(suggestionId: string, reason: string): Promise<ConfirmResult> {
  const s = await db.aISuggestion.findUnique({ where: { id: suggestionId } });
  if (!s) return { status: "EXPIRED", message: reason };
  const meta: SuggestionMetadata = s.metadata ? JSON.parse(s.metadata) : {};

  await db.aISuggestion.update({
    where: { id: suggestionId },
    data: {
      status: "EXPIRED",
      reviewerNotes: reason,
    },
  });

  // Fall back: contribution goes to normal review queue
  if (meta.contributionId) {
    await db.knowledgeContribution.update({
      where: { id: meta.contributionId },
      data: { status: "AI_PROCESSED", reviewerNotes: `Two-key expired — fell back to normal review. ${reason}` },
    });
  }

  await appendAuditLog({
    module: "KNOWLEDGE",
    action: "CRITICAL_TWO_KEY_EXPIRED",
    actionType: "AI_AUTONOMOUS",
    isAutonomous: true,
    description: `Two-key window expired for ${suggestionId} — reverted to normal review`,
    metadata: JSON.stringify({ suggestionId, contributionId: meta.contributionId }),
    riskLevel: "HIGH",
  });

  return { status: "EXPIRED", message: reason, reason };
}

/**
 * Background sweep — should run every minute via a tick endpoint to revert
 * expired two-key suggestions. Wire this to your existing autonomy heartbeat.
 */
export async function sweepExpiredTwoKeys(): Promise<{ expired: number }> {
  const expired = await db.aISuggestion.findMany({
    where: {
      type: "CRITICAL_KNOWLEDGE",
      status: { in: ["AWAITING_TWO_KEYS", "AWAITING_SECOND_KEY"] },
      expiresAt: { lt: new Date() },
    },
    select: { id: true },
    take: 50,
  });
  for (const s of expired) {
    await revertToPending(s.id, "TTL exceeded — no second key received");
  }
  return { expired: expired.length };
}
