/**
 * Incident training videos (Google Veo) — cost-aware:
 *  - one video per incident, stored in the DB and reused (no repeat charge)
 *  - the brief (Veo prompt + AR/EN summary + lessons) is one Claude call
 *    (~$0.01, best Arabic); claudeChat falls back to GLM if Claude is down
 *  - Veo 3.1 Fast (cheapest Veo tier), 1080p, 8 s, negative prompt for quality
 *  - the Google key stays on the server; the browser streams from our API
 */
import { claudeChat } from "@/lib/ai/claude-client";

export const VEO_MODEL = process.env.VEO_MODEL ?? "veo-3.1-fast-generate-preview";
const VEO_RESOLUTION = process.env.VEO_RESOLUTION ?? "1080p"; // 1080p requires 8 s, 16:9
const VEO_SECONDS = 8;
/** Approx. Veo 3.1 Fast price per second (USD) — shown to the user before generating. */
export const VEO_USD_PER_SECOND = Number(process.env.VEO_USD_PER_SECOND ?? 0.15);
export const VEO_ESTIMATED_USD = Math.round(VEO_USD_PER_SECOND * VEO_SECONDS * 100) / 100;

const API = "https://generativelanguage.googleapis.com/v1beta";
const key = () => process.env.GOOGLE_AI_API_KEY ?? process.env.GEMINI_API_KEY ?? "";
export const veoConfigured = () => Boolean(key());

const NEGATIVE = [
  "injury, blood, gore, fire spreading onto people, explosion casualties",
  "distorted faces, extra limbs, warped hands, melting objects, flickering",
  "text overlays, subtitles, watermarks, logos, cartoon, low resolution, blurry",
].join(", ");

const BRIEF_SYSTEM = `You are an HSSE training video director and safety writer for oil and gas operations in Oman.
Return ONLY a JSON object, no markdown, with exactly these keys:
{
 "prompt": "English Veo prompt, 120-170 words, one continuous 8-second shot",
 "summaryEn": "2-3 sentences: what happened and why it matters",
 "summaryAr": "the same summary in clear professional Arabic",
 "lessonsEn": ["3 short correct actions"],
 "lessonsAr": ["the same 3 actions in Arabic"]
}
Rules for "prompt":
- Show the CORRECT safety response, never the accident, injuries or panic.
- Realistic Omani desert oil and gas site matching the incident (wellheads, pipelines, compressors, tank farm), true-to-life equipment.
- Workers in full PPE: hard hat, FR coveralls, safety glasses, gloves, boots; competent and calm.
- Visible cues: gas detector alarm light, warning signs, barrier tape, wind sock.
- Camera: specify lens (e.g. 35mm), movement (slow dolly or steady handheld), framing, golden-hour or overcast light, photorealistic documentary style, 4K detail, natural colours.
- Audio: radio call, wind, distant machinery, detector beep. No music, no on-screen text.
Safety facts that must be correct in every field:
- Gas releases (H2S, hydrocarbons): evacuate UPWIND or CROSSWIND to the muster point, never downwind (Arabic: عكس اتجاه الرياح أو بشكل جانبي له).
- Never re-enter until the area is declared safe by an authorised person.
- Lessons are short imperative actions; Arabic must be correct Modern Standard Arabic with no words from other languages.`;

export interface VideoBrief {
  prompt: string;
  summaryEn: string;
  summaryAr: string;
  lessonsEn: string[];
  lessonsAr: string[];
}

export async function writeBrief(incident: {
  title: string;
  description?: string | null;
  type?: string | null;
  severity?: string | null;
  location?: string | null;
  siteName?: string | null;
}): Promise<VideoBrief & { model: string }> {
  const user = `Incident:
Title: ${incident.title}
Type: ${incident.type ?? "Safety incident"}
Severity: ${incident.severity ?? "MEDIUM"}
Site: ${incident.siteName ?? "Oil and gas facility, Oman"}
Location: ${incident.location ?? "-"}
Description: ${incident.description ?? "-"}`;
  // Fallback model with strong Arabic (≈$0.003 per brief)
  const opts = { glmModel: process.env.GLM_BRIEF_MODEL ?? "glm-4.6", system: BRIEF_SYSTEM, messages: [{ role: "user" as const, content: user }], maxTokens: 900, temperature: 0.6 };
  // Claude for quality (Arabic); claudeChat itself falls back to GLM when Claude is unavailable
  const res = await claudeChat(opts);
  const json = res.content.slice(res.content.indexOf("{"), res.content.lastIndexOf("}") + 1);
  const b = JSON.parse(json) as Partial<VideoBrief>;
  if (!b.prompt || b.prompt.length < 40) throw new Error("Brief has no prompt");
  return {
    prompt: b.prompt.trim(),
    summaryEn: b.summaryEn?.trim() ?? "",
    summaryAr: b.summaryAr?.trim() ?? "",
    lessonsEn: (b.lessonsEn ?? []).slice(0, 5),
    lessonsAr: (b.lessonsAr ?? []).slice(0, 5),
    model: res.model,
  };
}

/** Start Veo generation; returns the operation id. This is the only paid call. */
export async function submitVeo(prompt: string): Promise<string> {
  const res = await fetch(`${API}/models/${VEO_MODEL}:predictLongRunning`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": key() },
    body: JSON.stringify({
      instances: [{ prompt }],
      parameters: {
        aspectRatio: "16:9",
        resolution: VEO_RESOLUTION,
        durationSeconds: VEO_SECONDS,
        negativePrompt: NEGATIVE,
        personGeneration: "allow_all",
      },
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error?.message ?? `Veo ${res.status}`);
  return String(data.name).split("/").pop()!;
}

/** Free: confirms the key works and the model is available (no generation). */
export async function checkVeo(): Promise<boolean> {
  const r = await fetch(`${API}/models/${VEO_MODEL}`, { headers: { "x-goog-api-key": key() } }).catch(() => null);
  return Boolean(r?.ok);
}

type Poll = { done: false } | { done: true; error: string } | { done: true; bytes: Buffer; mimeType: string };

/** Poll an operation; when done, download the video on the server. */
export async function pollVeo(operationId: string): Promise<Poll> {
  const r = await fetch(`${API}/models/${VEO_MODEL}/operations/${operationId}`, { headers: { "x-goog-api-key": key() } });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) return { done: true, error: data?.error?.message ?? `status ${r.status}` };
  if (!data.done) return { done: false };
  if (data.error) return { done: true, error: data.error.message ?? "Generation failed" };
  const uri: string | undefined =
    data?.response?.generateVideoResponse?.generatedSamples?.[0]?.video?.uri ??
    data?.response?.generatedVideos?.[0]?.video?.uri;
  if (!uri) {
    const filtered = data?.response?.generateVideoResponse?.raiMediaFilteredReasons?.[0];
    return { done: true, error: filtered ?? "No video in response" };
  }
  const file = await fetch(uri, { headers: { "x-goog-api-key": key() }, redirect: "follow" });
  if (!file.ok) return { done: true, error: `download ${file.status}` };
  return { done: true, bytes: Buffer.from(await file.arrayBuffer()), mimeType: file.headers.get("content-type") ?? "video/mp4" };
}
