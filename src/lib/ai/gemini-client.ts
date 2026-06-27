import { GoogleGenerativeAI } from "@google/generative-ai";

const GEMINI_FLASH_MODEL = process.env.GEMINI_FLASH_MODEL ?? "gemini-2.5-flash";

let _client: GoogleGenerativeAI | null = null;

function getClient(): GoogleGenerativeAI {
  if (_client) return _client;
  // GEMINI_API_KEY  -> Gemini Flash / vision (free tier, high volume)
  // GOOGLE_AI_API_KEY -> fallback (shared with Veo if only one key available)
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "GEMINI_API_KEY is not set. Get a free key from aistudio.google.com/app/apikey and add it to .env"
    );
  }
  _client = new GoogleGenerativeAI(apiKey);
  return _client;
}

interface GeminiOptions {
  system?: string;
  prompt: string;
  maxTokens?: number;
  temperature?: number;
  responseFormat?: "text" | "json";
}

interface GeminiResult {
  content: string;
  model: string;
  tokensInput: number;
  tokensOutput: number;
  durationMs: number;
}

export async function geminiGenerate(opts: GeminiOptions): Promise<GeminiResult> {
  const client = getClient();
  const started = Date.now();

  const model = client.getGenerativeModel({
    model: GEMINI_FLASH_MODEL,
    systemInstruction: opts.system,
    generationConfig: {
      maxOutputTokens: opts.maxTokens ?? 1024,
      temperature: opts.temperature ?? 0.4,
      responseMimeType: opts.responseFormat === "json" ? "application/json" : "text/plain",
    },
  });

  const result = await model.generateContent(opts.prompt);
  const response = result.response;
  const text = response.text();
  const usage = response.usageMetadata;
  return {
    content: text,
    model: GEMINI_FLASH_MODEL,
    tokensInput: usage?.promptTokenCount ?? 0,
    tokensOutput: usage?.candidatesTokenCount ?? 0,
    durationMs: Date.now() - started,
  };
}

export { GEMINI_FLASH_MODEL };
