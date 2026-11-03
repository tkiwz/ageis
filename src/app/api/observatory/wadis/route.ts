import { NextResponse } from "next/server";
import { getWadiRisk } from "@/lib/observatory/wadi-risk";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Public: named wadis expected to flow in the next 7 days, with their road crossings. */
export async function GET() {
  try {
    return NextResponse.json({ ok: true, data: await getWadiRisk() }, { headers: { "Cache-Control": "public, s-maxage=900, stale-while-revalidate=3600" } });
  } catch {
    return NextResponse.json({ ok: false, error: { code: "UPSTREAM", message: "Wadi risk unavailable" } }, { status: 503 });
  }
}
