import { NextResponse } from "next/server";
import { getActiveCyclones } from "@/lib/observatory/cyclones";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Public: active tropical cyclones around the Arabian Sea / North Indian Ocean (GDACS). */
export async function GET() {
  try {
    const cyclones = await getActiveCyclones();
    return NextResponse.json({ ok: true, data: { cyclones, source: "GDACS (EC JRC) · JTWC" } }, {
      headers: { "Cache-Control": "public, s-maxage=900, stale-while-revalidate=1800" },
    });
  } catch {
    return NextResponse.json({ ok: false, error: { code: "UPSTREAM", message: "Cyclone data unavailable" } }, { status: 503 });
  }
}
