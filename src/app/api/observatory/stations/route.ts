import { NextResponse } from "next/server";
import { getStations } from "@/lib/observatory/stations";

export const runtime = "nodejs";

/** Public: latest measured weather at Oman's airport stations (METAR). */
export async function GET() {
  try {
    return NextResponse.json({ ok: true, data: { stations: await getStations() } }, {
      headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=900" },
    });
  } catch {
    return NextResponse.json({ ok: false, error: { code: "UPSTREAM", message: "Stations unavailable" } }, { status: 503 });
  }
}
