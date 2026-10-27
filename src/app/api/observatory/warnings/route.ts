import { NextResponse } from "next/server";
import { getForecastGrid } from "@/lib/observatory/grid";
import { computeWarnings } from "@/lib/observatory/warnings";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Public, read-only: yellow / orange / red warnings per governorate for the next 7 days. */
export async function GET() {
  try {
    const result = computeWarnings(await getForecastGrid());
    return NextResponse.json({ ok: true, data: result }, {
      headers: { "Cache-Control": "public, s-maxage=1800, stale-while-revalidate=10800" },
    });
  } catch {
    return NextResponse.json({ ok: false, error: { code: "UPSTREAM", message: "Warnings unavailable" } }, { status: 503 });
  }
}
