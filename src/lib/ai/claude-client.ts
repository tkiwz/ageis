import Anthropic from "@anthropic-ai/sdk";
import { glmChat, glmEnabled } from "./glm-client";

const CLAUDE_MODEL = process.env.CLAUDE_MODEL ?? "claude-sonnet-4-6";

let _client: Anthropic | null = null;

function getClient(): Anthropic {
  if (_client) return _client;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error(
      "ANTHROPIC_API_KEY is not set. Add it to your .env file.",
    );
  }
  _client = new Anthropic({ apiKey });
  return _client;
}

interface ChatOptions {
  /** GLM model to use if this call falls back (default GLM_MODEL). */
  glmModel?: string;
  system: string;
  messages: { role: "user" | "assistant"; content: string }[];
  maxTokens?: number;
  temperature?: number;
}

interface ChatResult {
  content: string;
  model: string;
  usage: {
    inputTokens: number;
    outputTokens: number;
  };
  durationMs: number;
}

/**
 * Claude errors that mean "this provider can't serve us right now" —
 * no credit / billing, bad key, rate limit, overload, server or network error.
 * For these we fall back to GLM (if configured).
 */
function isProviderUnavailable(err: unknown): boolean {
  const e = err as { status?: number; message?: string };
  const status = e?.status;
  const msg = String(e?.message ?? "").toLowerCase();
  if (!status) return true; // network / missing key
  if (status === 400 && /credit|billing|balance|quota/.test(msg)) return true;
  return [401, 402, 403, 429, 500, 502, 503, 504, 529].includes(status);
}

// After a provider failure, skip Claude for a while instead of failing every call.
const CLAUDE_COOLDOWN_MS = 10 * 60 * 1000;
let claudeDownUntil = 0;

/**
 * Chat with Claude; if Claude is unavailable (e.g. out of credit) and
 * ZHIPU_API_KEY is set, answer with GLM instead. result.model says which.
 */
export async function claudeChat(opts: ChatOptions): Promise<ChatResult> {
  const fallback = () => glmChat({ ...opts, model: opts.glmModel });
  if (glmEnabled() && (Date.now() < claudeDownUntil || !process.env.ANTHROPIC_API_KEY)) {
    return fallback();
  }
  try {
    return await claudeOnly(opts);
  } catch (err) {
    if (!glmEnabled() || !isProviderUnavailable(err)) throw err;
    claudeDownUntil = Date.now() + CLAUDE_COOLDOWN_MS;
    console.warn("[ai] Claude unavailable, using GLM fallback:", (err as Error)?.message?.slice(0, 120));
    return fallback();
  }
}

async function claudeOnly(opts: ChatOptions): Promise<ChatResult> {
  const client = getClient();
  const started = Date.now();

  const response = await client.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: opts.maxTokens ?? 1024,
    temperature: opts.temperature ?? 0.7,
    system: opts.system,
    messages: opts.messages,
  });

  const duration = Date.now() - started;

  const textContent = response.content
    .filter((b) => b.type === "text")
    .map((b) => (b as { type: "text"; text: string }).text)
    .join("\n");

  return {
    content: textContent,
    model: CLAUDE_MODEL,
    usage: {
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
    },
    durationMs: duration,
  };
}

export { CLAUDE_MODEL };
