import { NextRequest, NextResponse } from "next/server";
import { getPlaceForecast } from "@/lib/observatory/place";

export const runtime = "nodejs";
export const maxDuration = 30;

/** Public: hourly + daily forecast for one wilayat, ?id=osm-… */
export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id") ?? "";
  if (!/^osm-\d{1,12}$/.test(id)) return NextResponse.json({ ok: false, error: { code: "VALIDATION", message: "id required" } }, { status: 400 });
  try {
    const data = await getPlaceForecast(id);
    if (!data) return NextResponse.json({ ok: false, error: { code: "NOT_FOUND", message: "Unknown place" } }, { status: 404 });
    return NextResponse.json({ ok: true, data }, { headers: { "Cache-Control": "public, s-maxage=1800, stale-while-revalidate=3600" } });
  } catch {
    return NextResponse.json({ ok: false, error: { code: "UPSTREAM", message: "Forecast unavailable" } }, { status: 503 });
  }
}
