import { NextResponse } from "next/server";
import { getWaves } from "@/lib/observatory/marine";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Public: wave height around Oman, 7 days. */
export async function GET() {
  try {
    return NextResponse.json({ ok: true, data: await getWaves() }, { headers: { "Cache-Control": "public, s-maxage=1800, stale-while-revalidate=10800" } });
  } catch {
    return NextResponse.json({ ok: false, error: { code: "UPSTREAM", message: "Waves unavailable" } }, { status: 503 });
  }
}
