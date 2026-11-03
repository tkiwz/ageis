import { NextResponse } from "next/server";
import { getQuakes } from "@/lib/observatory/quakes";

export const runtime = "nodejs";

/** Public: earthquakes around Oman, last 30 days. */
export async function GET() {
  try {
    return NextResponse.json({ ok: true, data: { quakes: await getQuakes() } }, { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=900" } });
  } catch {
    return NextResponse.json({ ok: false, error: { code: "UPSTREAM", message: "Earthquakes unavailable" } }, { status: 503 });
  }
}
