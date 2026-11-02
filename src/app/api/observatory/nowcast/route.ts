import { NextResponse } from "next/server";
import { getNowcast } from "@/lib/observatory/nowcast";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Public: storm clouds forming right now, from Meteosat infrared (refreshed every 10 min). */
export async function GET() {
  try {
    const data = await getNowcast();
    return NextResponse.json({ ok: true, data }, { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" } });
  } catch {
    return NextResponse.json({ ok: false, error: { code: "UPSTREAM", message: "Satellite unavailable" } }, { status: 503 });
  }
}
