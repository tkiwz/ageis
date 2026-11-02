/**
 * Live readings from Oman's airport weather stations (METAR, aviationweather.gov).
 * These are measurements, not forecasts. Cached 10 minutes.
 */
import { unstable_cache } from "next/cache";

const NAMES_AR: Record<string, string> = {
  OOMS: "مسقط", OOSA: "صلالة", OOSH: "صحار", OODQ: "الدقم", OOKB: "خصب", OOAD: "أدم", OOMA: "مصيرة", OOTH: "ثمريت",
};
const NAMES_EN: Record<string, string> = {
  OOMS: "Muscat", OOSA: "Salalah", OOSH: "Sohar", OODQ: "Duqm", OOKB: "Khasab", OOAD: "Adam", OOMA: "Masirah", OOTH: "Thumrait",
};

export interface StationReading {
  icao: string; name: string; nameAr: string; lat: number; lon: number;
  time: string; temp: number | null; dew: number | null;
  windKmh: number | null; windDir: number | null; gustKmh: number | null;
  visibilityKm: number | null; weather: string | null;
}

interface Metar {
  icaoId: string; lat: number; lon: number; reportTime: string; temp?: number | null; dewp?: number | null;
  wspd?: number | null; wdir?: number | string | null; wgst?: number | null; visib?: number | string | null; wxString?: string | null;
}

async function fetchStations(): Promise<StationReading[]> {
  const r = await fetch(`https://aviationweather.gov/api/data/metar?ids=${Object.keys(NAMES_AR).join(",")}&hours=3&format=json`, {
    cache: "no-store", signal: AbortSignal.timeout(20_000),
  });
  if (!r.ok) throw new Error(`aviationweather ${r.status}`);
  const all = (await r.json()) as Metar[];
  const latest = new Map<string, Metar>();
  for (const m of all) if (!latest.has(m.icaoId) || m.reportTime > latest.get(m.icaoId)!.reportTime) latest.set(m.icaoId, m);
  const kt = (v: number | null | undefined) => (typeof v === "number" ? Math.round(v * 1.852) : null);
  return [...latest.values()].map((m) => ({
    icao: m.icaoId, name: NAMES_EN[m.icaoId] ?? m.icaoId, nameAr: NAMES_AR[m.icaoId] ?? m.icaoId,
    lat: m.lat, lon: m.lon, time: m.reportTime,
    temp: m.temp ?? null, dew: m.dewp ?? null,
    windKmh: kt(m.wspd), windDir: typeof m.wdir === "number" ? m.wdir : null, gustKmh: kt(m.wgst),
    // METAR visibility is in statute miles ("6+" = 10 km or more)
    visibilityKm: m.visib === "6+" ? 10 : typeof m.visib === "number" ? Math.round(m.visib * 1.609) : null,
    weather: m.wxString ?? null,
  }));
}

export const getStations = unstable_cache(fetchStations, ["observatory-stations-v1"], { revalidate: 600 });
