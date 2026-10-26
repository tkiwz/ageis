/**
 * Zhipu GLM client (OpenAI-compatible chat API) — used as the fallback
 * provider when Claude is unavailable (no credit, invalid key, overloaded).
 *
 * Env: ZHIPU_API_KEY (required to enable), GLM_MODEL (default glm-4.5-flash, free),
 *      GLM_BASE_URL (default https://open.bigmodel.cn/api/paas/v4).
 */

export const GLM_MODEL = process.env.GLM_MODEL ?? "glm-4.5-flash";
const BASE_URL = process.env.GLM_BASE_URL ?? "https://open.bigmodel.cn/api/paas/v4";

export function glmEnabled(): boolean {
  return Boolean(process.env.ZHIPU_API_KEY);
}

interface GlmChatOptions {
  system: string;
  messages: { role: "user" | "assistant"; content: string }[];
  maxTokens?: number;
  temperature?: number;
  /** Override GLM_MODEL for this call. */
  model?: string;
}

export async function glmChat(opts: GlmChatOptions) {
  const apiKey = process.env.ZHIPU_API_KEY;
  if (!apiKey) throw new Error("ZHIPU_API_KEY is not set");
  const started = Date.now();

  const res = await fetch(`${BASE_URL}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: opts.model ?? GLM_MODEL,
      messages: [{ role: "system", content: opts.system }, ...opts.messages],
      // GLM-4.5 "thinks" by default and spends the token budget on it — answer directly.
      thinking: { type: "disabled" },
      max_tokens: opts.maxTokens ?? 1024,
      // GLM requires temperature in (0, 1)
      temperature: Math.min(0.99, Math.max(0.01, opts.temperature ?? 0.7)),
    }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`GLM ${res.status}: ${body.slice(0, 200)}`);
  }
  const data = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };

  return {
    content: data.choices?.[0]?.message?.content ?? "",
    model: opts.model ?? GLM_MODEL,
    usage: { inputTokens: data.usage?.prompt_tokens ?? 0, outputTokens: data.usage?.completion_tokens ?? 0 },
    durationMs: Date.now() - started,
  };
}
