import { NextRequest } from "next/server";
import { auth } from "@/auth";
import { ok, fail } from "@/lib/api-response";
import { claudeChat } from "@/lib/ai/claude-client";
import { AEGIS_SYSTEM_PROMPT } from "@/lib/ai/prompt-templates";
import type { ChatRequest, ChatResponse } from "@/types/ai";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return fail("UNAUTHORIZED", "Sign in required", 401);
  }

  let body: ChatRequest;
  try {
    body = (await req.json()) as ChatRequest;
  } catch {
    return fail("INVALID_BODY", "Invalid JSON", 400);
  }

  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    return fail("INVALID_MESSAGES", "messages array required", 400);
  }

  for (const msg of body.messages) {
    if (!["user", "assistant"].includes(msg.role) || typeof msg.content !== "string") {
      return fail("INVALID_MESSAGE", "Each message needs role and content", 400);
    }
  }

  // Truncate to last 20 messages to control token usage
  const messages = body.messages.slice(-20);

  try {
    const result = await claudeChat({
      system: AEGIS_SYSTEM_PROMPT,
      messages,
      maxTokens: 1024,
      temperature: 0.7,
    });

    const response: ChatResponse = {
      content: result.content,
      model: result.model,
      usage: result.usage,
    };

    return ok(response);
  } catch (err) {
    console.error("[/api/ai/chat] error:", err);
    const message = err instanceof Error ? err.message : "AI request failed";
    return fail("AI_ERROR", message, 500);
  }
}
