// /api/voice/transcribe
// Accepts an audio blob (MediaRecorder output) and returns a text transcript
// via the Groq Whisper API.
// Requires GROQ_API_KEY in .env  (free tier at console.groq.com -- no card).

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BYTES = 24 * 1024 * 1024; // Groq limit is 25 MB

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "GROQ_API_KEY not set. Get a free key at console.groq.com then add GROQ_API_KEY=... to your .env file.",
      },
      { status: 503 }
    );
  }

  try {
    const formData  = await req.formData();
    const audioFile = formData.get("audio") as File | null;
    const lang      = (formData.get("lang") as string | null) ?? "en";

    if (!audioFile)
      return NextResponse.json({ ok: false, error: "No audio provided" }, { status: 400 });
    if (audioFile.size === 0)
      return NextResponse.json({ ok: false, error: "Audio is empty" }, { status: 400 });
    if (audioFile.size > MAX_BYTES)
      return NextResponse.json({ ok: false, error: "Audio too large (max 24 MB)" }, { status: 413 });

    // Map app lang to Whisper language hint
    const langMap: Record<string, string> = { en: "en", ar: "ar", ur: "ur", ne: "ne" };
    const langHint = langMap[lang] ?? "en";

    // Call Groq Whisper
    const groqForm = new FormData();
    groqForm.append("file", audioFile, audioFile.name || "recording.webm");
    groqForm.append("model", "whisper-large-v3-turbo"); // fastest + highest quality
    groqForm.append("language", langHint);
    groqForm.append("response_format", "json");

    const groqRes = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: "Bearer " + apiKey },
      body: groqForm,
    });

    if (!groqRes.ok) {
      const errBody = await groqRes.text().catch(() => "");
      console.error("[voice/transcribe] Groq error:", groqRes.status, errBody);
      return NextResponse.json(
        { ok: false, error: "Transcription failed (HTTP " + String(groqRes.status) + ")" },
        { status: 502 }
      );
    }

    const result     = (await groqRes.json()) as { text?: string };
    const transcript = result.text?.trim() ?? "";

    if (!transcript) {
      return NextResponse.json({ ok: false, error: "No speech detected" }, { status: 422 });
    }

    return NextResponse.json({ ok: true, data: { transcript } });
  } catch (err) {
    console.error("[voice/transcribe] Error:", err);
    return NextResponse.json({ ok: false, error: "Internal server error" }, { status: 500 });
  }
}
