/**
 * Voice conversation memory — short rolling window per user/session.
 * Used to give Claude context so pronouns like "show them" or "assign him"
 * can be resolved against prior turns.
 */
import { db } from "@/lib/db";

const MAX_MEMORY_TURNS = 5;
const MEMORY_TTL_MINUTES = 30;

export interface VoiceTurn {
  role: "user" | "assistant";
  content: string;
  transcript?: string | null;
  language?: string | null;
  intent?: string | null;
  action?: string | null;
  target?: string | null;
  metadata?: Record<string, unknown> | null;
  createdAt: Date;
}

export async function loadRecentTurns(userId: string, sessionId: string): Promise<VoiceTurn[]> {
  const since = new Date(Date.now() - MEMORY_TTL_MINUTES * 60_000);
  const rows = await db.voiceMessage.findMany({
    where: { userId, sessionId, createdAt: { gte: since } },
    orderBy: { createdAt: "desc" },
    take: MAX_MEMORY_TURNS * 2, // user+assistant pairs
  });
  return rows.reverse().map((r) => ({
    role: r.role as "user" | "assistant",
    content: r.content,
    transcript: r.transcript,
    language: r.language,
    intent: r.intent,
    action: r.action,
    target: r.target,
    metadata: r.metadata ? JSON.parse(r.metadata) : null,
    createdAt: r.createdAt,
  }));
}

export async function recordTurn(
  userId: string,
  sessionId: string,
  turn: Omit<VoiceTurn, "createdAt">,
): Promise<void> {
  await db.voiceMessage.create({
    data: {
      userId,
      sessionId,
      role: turn.role,
      content: turn.content,
      transcript: turn.transcript ?? null,
      language: turn.language ?? null,
      intent: turn.intent ?? null,
      action: turn.action ?? null,
      target: turn.target ?? null,
      metadata: turn.metadata ? JSON.stringify(turn.metadata) : null,
    },
  });

  // Trim old turns beyond memory cap (idempotent)
  const all = await db.voiceMessage.findMany({
    where: { userId, sessionId },
    orderBy: { createdAt: "desc" },
    skip: MAX_MEMORY_TURNS * 2,
    select: { id: true },
  });
  if (all.length > 0) {
    await db.voiceMessage.deleteMany({ where: { id: { in: all.map((r) => r.id) } } });
  }
}

/** Build the "previous turns" string Claude reads as context. */
export function formatContextForPrompt(turns: VoiceTurn[]): string {
  if (turns.length === 0) return "(no prior conversation in this session)";
  return turns
    .map((t) => {
      const intent = t.intent ? ` [intent=${t.intent}]` : "";
      const action = t.action ? ` [action=${t.action}]` : "";
      return `${t.role.toUpperCase()}${intent}${action}: ${t.content}`;
    })
    .join("\n");
}
