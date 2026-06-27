/**
 * Human review of contributed knowledge.
 *
 *   APPROVE → create a BrainMemory (with contributor's trust-weighted confidence)
 *   REJECT  → mark rejected, update expert profile (trust drops a bit)
 *
 * Auto-applied CRITICAL contributions can still be reviewed retroactively to
 * confirm or revoke the auto-decision.
 */
import { db } from "@/lib/db";
import { remember } from "@/lib/brain/memory";
import { recordReviewOutcome, getTrustWeight } from "./expert";
import { appendAuditLog } from "@/lib/security/audit-chain";
import type { StructuredKnowledge } from "./types";

export interface ReviewInput {
  contributionId: string;
  reviewerId: string;
  reviewerEmail?: string;
  verdict: "APPROVE" | "REJECT";
  notes?: string;
}

export interface ReviewResult {
  status: "APPROVED" | "REJECTED";
  memoryId?: string;
  rejected?: boolean;
}

export async function reviewContribution(input: ReviewInput): Promise<ReviewResult> {
  const c = await db.knowledgeContribution.findUnique({ where: { id: input.contributionId } });
  if (!c) throw new Error("Contribution not found");
  if (c.status === "APPROVED" || c.status === "REJECTED") {
    throw new Error(`Already ${c.status}`);
  }

  if (input.verdict === "REJECT") {
    await db.knowledgeContribution.update({
      where: { id: c.id },
      data: {
        status: "REJECTED",
        reviewedById: input.reviewerId,
        reviewedAt: new Date(),
        reviewerNotes: input.notes,
      },
    });
    await recordReviewOutcome(c.contributorId, false);
    await appendAuditLog({
      module: "KNOWLEDGE",
      action: "CONTRIBUTION_REJECTED",
      actionType: "MANUAL",
      description: `${input.reviewerEmail ?? input.reviewerId} rejected contribution ${c.id}`,
      metadata: JSON.stringify({ contributionId: c.id, notes: input.notes }),
      userId: input.reviewerId,
      riskLevel: "LOW",
    });
    return { status: "REJECTED", rejected: true };
  }

  // APPROVE
  let structured: StructuredKnowledge | null = null;
  if (c.structuredContent) {
    try { structured = JSON.parse(c.structuredContent) as StructuredKnowledge; } catch { /* ignore */ }
  }
  if (!structured) throw new Error("Cannot approve — no AI-structured content");

  // If this was already auto-applied, just confirm — no need to recreate memory
  let memoryId: string | undefined;
  if (c.status === "AUTO_APPLIED") {
    // Already has memory — just bump confidence as confirmation
    try {
      const existingIds = c.resultingMemoryIds ? (JSON.parse(c.resultingMemoryIds) as string[]) : [];
      memoryId = existingIds[0];
      if (memoryId) {
        const m = await db.brainMemory.findUnique({ where: { id: memoryId } });
        if (m) {
          await db.brainMemory.update({
            where: { id: memoryId },
            data: {
              confidence: Math.min(0.97, m.confidence + 0.1),
              reinforcements: { increment: 1 },
            },
          });
        }
      }
    } catch { /* ignore */ }
  } else {
    // Create the memory now — apply contributor trust weight
    const trust = await getTrustWeight(c.contributorId);
    const adjustedConfidence = Math.min(0.95, structured.confidence * (0.5 + trust * 0.5));
    memoryId = await remember({
      category: structured.category,
      subject: structured.subject,
      content: structured.content,
      contentAr: structured.contentAr,
      tags: structured.tags ?? [],
      confidence: adjustedConfidence,
      createdById: c.contributorId,
      evidence: { contributionId: c.id, reviewerId: input.reviewerId, trust },
    });
  }

  await db.knowledgeContribution.update({
    where: { id: c.id },
    data: {
      status: "APPROVED",
      reviewedById: input.reviewerId,
      reviewedAt: new Date(),
      reviewerNotes: input.notes,
      resultingMemoryIds: memoryId ? JSON.stringify([memoryId]) : c.resultingMemoryIds,
    },
  });

  await recordReviewOutcome(c.contributorId, true);

  await appendAuditLog({
    module: "KNOWLEDGE",
    action: "CONTRIBUTION_APPROVED",
    actionType: "MANUAL",
    description: `${input.reviewerEmail ?? input.reviewerId} approved contribution ${c.id} → memory ${memoryId}`,
    metadata: JSON.stringify({ contributionId: c.id, memoryId }),
    userId: input.reviewerId,
    riskLevel: "MEDIUM",
  });

  return { status: "APPROVED", memoryId };
}
