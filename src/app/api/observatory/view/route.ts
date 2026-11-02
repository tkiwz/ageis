import { NextRequest, NextResponse } from "next/server";
import { getViewGrid, snapView } from "@/lib/observatory/grid";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Public: 7-day forecast grid for any box of the world, ?bbox=lat0,lon0,lat1,lon1 (snapped and cached). */
export async function GET(req: NextRequest) {
  const parts = (req.nextUrl.searchParams.get("bbox") ?? "").split(",").map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) {
    return NextResponse.json({ ok: false, error: { code: "VALIDATION", message: "bbox=lat0,lon0,lat1,lon1" } }, { status: 400 });
  }
  const [a, b, c, d] = parts;
  const v = snapView(Math.min(a, c), Math.min(b, d), Math.max(a, c), Math.max(b, d));
  try {
    const grid = await getViewGrid(v.lat0, v.lon0, v.lat1, v.lon1, v.step);
    return NextResponse.json({ ok: true, data: grid }, { headers: { "Cache-Control": "public, s-maxage=1800, stale-while-revalidate=10800" } });
  } catch (err) {
    console.warn("[observatory/view]", err instanceof Error ? err.message : err);
    return NextResponse.json({ ok: false, error: { code: "UPSTREAM", message: "Forecast unavailable" } }, { status: 503 });
  }
}
