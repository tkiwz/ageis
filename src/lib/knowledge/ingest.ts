/**
 * Knowledge ingestion pipeline.
 *
 *   1. Save raw contribution
 *   2. Ask Claude to extract structured knowledge + classify severity
 *   3. Detect conflicts with existing memories
 *   4. Branch:
 *        - CRITICAL  → auto-apply: create memory, AISuggestion, notify managers, sound
 *        - else      → mark AI_PROCESSED, enter human review queue
 *   5. Update expert profile counts
 */
import { db } from "@/lib/db";
import { guardedClaudeChat } from "@/lib/ai/guarded-claude";
import { remember } from "@/lib/brain/memory";
import { findConflicts } from "./conflict-detector";
import { recordContribution, getTrustWeight } from "./expert";
import { appendAuditLog } from "@/lib/security/audit-chain";
import { log } from "@/lib/observability/logger";
import type { ContributionSource, StructuredKnowledge } from "./types";

export interface IngestInput {
  source: ContributionSource;
  rawContent: string;
  contributorId: string;
  contextType?: string;
  contextId?: string;
  fileUrl?: string;
  fileName?: string;
  fileSize?: number;
  transcript?: string;
  language?: string;
}

export interface IngestResult {
  contributionId: string;
  structured?: StructuredKnowledge;
  conflicts: number;
  autoApplied: boolean;
  memoryId?: string;
  suggestionId?: string;
  blocked?: string;
}

const AUTO_APPLY_SEVERITIES: Array<StructuredKnowledge["severity"]> = ["CRITICAL"];

export async function ingestContribution(input: IngestInput): Promise<IngestResult> {
  // 1. Save raw row
  const row = await db.knowledgeContribution.create({
    data: {
      source: input.source,
      rawContent: input.rawContent,
      contributorId: input.contributorId,
      contextType: input.contextType,
      contextId: input.contextId,
      fileUrl: input.fileUrl,
      fileName: input.fileName,
      fileSize: input.fileSize,
      transcript: input.transcript,
      language: input.language,
      status: "PENDING",
    },
  });
  await recordContribution(input.contributorId);

  // 2. Extract structure via Claude
  const trust = await getTrustWeight(input.contributorId);
  const structured = await extractStructure(input, trust);

  if (!structured) {
    // Couldn't process — leave as PENDING for human review
    await db.knowledgeContribution.update({
      where: { id: row.id },
      data: { status: "PENDING", reviewerNotes: "AI extraction failed — manual review required." },
    });
    return {
      contributionId: row.id,
      conflicts: 0,
      autoApplied: false,
      blocked: "AI extraction failed",
    };
  }

  // 3. Detect conflicts
  const conflicts = await findConflicts({
    contributionId: row.id,
    category: structured.category,
    subject: structured.subject,
    content: structured.content,
  });

  // 4. Branch on severity
  const shouldAutoApply = AUTO_APPLY_SEVERITIES.includes(structured.severity);

  if (shouldAutoApply) {
    return await autoApply(row.id, input, structured, conflicts.length);
  }

  // Regular path: mark as AI_PROCESSED, wait for human approval
  await db.knowledgeContribution.update({
    where: { id: row.id },
    data: {
      status: "AI_PROCESSED",
      structuredContent: JSON.stringify(structured),
      severity: structured.severity,
    },
  });

  // Notify managers a new contribution is pending — soft notification (not critical)
  const managers = await db.user.findMany({
    where: { role: { in: ["ADMIN", "HSSE_MANAGER"] }, isActive: true },
    select: { id: true },
  });
  if (managers.length > 0) {
    await db.notification.createMany({
      data: managers.map((m) => ({
        userId: m.id,
        type: "KNOWLEDGE",
        severity: "INFO",
        title: `New knowledge contribution awaiting review`,
        titleAr: `مساهمة معرفية جديدة بانتظار المراجعة`,
        body: `Category: ${structured.category} · Severity: ${structured.severity}\n${structured.content.slice(0, 120)}`,
        link: `/intelligence/knowledge?contribution=${row.id}`,
        metadata: JSON.stringify({ contributionId: row.id }),
      })),
    });
  }

  return {
    contributionId: row.id,
    structured,
    conflicts: conflicts.length,
    autoApplied: false,
  };
}

async function autoApply(
  contributionId: string,
  input: IngestInput,
  structured: StructuredKnowledge,
  conflictCount: number,
): Promise<IngestResult> {
  // ─── TWO-KEY CONFIRMATION FLOW ───
  // For CRITICAL: do NOT create the memory yet. We create an AISuggestion
  // in status "AWAITING_TWO_KEYS" and notify all managers. Two DIFFERENT
  // managers must confirm within 5 minutes for the memory to be created.
  // If only one confirms or 5 min pass with none, it falls back to PENDING.
  const TWO_KEY_TTL_MS = 5 * 60 * 1000;
  const expiresAt = new Date(Date.now() + TWO_KEY_TTL_MS);

  // Create AISuggestion as the "two-key request" record
  const suggestion = await db.aISuggestion.create({
    data: {
      type: "CRITICAL_KNOWLEDGE",
      subjectType: structured.subject ? "site" : "general",
      subjectId: structured.subject ?? "global",
      proposedAction: structured.immediateAction ?? "REVIEW_CRITICAL_OBSERVATION",
      severity: structured.severity,
      confidence: structured.confidence,
      reasoning: structured.content,
      reasoningAr: structured.contentAr,
      aiAnalysis: JSON.stringify(structured),
      metadata: JSON.stringify({
        contributionId,
        contributorId: input.contributorId,
        source: input.source,
        // Two-key state — first/second confirmer fields filled as confirmations arrive
        twoKeyState: {
          required: 2,
          confirmers: [], // userIds in order
          ttlMs: TWO_KEY_TTL_MS,
        },
      }),
      status: "AWAITING_TWO_KEYS",
      expiresAt,
    },
  });

  // Contribution stays in PENDING_CRITICAL until confirmed; tracks the suggestion
  await db.knowledgeContribution.update({
    where: { id: contributionId },
    data: {
      status: "AI_PROCESSED",
      structuredContent: JSON.stringify(structured),
      severity: structured.severity,
      autoEscalatedTo: JSON.stringify({ aiSuggestionId: suggestion.id, requiresTwoKeys: true }),
    },
  });

  // Critical-severity notifications — go to ALL HSSE staff immediately
  const recipients = await db.user.findMany({
    where: { role: { in: ["ADMIN", "HSSE_MANAGER", "SAFETY_OFFICER"] }, isActive: true },
    select: { id: true },
  });
  if (recipients.length > 0) {
    await db.notification.createMany({
      data: recipients.map((r) => ({
        userId: r.id,
        type: "ALERT",
        severity: "CRITICAL",
        title: `🚨 CRITICAL knowledge — requires 2-key confirmation`,
        titleAr: `🚨 ملاحظة حرجة — تتطلب موافقة مديرين`,
        body:
          `${structured.content.slice(0, 200)}\n\n` +
          `Immediate action: ${structured.immediateAction ?? "Review now"}\n` +
          `🔑 Two different managers must confirm within 5 minutes for this to be applied to the brain.\n` +
          `Source: ${input.source}`,
        bodyAr: structured.contentAr ?? null,
        link: `/intelligence/suggestions/${suggestion.id}`,
        metadata: JSON.stringify({ contributionId, suggestionId: suggestion.id, requiresTwoKeys: true }),
      })),
    });
  }

  // Audit log — chained
  await appendAuditLog({
    module: "KNOWLEDGE",
    action: "CRITICAL_TWO_KEY_REQUESTED",
    actionType: "AI_AUTONOMOUS",
    isAutonomous: true,
    description: `Critical contribution flagged — awaiting two-key confirmation: ${structured.content.slice(0, 200)}`,
    metadata: JSON.stringify({
      contributionId,
      suggestionId: suggestion.id,
      contributorId: input.contributorId,
      severity: structured.severity,
      ttlMs: TWO_KEY_TTL_MS,
    }),
    riskLevel: structured.severity,
    userId: input.contributorId,
  });

  log.warn("Critical knowledge contribution — two-key confirmation requested", {
    contributionId, suggestionId: suggestion.id, expiresAt,
  });

  return {
    contributionId,
    structured,
    conflicts: conflictCount,
    autoApplied: false, // memory not created until two keys confirm
    suggestionId: suggestion.id,
  };
}

// ─── AI extraction ───

async function extractStructure(
  input: IngestInput,
  trust: number,
): Promise<StructuredKnowledge | null> {
  const sourceHint =
    input.source === "DOCUMENT" ? "extracted from an uploaded document" :
    input.source === "INCIDENT_RETRO" ? "post-incident retrospective" :
    input.source === "VOICE_MEMO" ? "voice transcript from a field worker" :
    "free-form expert insight";

  const contextHint = input.contextType && input.contextId
    ? `\nThis is linked to ${input.contextType} ${input.contextId}.`
    : "";

  const system = `You are AEGIS's knowledge distiller.
A worker has contributed an observation; your job is to:
  1. Extract ONE concrete, actionable learning
  2. Classify the right category (PIPELINE_LEAK_PATTERN, HEAT_STRESS, CONTRACTOR_HISTORY, H2S_PATTERN, etc.)
  3. Assess severity — CRITICAL means the observation describes an active danger requiring IMMEDIATE notification (e.g. "I just saw H2S levels spike at compressor C3 — workers in the area")
  4. Give it a calibrated confidence (0-1)

CRITICAL severity SHOULD ONLY be used when:
  - The observation describes a live, ongoing hazard, OR
  - It contradicts a current operational decision in a dangerous way

Respond ONLY in JSON.`;

  const userPrompt = `Source: ${sourceHint}
Trust weight of contributor: ${trust.toFixed(2)} (0=new, 1=highly trusted)${contextHint}

Contribution:
"""
${input.rawContent.slice(0, 4000)}
"""

Respond:
{
  "category": "CATEGORY_NAME_IN_CAPS",
  "subject": "site code / contractor / equipment / null",
  "content": "1-3 sentence learning in English",
  "contentAr": "بالعربية",
  "tags": ["tag1", "tag2"],
  "confidence": 0.0-1.0,
  "severity": "LOW"|"MEDIUM"|"HIGH"|"CRITICAL",
  "reasoning": "1 sentence: why this severity",
  "immediateAction": "if CRITICAL: what to do RIGHT NOW (1 sentence)",
  "immediateActionAr": "بالعربية"
}`;

  const r = await guardedClaudeChat({
    module: "voice",
    feature: "knowledge-distill",
    system,
    messages: [{ role: "user", content: userPrompt }],
    maxTokens: 800,
    temperature: 0.25,
    autonomous: true,
    decisionType: "KNOWLEDGE_DISTILL",
    inputSnapshot: { source: input.source, contributorId: input.contributorId, trust },
  });

  if (r.blocked) {
    log.warn("Knowledge distill blocked", { reason: r.blocked.reason });
    return null;
  }
  const m = r.content.match(/\{[\s\S]*\}/);
  if (!m) return null;

  try {
    const parsed = JSON.parse(m[0]) as StructuredKnowledge;
    if (!parsed.category || !parsed.content || !parsed.severity) return null;
    // Apply contributor trust to confidence — gives a small boost or penalty
    parsed.confidence = Math.max(0, Math.min(1, parsed.confidence * (0.6 + trust * 0.6)));
    return parsed;
  } catch {
    return null;
  }
}
