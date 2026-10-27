import { NextResponse } from "next/server";
import { getForecastGrid } from "@/lib/observatory/grid";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Public, read-only: the 7-day forecast grid. Cached on the CDN, so it is cheap to open. */
export async function GET() {
  try {
    const grid = await getForecastGrid();
    return NextResponse.json({ ok: true, data: grid }, {
      headers: { "Cache-Control": "public, s-maxage=1800, stale-while-revalidate=10800" },
    });
  } catch {
    return NextResponse.json({ ok: false, error: { code: "UPSTREAM", message: "Forecast unavailable" } }, { status: 503 });
  }
}
