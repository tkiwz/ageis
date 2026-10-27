import { NextResponse } from "next/server";
import { STATIONS, getModelSkill, maybeRunVerification } from "@/lib/observatory/calibration";
import { MODELS } from "@/lib/observatory/models";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Public: how each global model has scored against Oman's airports, and the weights the rain blend uses. */
export async function GET() {
  await maybeRunVerification();
  try {
    const skill = await getModelSkill();
    return NextResponse.json({
      ok: true,
      data: { ...skill, stations: STATIONS.map((s) => ({ icao: s.icao, name: s.name, nameAr: s.nameAr })), names: MODELS },
    }, { headers: { "Cache-Control": "public, s-maxage=1800, stale-while-revalidate=21600" } });
  } catch {
    return NextResponse.json({ ok: false, error: { code: "UNAVAILABLE", message: "Accuracy unavailable" } }, { status: 503 });
  }
}
