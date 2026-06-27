import { NextRequest } from "next/server";
import { auth } from "@/auth";
import { ok, fail } from "@/lib/api-response";
import { db } from "@/lib/db";
import { claudeChat } from "@/lib/ai/claude-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const GOOGLE_API_KEY = process.env.GOOGLE_AI_API_KEY;
const VEO_MODEL = "veo-3.1-fast-generate-preview";

const VIDEO_DIRECTOR_SYSTEM = `You are a senior HSSE training video director for Omani oil and gas operations.

Convert incident reports into cinematic prompts for Veo 3.1 video generation.

CRITICAL RULES:
1. Single 8-second continuous shot, NO scene changes
2. SHOW the CORRECT safety response, NEVER recreate accidents or injuries
3. Workers in proper PPE: orange/red hardhats, FR coveralls, safety glasses, gloves, steel-toed boots
4. Setting: Omani desert oil and gas facility (wellheads, pipelines, tank farms), golden hour, dramatic warm light
5. Style: Professional documentary realism (Shell or BP training film), not Hollywood drama
6. Length: 80-120 words
7. Native audio cues: include ambient sounds (radio chatter, wind through facility, distant machinery)
8. Use VISIBLE indicators: gas monitors with flashing red lights, warning signs, yellow caution tape, hazard barriers
9. Show calm, deliberate, trained behavior. The worker is competent and follows protocol.

FORMAT: Single paragraph. Start directly with camera shot. Include action, audio cues, and style.`;

function buildVideoPrompt(incident: {
  title: string;
  description?: string;
  type?: string;
  severity?: string;
  siteName?: string;
}): string {
  return `INCIDENT TO TRAIN ON:

Title: ${incident.title}
Type: ${incident.type ?? "Safety incident"}
Severity: ${incident.severity ?? "MEDIUM"}
Site: ${incident.siteName ?? "Omani oil and gas facility"}
Description: ${incident.description ?? "Hazardous situation requiring proper response"}

Create an 8-second Veo 3.1 training video prompt that DEMONSTRATES the correct safety response.

Show:
1. Worker identifies hazard via visible indicator
2. Calm response: PPE check, hand signal, retreat, radio call
3. Backup arrives in full PPE, scene secured

Include audio cues (radio chatter, ambient facility sounds, footsteps).
show the accident itself. Show competence and protocol.
Output as a single cinematic paragraph (100 - 200 words).`;
}

async function submitToVeo(prompt: string): Promise<string> {
  if (!GOOGLE_API_KEY) throw new Error("GOOGLE_AI_API_KEY not set");

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${VEO_MODEL}:predictLongRunning?key=${GOOGLE_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        instances: [{ prompt }],
        parameters: {
          aspectRatio: "16:9",
          durationSeconds: 8,
          personGeneration: "allow_all",
        },
      }),
    }
  );

  const data = await res.json();
  if (!res.ok) {
    console.error("[veo] submit error:", JSON.stringify(data));
    throw new Error(data?.error?.message ?? `Veo error ${res.status}`);
  }
  console.log("[veo] operation:", data.name);
  return data.name as string;
}

interface VideoGenRequest {
  incidentId?: string;
  title?: string;
  description?: string;
  type?: string;
  severity?: string;
  siteName?: string;
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return fail("UNAUTHORIZED", "Sign in required", 401);

  let body: VideoGenRequest;
  try { body = await req.json(); }
  catch { return fail("INVALID_BODY", "Invalid JSON", 400); }

  let incidentData: {
    title: string;
    description?: string;
    type?: string;
    severity?: string;
    siteName?: string;
  };

  if (body.incidentId) {
    const incident = await db.incident.findUnique({
      where: { id: body.incidentId },
      include: { site: true },
    });
    if (!incident) return fail("NOT_FOUND", "Incident not found", 404);
    incidentData = {
      title:       incident.title,
      description: incident.description ?? undefined,
      type:        incident.type,
      severity:    incident.severity,
      siteName:    incident.site?.name,
    };
  } else if (body.title) {
    incidentData = { ...body, title: body.title };
  } else {
    return fail("MISSING_FIELDS", "incidentId or title required", 400);
  }

  // Step 1: Claude crafts the prompt
  let videoPrompt: string;
  try {
    const result = await claudeChat({
      system: VIDEO_DIRECTOR_SYSTEM,
      messages: [{ role: "user", content: buildVideoPrompt(incidentData) }],
      maxTokens: 500,
      temperature: 0.85,
    });
    videoPrompt = result.content.trim();
    console.log("[veo] prompt:", videoPrompt.slice(0, 200) + "...");
  } catch (err) {
    return fail("PROMPT_FAILED", err instanceof Error ? err.message : String(err), 500);
  }

  if (!GOOGLE_API_KEY) {
    return ok({
      status: "PROMPT_ONLY",
      videoPrompt,
      predictionId: null,
      videoUrl: null,
      message: "Add GOOGLE_AI_API_KEY with billing enabled.",
    });
  }

  // Step 2: Submit to Veo
  let operationName: string;
  try {
    operationName = await submitToVeo(videoPrompt);
  } catch (err) {
    return fail("VIDEO_FAILED", err instanceof Error ? err.message : String(err), 500);
  }

  // Extract just the operation ID (last segment) — clean URL-safe value
  const operationId = operationName.split("/").pop() ?? operationName;

  return ok({
    status: "PROCESSING",
    videoPrompt,
    predictionId: operationId,
    videoUrl: null,
    message: "Veo 3 is generating the video (60-180 seconds)...",
  });
}