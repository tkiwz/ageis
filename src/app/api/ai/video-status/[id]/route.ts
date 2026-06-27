import { NextRequest } from "next/server";
import { auth } from "@/auth";
import { ok, fail } from "@/lib/api-response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const GOOGLE_API_KEY = process.env.GOOGLE_AI_API_KEY;
const VEO_MODEL = "veo-3.1-fast-generate-preview";

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) return fail("UNAUTHORIZED", "Sign in required", 401);
  if (!GOOGLE_API_KEY) return fail("NO_KEY", "GOOGLE_AI_API_KEY not set", 500);

  const { id } = await ctx.params;

  // Reconstruct full operation name from the ID
  const operationName = `models/${VEO_MODEL}/operations/${id}`;
  const url = `https://generativelanguage.googleapis.com/v1beta/${operationName}?key=${GOOGLE_API_KEY}`;

  console.log("[veo status] polling:", operationName);

  const res = await fetch(url, { method: "GET" });
  const data = await res.json();

  if (!res.ok) {
    console.error("[veo status] error:", JSON.stringify(data).slice(0, 500));
    return fail("STATUS_ERROR", data?.error?.message ?? `Check failed (${res.status})`, 500);
  }

  if (!data.done) {
    return ok({ status: "PROCESSING", videoUrl: null });
  }

  // Done — try multiple response shapes
  const videoUri =
    data?.response?.generateVideoResponse?.generatedSamples?.[0]?.video?.uri ??
    data?.response?.generatedVideos?.[0]?.video?.uri ??
    data?.response?.generated_videos?.[0]?.video?.uri ??
    data?.response?.videos?.[0]?.uri;

  if (!videoUri) {
    console.error("[veo status] no video in response:", JSON.stringify(data).slice(0, 1000));
    return fail("NO_VIDEO", "Video URI not found in response", 500);
  }

  // Append API key for client access
  const videoUrl = videoUri.includes("?")
    ? `${videoUri}&key=${GOOGLE_API_KEY}`
    : `${videoUri}?key=${GOOGLE_API_KEY}`;

  console.log("[veo status] completed:", videoUrl.slice(0, 100));
  return ok({ status: "COMPLETED", videoUrl });
}